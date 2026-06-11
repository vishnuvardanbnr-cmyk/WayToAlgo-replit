import { Router } from "express";
import { ethers } from "ethers";
import { db, usersTable, platformSettingsTable, incomeTable, tokenSalesTable, tokenRewardsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { resolveKey } from "../lib/keyEncryption.js";
import { getTokenPrices, sellTokens, isValidAddress, TOKEN_DECIMALS } from "../lib/tokenChain";
import { logger } from "../lib/logger";

const router = Router();

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UPLINE_LEVELS = 10; // must match BondingCurveToken.LEVELS
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * GET /api/token/upline
 *
 * Returns the current user's ordered upline sponsor wallet addresses, level 1
 * (direct sponsor) first, up to UPLINE_LEVELS deep. These are passed by the
 * frontend into the on-chain `buy()` so the contract pays each sponsor their
 * configured per-level token reward. Levels with no sponsor or no valid wallet
 * are returned as the zero address (the contract skips them).
 *
 * This is read-only and isolated from all off-chain balance flows.
 */
router.get("/token/upline", requireAuth, async (req, res) => {
  const user = (req as any).user;

  const addresses: string[] = [];
  let currentSponsorId: number | null = user.sponsorId ?? null;
  const seen = new Set<number>([user.id]);

  for (let level = 0; level < UPLINE_LEVELS; level++) {
    if (currentSponsorId == null || seen.has(currentSponsorId)) {
      addresses.push(ZERO_ADDRESS);
      currentSponsorId = null;
      continue;
    }
    seen.add(currentSponsorId);

    const [sponsor] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, currentSponsorId))
      .limit(1);

    if (!sponsor) {
      addresses.push(ZERO_ADDRESS);
      currentSponsorId = null;
      continue;
    }

    const wallet = (sponsor.walletAddress || "").trim();
    addresses.push(ADDR_RE.test(wallet) ? wallet : ZERO_ADDRESS);
    currentSponsorId = sponsor.sponsorId ?? null;
  }

  res.json({ levels: UPLINE_LEVELS, addresses });
});

/**
 * GET /api/token/info
 *
 * Public-to-authed live status of the ROI-token cycle: whether the contract is
 * configured and the current on-chain buy/sell prices. Used by the Wallet page
 * to show the live sell price and value.
 */
router.get("/token/info", requireAuth, async (_req, res) => {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const contractAddress = (settings?.tokenContractAddress || "").trim();
  if (!settings || !isValidAddress(contractAddress)) {
    res.json({ configured: false, buyPrice: "0", sellPrice: "0" });
    return;
  }
  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";
  try {
    const prices = await getTokenPrices(contractAddress, rpcUrl);
    res.json({ configured: true, contractAddress, buyPrice: prices.buyPrice, sellPrice: prices.sellPrice });
  } catch (err: any) {
    logger.warn({ err }, "token/info price read failed");
    res.json({ configured: true, contractAddress, buyPrice: "0", sellPrice: "0", priceError: true });
  }
});

/**
 * GET /api/token/my
 *
 * The current user's virtual ROI-token balance, its live USD value at the
 * contract sell price, and recent reward/sale history.
 */
router.get("/token/my", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  const balance = fresh?.roiTokenBalance || "0";

  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const contractAddress = (settings?.tokenContractAddress || "").trim();
  let sellPrice = "0";
  let valueUsd = "0";
  let configured = false;
  if (settings && isValidAddress(contractAddress)) {
    configured = true;
    try {
      const prices = await getTokenPrices(contractAddress, settings.bscRpcUrl || "https://bsc-dataseed.binance.org/");
      sellPrice = prices.sellPrice;
      const balWei = ethers.parseUnits(balance || "0", TOKEN_DECIMALS);
      const priceWei = ethers.parseUnits(sellPrice || "0", TOKEN_DECIMALS);
      const valueWei = (balWei * priceWei) / (10n ** BigInt(TOKEN_DECIMALS));
      valueUsd = ethers.formatUnits(valueWei, TOKEN_DECIMALS);
    } catch {
      /* leave price/value zero */
    }
  }

  const rewards = await db.select().from(tokenRewardsTable)
    .where(eq(tokenRewardsTable.userId, user.id))
    .orderBy(desc(tokenRewardsTable.createdAt))
    .limit(50);
  const sales = await db.select().from(tokenSalesTable)
    .where(eq(tokenSalesTable.userId, user.id))
    .orderBy(desc(tokenSalesTable.createdAt))
    .limit(50);

  res.json({
    configured,
    balance,
    sellPrice,
    valueUsd,
    rewards: rewards.map((r) => ({
      id: r.id, type: r.type, tokenAmount: r.tokenAmount, usdValue: parseFloat(r.usdValue),
      level: r.level, fromUserName: r.fromUserName, createdAt: r.createdAt.toISOString(),
    })),
    sales: sales.map((s) => ({
      id: s.id, tokenAmount: s.tokenAmount, usdtReceived: parseFloat(s.usdtReceived),
      status: s.status, txHash: s.sellTxHash, createdAt: s.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/token/sell  { amount: string | "all" }
 *
 * Sell ROI tokens back to the contract at the live on-chain sell price. The
 * sell is executed from the platform withdraw wallet; proceeds are credited to
 * the user as a withdrawable USDT income row (type "token_sale").
 *
 * Balance is deducted FIRST (pessimistic) to prevent double-spend across
 * concurrent requests; if the on-chain sell fails the balance is refunded.
 */
router.post("/token/sell", requireAuth, async (req, res) => {
  const user = (req as any).user;

  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const contractAddress = (settings?.tokenContractAddress || "").trim();
  if (!settings || !isValidAddress(contractAddress)) {
    res.status(400).json({ message: "Token selling is not available yet" });
    return;
  }
  const withdrawKey = resolveKey(settings.withdrawWalletPrivateKey);
  const gasKey = resolveKey(settings.gasWalletPrivateKey);
  if (!withdrawKey || !gasKey) {
    res.status(400).json({ message: "Platform wallet is not configured for selling" });
    return;
  }
  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";

  // Determine sell amount (wei) and atomically reserve it from the balance.
  let sellWei: bigint;
  try {
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      const balWei = ethers.parseUnits(fresh?.roiTokenBalance || "0", TOKEN_DECIMALS);
      const raw = req.body?.amount;
      if (raw === "all" || raw === undefined || raw === null || raw === "") {
        sellWei = balWei;
      } else {
        const parsed = ethers.parseUnits(String(raw), TOKEN_DECIMALS);
        if (parsed <= 0n) throw new Error("INVALID_AMOUNT");
        sellWei = parsed;
      }
      if (sellWei <= 0n) throw new Error("NO_BALANCE");
      if (sellWei > balWei) throw new Error("INSUFFICIENT");
      const next = balWei - sellWei;
      await tx.update(usersTable)
        .set({ roiTokenBalance: ethers.formatUnits(next, TOKEN_DECIMALS) })
        .where(eq(usersTable.id, user.id));
    });
  } catch (err: any) {
    const map: Record<string, string> = {
      INVALID_AMOUNT: "Invalid sell amount",
      NO_BALANCE: "You have no ROI tokens to sell",
      INSUFFICIENT: "Sell amount exceeds your ROI token balance",
    };
    res.status(400).json({ message: map[err?.message] || "Could not reserve tokens for sale" });
    return;
  }

  // On-chain sell. Refund the reserved balance on any failure.
  const result = await sellTokens(sellWei!, contractAddress, withdrawKey, gasKey, rpcUrl);
  if (!result.success || result.usdtReceived === undefined) {
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      const balWei = ethers.parseUnits(fresh?.roiTokenBalance || "0", TOKEN_DECIMALS);
      await tx.update(usersTable)
        .set({ roiTokenBalance: ethers.formatUnits(balWei + sellWei!, TOKEN_DECIMALS) })
        .where(eq(usersTable.id, user.id));
    });
    await db.insert(tokenSalesTable).values({
      userId: user.id,
      tokenAmount: ethers.formatUnits(sellWei!, TOKEN_DECIMALS),
      usdtReceived: "0",
      sellTxHash: result.txHash ?? null,
      status: "failed",
    });
    res.status(502).json({ message: result.error || "On-chain sell failed. Your tokens were not deducted." });
    return;
  }

  // Credit proceeds as withdrawable USDT income + record the sale.
  const tokenAmountStr = ethers.formatUnits(sellWei!, TOKEN_DECIMALS);
  let sellPrice = "0";
  try {
    const prices = await getTokenPrices(contractAddress, rpcUrl);
    sellPrice = prices.sellPrice;
  } catch { /* informational */ }

  await db.transaction(async (tx) => {
    await tx.insert(incomeTable).values({
      userId: user.id,
      type: "token_sale",
      amount: result.usdtReceived!.toString(),
      description: `Sold ${parseFloat(tokenAmountStr).toFixed(4)} ROI tokens`,
    });
    const [fresh] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    await tx.update(usersTable)
      .set({ totalEarnings: (parseFloat(fresh!.totalEarnings) + result.usdtReceived!).toString() })
      .where(eq(usersTable.id, user.id));
    await tx.insert(tokenSalesTable).values({
      userId: user.id,
      tokenAmount: tokenAmountStr,
      usdtReceived: result.usdtReceived!.toString(),
      sellPrice,
      sellTxHash: result.txHash ?? null,
      status: "completed",
    });
  });

  const [after] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  res.json({
    success: true,
    usdtReceived: result.usdtReceived,
    txHash: result.txHash,
    tokensSold: tokenAmountStr,
    newBalance: after?.roiTokenBalance || "0",
  });
});

export default router;
