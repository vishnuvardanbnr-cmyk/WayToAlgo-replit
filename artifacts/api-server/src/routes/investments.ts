import { Router } from "express";
import { db, investmentsTable, usersTable, incomeTable, platformSettingsTable, userTokenPurchasesTable } from "@workspace/db";
import { eq, and, desc, sum } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateInvestmentBody } from "@workspace/api-zod";
import { sendDepositConfirmationEmail } from "../lib/email";
import { verifySafeBuyTx, isValidAddress } from "../lib/tokenChain";
import { ethers } from "ethers";

const router = Router();

async function getPlan(amount: number) {
  const [s] = await db.select().from(platformSettingsTable).limit(1);
  const rate = s ? parseFloat(s.planDailyRate) : 0.008;
  const days = s ? s.planDays : 300;
  const minAmount = s ? parseFloat(s.planMinAmount) : 100;
  const maxTotal = s ? parseFloat(s.maxTotalInvestment) : 2000;
  if (amount >= minAmount && amount <= maxTotal) {
    return { tier: "plan", dailyRate: rate, durationDays: days };
  }
  return null;
}

function investmentToResponse(inv: typeof investmentsTable.$inferSelect) {
  return {
    id: inv.id,
    userId: inv.userId,
    amount: parseFloat(inv.amount),
    planTier: inv.planTier,
    dailyRate: parseFloat(inv.dailyRate),
    durationDays: inv.durationDays,
    earnedSoFar: parseFloat(inv.earnedSoFar),
    remainingDays: inv.remainingDays,
    startDate: inv.startDate.toISOString(),
    endDate: inv.endDate.toISOString(),
    status: inv.status,
    hyperCoinAmount: parseFloat(inv.hyperCoinAmount),
    usdtAmount: parseFloat(inv.usdtAmount),
    investmentType: (inv.investmentType ?? "risky") as "safe" | "risky",
    tokenPurchaseAmount: parseFloat(inv.tokenPurchaseAmount ?? "0"),
    createdAt: inv.createdAt.toISOString(),
  };
}

// GET /api/investments
router.get("/investments", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const investments = await db.select().from(investmentsTable)
    .where(eq(investmentsTable.userId, user.id))
    .orderBy(desc(investmentsTable.createdAt));
  res.json(investments.map(investmentToResponse));
});

// POST /api/investments
router.post("/investments", requireAuth, async (req, res) => {
  const parsed = CreateInvestmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const user = (req as any).user;
  const { amount, investmentType } = parsed.data as { amount: number; investmentType: "safe" | "risky" };
  const isSafe = investmentType === "safe";

  // Safe Invest pays its 50% token-half on-chain via the user's own MetaMask
  // (buySafe), so the request must carry the confirmed on-chain purchase proof.
  // The ROI-half (the other 50%) is funded from the in-app USDT balance below.
  const txHash = typeof req.body?.txHash === "string" ? req.body.txHash.trim() : "";
  const tokenWalletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress.trim() : "";
  const tokenSignature = typeof req.body?.signature === "string" ? req.body.signature.trim() : "";
  const wtaReceived = parseFloat(req.body?.wtaReceived ?? "0") || 0;
  const tokenBuyPrice = parseFloat(req.body?.buyPrice ?? "0") || 0;

  if (isSafe && !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    res.status(400).json({ message: "Safe Invest requires a confirmed on-chain token purchase. Please complete the wallet transaction and try again." });
    return;
  }

  if (user.investmentBlocked) {
    const reason = user.investmentBlockReason || user.blockReason;
    res.status(403).json({
      message: reason
        ? `New investments are blocked: ${reason}`
        : "New investments have been blocked on your account. Please contact support.",
    });
    return;
  }

  if (amount % 100 !== 0) {
    res.status(400).json({ message: "Investment must be a multiple of 100" });
    return;
  }

  const plan = await getPlan(amount);
  if (!plan) {
    const [s2] = await db.select().from(platformSettingsTable).limit(1);
    const minAmt = s2 ? parseFloat(s2.planMinAmount) : 100;
    const maxT = s2 ? parseFloat(s2.maxTotalInvestment) : 2000;
    res.status(400).json({ message: `Investment amount must be $${minAmt}–$${maxT.toLocaleString()} USDT` });
    return;
  }

  const [settings] = await db.select().from(platformSettingsTable).limit(1);

  // Compute the split server-side based on investmentType:
  // Safe  → 50% buys WTA tokens ON-CHAIN via the user's own MetaMask (buySafe),
  //         50% earns daily ROI from the in-app balance. Only the ROI-half is
  //         deducted in-app; the token-half never touches the in-app wallet.
  // Risky → 100% earns daily ROI (no token purchase), paid from the in-app wallet.
  const tokenPurchaseAmount = isSafe ? amount * 0.5 : 0;
  // In-app USDT deduction: token-half is on-chain for Safe, so only the ROI-half
  // is taken from the in-app wallet; Risky pays the full amount in-app.
  const usdtAmount = amount - tokenPurchaseAmount;
  const hyperCoinAmount = 0; // user never pays with WTA tokens

  // Fetch fresh user to check balances
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!freshUser) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  // Enforce configurable total active investment limit
  const maxTotalInvestment = parseFloat(settings?.maxTotalInvestment ?? "2000");
  const [{ total: activeTotal }] = await db
    .select({ total: sum(investmentsTable.amount) })
    .from(investmentsTable)
    .where(and(eq(investmentsTable.userId, user.id), eq(investmentsTable.status, "active")));
  const currentActiveTotal = parseFloat(activeTotal ?? "0");
  if (currentActiveTotal + amount > maxTotalInvestment) {
    const remaining = Math.max(0, maxTotalInvestment - currentActiveTotal);
    res.status(400).json({
      message: `Maximum total investment is $${maxTotalInvestment}. You have $${currentActiveTotal.toFixed(2)} currently active, so you can only invest up to $${remaining.toFixed(2)} more.`,
      code: "MAX_INVESTMENT_EXCEEDED",
      maxTotal: maxTotalInvestment,
      currentTotal: currentActiveTotal,
      remaining,
    });
    return;
  }

  const currentUsdt = parseFloat(freshUser.walletBalance ?? "0");
  if (usdtAmount > currentUsdt) {
    res.status(400).json({ message: `Insufficient USDT balance. Available: $${currentUsdt.toFixed(2)}` });
    return;
  }

  // ── Safe Invest: verify the on-chain token-half BEFORE creating the
  // half-priced (in-app) investment. This is the trust boundary — without it a
  // client could call the API directly with a fabricated hash and pay only the
  // ROI-half while still getting full totalInvested/spot-referral credit.
  if (isSafe) {
    const contractAddress = (settings?.tokenContractAddress || "").trim();
    if (!isValidAddress(contractAddress)) {
      res.status(400).json({ message: "On-chain token trading is not configured yet. Please contact support." });
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(tokenWalletAddress)) {
      res.status(400).json({ message: "A valid wallet address is required for Safe Invest." });
      return;
    }
    // Bind the on-chain proof to THIS account: the buying wallet must be the
    // user's own registered wallet. Without this, an attacker could claim any
    // stranger's public buySafe tx (set walletAddress to that tx's sender) and
    // get Safe credit while paying only the ROI-half. verifySafeBuyTx then
    // confirms tx.from === this same wallet, so the tx is provably the user's.
    const userWallet = (freshUser.walletAddress || "").trim();
    if (!isValidAddress(userWallet)) {
      res.status(400).json({ message: "Please set your wallet address in your profile before using Safe Invest." });
      return;
    }
    if (tokenWalletAddress.toLowerCase() !== userWallet.toLowerCase()) {
      res.status(400).json({ message: "Safe Invest must be paid from your registered wallet address. Connect the wallet that matches your profile." });
      return;
    }
    // Cryptographic proof of wallet control (EIP-191). This is the real
    // ownership binding: a registered/profile address is NOT itself proven, so
    // without this an attacker could register a victim's address and claim the
    // victim's public buySafe tx. Requiring a signature over the txHash from the
    // buying wallet means only the actual key-holder can submit the claim.
    const authMsg = `WaytoAlgo Safe Invest\nWallet: ${tokenWalletAddress.toLowerCase()}\nTx: ${txHash.toLowerCase()}`;
    let recovered = "";
    try { recovered = ethers.verifyMessage(authMsg, tokenSignature); } catch { recovered = ""; }
    if (!recovered || recovered.toLowerCase() !== tokenWalletAddress.toLowerCase()) {
      res.status(400).json({ message: "Wallet ownership could not be verified. Please sign the authorization with the wallet that made the purchase." });
      return;
    }
    // Fast replay check: reject a tx hash already tied to a prior purchase.
    // (The atomic unique-constraint insert inside the transaction below closes
    // the remaining race window.)
    const [dup] = await db
      .select({ id: userTokenPurchasesTable.id })
      .from(userTokenPurchasesTable)
      .where(eq(userTokenPurchasesTable.txHash, txHash.toLowerCase()))
      .limit(1);
    if (dup) {
      res.status(400).json({ message: "This transaction has already been used for an investment." });
      return;
    }
    const rpcUrl = settings?.bscRpcUrl || "https://bsc-dataseed.binance.org/";
    const expectedUsdtWei = ethers.parseUnits(tokenPurchaseAmount.toString(), 18);
    const v = await verifySafeBuyTx({
      txHash, expectedFrom: tokenWalletAddress, expectedUsdtWei, contractAddress, rpcUrl,
    });
    if (!v.ok) {
      res.status(400).json({ message: v.error ?? "On-chain token purchase could not be verified." });
      return;
    }
  }
  // NOTE: Safe Invest no longer credits an off-chain hyperCoin balance — the
  // token-half is bought on-chain and the real WTA tokens land in the user's own
  // wallet. The confirmed purchase is recorded atomically inside the tx below.

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  // Wrap investment creation + balance deduction in a transaction to prevent race conditions
  let investment: typeof investmentsTable.$inferSelect;
  try {
    [investment] = await db.transaction(async (tx) => {
      // Re-fetch user inside transaction to get latest balances
      const [lockedUser] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      if (!lockedUser) throw Object.assign(new Error("User not found"), { status: 404 });
      const latestUsdt = parseFloat(lockedUser.walletBalance ?? "0");
      if (usdtAmount > latestUsdt) throw Object.assign(new Error(`Insufficient USDT balance. Available: $${latestUsdt.toFixed(2)}`), { status: 400 });

      const inv = await tx.insert(investmentsTable).values({
        userId: user.id,
        amount: amount.toString(),
        planTier: plan.tier,
        dailyRate: plan.dailyRate.toString(),
        durationDays: plan.durationDays,
        remainingDays: plan.durationDays,
        startDate,
        endDate,
        hyperCoinAmount: hyperCoinAmount.toString(),
        usdtAmount: usdtAmount.toString(),
        investmentType,
        tokenPurchaseAmount: tokenPurchaseAmount.toString(),
        status: "active",
        earnedSoFar: "0",
      }).returning();

      // Record the confirmed on-chain Safe token purchase INSIDE the tx so the
      // unique tx_hash constraint gives atomic replay protection: a duplicate
      // hash throws (23505) → the whole investment rolls back. No
      // onConflictDoNothing here — a reused hash MUST fail the investment.
      if (isSafe) {
        try {
          await tx.insert(userTokenPurchasesTable).values({
            userId: user.id,
            walletAddress: tokenWalletAddress.toLowerCase(),
            txHash: txHash.toLowerCase(),
            usdtSpent: tokenPurchaseAmount.toString(),
            wtaReceived: wtaReceived.toString(),
            buyPrice: tokenBuyPrice.toString(),
          });
        } catch (e: any) {
          if (e?.code === "23505") {
            throw Object.assign(new Error("This transaction has already been used for an investment."), { status: 400 });
          }
          throw e;
        }
      }

      // Auto-activate user on their first investment
      const isFirstInvestment = parseFloat(lockedUser.totalInvested) === 0;
      await tx.update(usersTable)
        .set({
          totalInvested: (parseFloat(lockedUser.totalInvested) + amount).toString(),
          walletBalance: (latestUsdt - usdtAmount).toString(),
          ...(isFirstInvestment ? { isActive: true } : {}),
        })
        .where(eq(usersTable.id, user.id));

      return inv;
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ message: err?.message ?? "Investment creation failed" });
    return;
  }

  if (user.sponsorId) {
    const spotRate = settings ? parseFloat(settings.spotReferralRate) : 0.05;
    const spotCommission = amount * spotRate;
    const [sponsor] = await db.select().from(usersTable).where(eq(usersTable.id, user.sponsorId)).limit(1);

    // If sponsor is inactive, redirect the commission to the admin account
    let recipientId: number | null = null;
    let recipientUser: typeof usersTable.$inferSelect | undefined;

    if (sponsor && sponsor.isActive) {
      recipientId = sponsor.id;
      recipientUser = sponsor;
    } else {
      // Find first admin user to receive the redirected commission
      const [admin] = await db.select().from(usersTable)
        .where(eq(usersTable.isAdmin, true))
        .limit(1);
      if (admin) {
        recipientId = admin.id;
        recipientUser = admin;
      }
    }

    if (recipientId && recipientUser) {
      await db.insert(incomeTable).values({
        userId: recipientId,
        type: "spot_referral",
        amount: spotCommission.toString(),
        description: sponsor && !sponsor.isActive
          ? `Spot referral commission from ${user.name} (redirected — original sponsor inactive)`
          : `Spot referral commission from ${user.name}`,
        fromUserId: user.id,
        fromUserName: user.name,
      });
      await db.update(usersTable)
        .set({
          totalEarnings: (parseFloat(recipientUser.totalEarnings) + spotCommission).toString(),
          // Spot referral commission is an earning → credit the withdraw wallet
          withdrawBalance: (parseFloat(recipientUser.withdrawBalance ?? "0") + spotCommission).toFixed(6),
        })
        .where(eq(usersTable.id, recipientId));
    }
  }

  // Send deposit confirmation email (fire-and-forget)
  const planLabel = `${plan.tier.toUpperCase()} — ${(plan.dailyRate * 100).toFixed(1)}%/day, ${plan.durationDays} days`;
  sendDepositConfirmationEmail(user.email, user.name, amount, planLabel).catch(() => {});

  res.status(201).json(investmentToResponse(investment));
});

// GET /api/investments/:id
router.get("/investments/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = (req as any).user;
  const [investment] = await db.select().from(investmentsTable)
    .where(and(eq(investmentsTable.id, id), eq(investmentsTable.userId, user.id)))
    .limit(1);
  if (!investment) {
    res.status(404).json({ message: "Investment not found" });
    return;
  }
  res.json(investmentToResponse(investment));
});

export { investmentToResponse };
export default router;
