import { ethers } from "ethers";
import {
  db,
  investmentsTable,
  usersTable,
  platformSettingsTable,
  tokenBuyBatchesTable,
  tokenRewardsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { resolveKey } from "./keyEncryption.js";
import { buyTokens, isValidAddress, getTokenPrices, TOKEN_DECIMALS } from "./tokenChain";

const TOKEN_BASE = 10n ** BigInt(TOKEN_DECIMALS);

function levelConfig(s: typeof platformSettingsTable.$inferSelect) {
  return {
    coolingHours: s.withdrawalCoolingHours ?? 24,
    levelRates: {
      1: parseFloat(s.levelCommL1), 2: parseFloat(s.levelCommL2), 3: parseFloat(s.levelCommL3),
      4: parseFloat(s.levelCommL4), 5: parseFloat(s.levelCommL5), 6: parseFloat(s.levelCommL6),
      7: parseFloat(s.levelCommL7), 8: parseFloat(s.levelCommL8),
    } as Record<number, number>,
    levelUnlocks: {
      1: 0, 2: parseFloat(s.levelUnlockL2), 3: parseFloat(s.levelUnlockL3), 4: parseFloat(s.levelUnlockL4),
      5: parseFloat(s.levelUnlockL5), 6: parseFloat(s.levelUnlockL6), 7: parseFloat(s.levelUnlockL7),
      8: parseFloat(s.levelUnlockL8),
    } as Record<number, number>,
    levelDays: {
      1: s.levelDaysL1, 2: s.levelDaysL2, 3: s.levelDaysL3, 4: s.levelDaysL4,
      5: s.levelDaysL5, 6: s.levelDaysL6, 7: s.levelDaysL7, 8: s.levelDaysL8,
    } as Record<number, number>,
  };
}

// Mirror dailyPayout.buildTeamBusinessVolumeMap (downline totalInvested sum).
function buildTeamVolumeMap(
  allUsers: { id: number; sponsorId: number | null; totalInvested: string }[],
): Map<number, number> {
  const children = new Map<number, number[]>();
  const invested = new Map<number, number>();
  for (const u of allUsers) {
    invested.set(u.id, parseFloat(u.totalInvested ?? "0") || 0);
    if (u.sponsorId != null) {
      const arr = children.get(u.sponsorId) ?? [];
      arr.push(u.id);
      children.set(u.sponsorId, arr);
    }
  }
  function teamVolume(userId: number): number {
    let vol = 0;
    const stack = [...(children.get(userId) ?? [])];
    while (stack.length > 0) {
      const cid = stack.pop()!;
      vol += invested.get(cid) ?? 0;
      for (const gc of children.get(cid) ?? []) stack.push(gc);
    }
    return vol;
  }
  const map = new Map<number, number>();
  for (const u of allUsers) map.set(u.id, teamVolume(u.id));
  return map;
}

export interface TokenDistributeResult {
  success: boolean;
  error?: string;
  batchId?: number;
  txHash?: string;
  usdtSpent?: number;
  tokensBought?: string;
  roiTokenTotal?: string;
  levelTokenTotal?: string;
  recipientCount?: number;
  eligibleInvestments?: number;
}

/**
 * The new ROI engine. Admin enters the day's real trading profit (USDT). We:
 *  1. Determine eligible investments (active, past cooling, active investor).
 *  2. Execute a REAL on-chain buy for `profitUsdt` from the withdraw wallet.
 *  3. Distribute the bought tokens VIRTUALLY, proportional to each eligible
 *     investment's principal, carving level commissions to qualifying uplines
 *     out of each investment's own share (so total distributed never exceeds
 *     the tokens actually bought).
 *  4. Advance each eligible investment's remainingDays / earnedSoFar / status.
 *
 * Token rewards are credited to users.roiTokenBalance and logged in
 * token_rewards. They are NOT income rows — they only become withdrawable USDT
 * when the user sells them on the Wallet page.
 */
export async function runTokenBuyAndDistribute(profitUsdt: number): Promise<TokenDistributeResult> {
  if (!Number.isFinite(profitUsdt) || profitUsdt <= 0) {
    return { success: false, error: "Profit amount must be a positive number" };
  }

  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) return { success: false, error: "Platform settings not configured" };

  const contractAddress = (settings.tokenContractAddress || "").trim();
  if (!isValidAddress(contractAddress)) {
    return { success: false, error: "Token contract address is not configured" };
  }
  const withdrawKey = resolveKey(settings.withdrawWalletPrivateKey);
  const gasKey = resolveKey(settings.gasWalletPrivateKey);
  if (!withdrawKey || !gasKey) {
    return { success: false, error: "Withdraw wallet and gas wallet must be configured" };
  }
  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";

  const cfg = levelConfig(settings);
  const now = new Date();

  // ── 1. Build eligibility BEFORE buying so we never buy with nobody to pay ──
  const activeInvestments = await db.select().from(investmentsTable).where(eq(investmentsTable.status, "active"));

  // Investments past the cooling window advance their duration.
  const advancing = activeInvestments.filter((inv) => {
    const hoursElapsed = (now.getTime() - new Date(inv.createdAt).getTime()) / 3_600_000;
    return hoursElapsed >= cfg.coolingHours;
  });

  const allUsers = await db.select().from(usersTable);
  const userById = new Map(allUsers.map((u) => [u.id, u]));
  const teamVolumeMap = buildTeamVolumeMap(
    allUsers.map((u) => ({ id: u.id, sponsorId: u.sponsorId, totalInvested: u.totalInvested })),
  );

  // Investments that actually receive tokens: investor must exist & be active.
  const eligible = advancing.filter((inv) => {
    const u = userById.get(inv.userId);
    return !!u && u.isActive;
  });

  if (eligible.length === 0) {
    return { success: false, error: "No eligible active investments to distribute to (check cooling period and active investors)" };
  }

  // Denominator in integer micro-USD to keep BigInt proportions exact.
  let totalMicro = 0n;
  const principalMicro = new Map<number, bigint>(); // investmentId -> micro
  for (const inv of eligible) {
    const micro = BigInt(Math.round(parseFloat(inv.amount) * 1e6));
    principalMicro.set(inv.id, micro);
    totalMicro += micro;
  }
  if (totalMicro <= 0n) {
    return { success: false, error: "Eligible investment principal is zero" };
  }

  // ── 2. Real on-chain buy ──
  const [batch] = await db.insert(tokenBuyBatchesTable).values({
    usdtSpent: profitUsdt.toString(),
    status: "pending",
  }).returning();

  let buyPrice = "0";
  try {
    const prices = await getTokenPrices(contractAddress, rpcUrl);
    buyPrice = prices.buyPrice;
  } catch {
    /* non-fatal: price is informational */
  }

  const buy = await buyTokens(profitUsdt, contractAddress, withdrawKey, gasKey, rpcUrl);
  if (!buy.success || !buy.tokensBought) {
    await db.update(tokenBuyBatchesTable)
      .set({ status: "failed", note: buy.error ?? "Buy failed", buyTxHash: buy.txHash ?? null, buyPrice })
      .where(eq(tokenBuyBatchesTable.id, batch.id));
    return { success: false, error: buy.error ?? "On-chain buy failed", batchId: batch.id };
  }

  const tokensBoughtWei = buy.tokensBought;

  // ── 3. Compute distribution (carve model, BigInt wei) ──
  const userTokenAdd = new Map<number, bigint>(); // userId -> wei to credit
  const rewardRows: {
    userId: number; type: string; tokenAmount: bigint; usdValue: number;
    level: number | null; fromUserId: number | null; fromUserName: string | null;
  }[] = [];
  const investmentUpdates: { id: number; remainingDays: number; earnedSoFar: string; status: string }[] = [];

  let roiTotalWei = 0n;
  let levelTotalWei = 0n;
  const recipients = new Set<number>();

  for (const inv of eligible) {
    const investor = userById.get(inv.userId)!;
    const micro = principalMicro.get(inv.id)!;
    const grossWei = (tokensBoughtWei * micro) / totalMicro;
    const usdShare = profitUsdt * (Number(micro) / Number(totalMicro));

    // Advance duration (mirror dailyPayout).
    const newRemaining = Math.max(0, inv.remainingDays - 1);
    const isCompleted = newRemaining === 0;
    const daysElapsed = inv.durationDays - newRemaining;
    investmentUpdates.push({
      id: inv.id,
      remainingDays: newRemaining,
      earnedSoFar: (parseFloat(inv.earnedSoFar) + usdShare).toString(),
      status: isCompleted ? "completed" : "active",
    });

    if (grossWei <= 0n) continue;

    // Carve level commissions from this investment's share.
    let carvedWei = 0n;
    let currentUserId: number | null = investor.sponsorId;
    let level = 1;
    while (currentUserId && level <= 8) {
      const upline = userById.get(currentUserId);
      if (!upline) break;
      if (!upline.isActive) {
        currentUserId = upline.sponsorId;
        level++;
        continue;
      }
      const maxDays = cfg.levelDays[level] ?? 0;
      if (maxDays > 0 && daysElapsed > maxDays) {
        currentUserId = upline.sponsorId;
        level++;
        continue;
      }
      const unlock = cfg.levelUnlocks[level] ?? 0;
      const uplineVolume = teamVolumeMap.get(upline.id) ?? 0;
      if (uplineVolume >= unlock) {
        const rateBps = BigInt(Math.round((cfg.levelRates[level] ?? 0) * 10000));
        const commissionWei = (grossWei * rateBps) / 10000n;
        if (commissionWei > 0n) {
          carvedWei += commissionWei;
          userTokenAdd.set(upline.id, (userTokenAdd.get(upline.id) ?? 0n) + commissionWei);
          levelTotalWei += commissionWei;
          recipients.add(upline.id);
          rewardRows.push({
            userId: upline.id,
            type: "level",
            tokenAmount: commissionWei,
            usdValue: usdShare * (cfg.levelRates[level] ?? 0),
            level,
            fromUserId: investor.id,
            fromUserName: investor.name || investor.email,
          });
        }
      }
      currentUserId = upline.sponsorId;
      level++;
    }

    const netWei = grossWei - carvedWei;
    if (netWei > 0n) {
      userTokenAdd.set(investor.id, (userTokenAdd.get(investor.id) ?? 0n) + netWei);
      roiTotalWei += netWei;
      recipients.add(investor.id);
      rewardRows.push({
        userId: investor.id,
        type: "roi",
        tokenAmount: netWei,
        usdValue: usdShare,
        level: null,
        fromUserId: null,
        fromUserName: null,
      });
    }
  }

  // ── 4. Apply everything in one transaction ──
  try {
    await db.transaction(async (tx) => {
      for (const upd of investmentUpdates) {
        await tx.update(investmentsTable)
          .set({ remainingDays: upd.remainingDays, earnedSoFar: upd.earnedSoFar, status: upd.status })
          .where(eq(investmentsTable.id, upd.id));
      }
      for (const [userId, addWei] of userTokenAdd.entries()) {
        const u = userById.get(userId)!;
        const current = ethers.parseUnits((u.roiTokenBalance || "0"), TOKEN_DECIMALS);
        const next = current + addWei;
        // Determine USD value to credit to the appropriate earning wallet
        const usdAdd = Number(ethers.formatUnits(addWei, TOKEN_DECIMALS)) * profitUsdt / Number(ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS));
        // Check if this user received roi (investor) or level (upline) tokens
        const isRoiRecipient = rewardRows.some(r => r.userId === userId && r.type === "roi");
        const isLevelRecipient = rewardRows.some(r => r.userId === userId && r.type === "level");
        const roiUsd = rewardRows.filter(r => r.userId === userId && r.type === "roi").reduce((s, r) => s + r.usdValue, 0);
        const levelUsd = rewardRows.filter(r => r.userId === userId && r.type === "level").reduce((s, r) => s + r.usdValue, 0);
        await tx.update(usersTable)
          .set({
            roiTokenBalance: ethers.formatUnits(next, TOKEN_DECIMALS),
            tradingProfitBalance: isRoiRecipient
              ? (parseFloat(u.tradingProfitBalance || "0") + roiUsd).toFixed(6)
              : u.tradingProfitBalance,
            teamBenefitBalance: isLevelRecipient
              ? (parseFloat(u.teamBenefitBalance || "0") + levelUsd).toFixed(6)
              : u.teamBenefitBalance,
            totalEarnings: (parseFloat(u.totalEarnings || "0") + roiUsd + levelUsd).toFixed(6),
          })
          .where(eq(usersTable.id, userId));
      }
      if (rewardRows.length > 0) {
        await tx.insert(tokenRewardsTable).values(
          rewardRows.map((r) => ({
            userId: r.userId,
            batchId: batch.id,
            type: r.type,
            tokenAmount: ethers.formatUnits(r.tokenAmount, TOKEN_DECIMALS),
            usdValue: r.usdValue.toFixed(6),
            level: r.level,
            fromUserId: r.fromUserId,
            fromUserName: r.fromUserName,
          })),
        );
      }
      await tx.update(tokenBuyBatchesTable)
        .set({
          status: "completed",
          buyTxHash: buy.txHash ?? null,
          buyPrice,
          tokensBought: ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS),
          roiTokenTotal: ethers.formatUnits(roiTotalWei, TOKEN_DECIMALS),
          levelTokenTotal: ethers.formatUnits(levelTotalWei, TOKEN_DECIMALS),
          recipientCount: recipients.size,
        })
        .where(eq(tokenBuyBatchesTable.id, batch.id));
    });
  } catch (err: any) {
    logger.error({ err, batchId: batch.id }, "Token distribution DB transaction failed after on-chain buy");
    await db.update(tokenBuyBatchesTable)
      .set({ status: "failed", note: `Distribution failed after buy: ${err?.message}`, buyTxHash: buy.txHash ?? null })
      .where(eq(tokenBuyBatchesTable.id, batch.id));
    return {
      success: false,
      error: "On-chain buy succeeded but distribution failed — see batch note. No tokens were credited.",
      batchId: batch.id,
      txHash: buy.txHash,
    };
  }

  logger.info(
    { batchId: batch.id, recipients: recipients.size, eligible: eligible.length },
    "Token buy & distribute completed",
  );

  return {
    success: true,
    batchId: batch.id,
    txHash: buy.txHash,
    usdtSpent: profitUsdt,
    tokensBought: ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS),
    roiTokenTotal: ethers.formatUnits(roiTotalWei, TOKEN_DECIMALS),
    levelTokenTotal: ethers.formatUnits(levelTotalWei, TOKEN_DECIMALS),
    recipientCount: recipients.size,
    eligibleInvestments: eligible.length,
  };
}
