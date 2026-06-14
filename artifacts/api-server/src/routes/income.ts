import { Router } from "express";
import { db, incomeTable, withdrawalsTable, usersTable, platformSettingsTable, tokenRewardsTable, investmentsTable } from "@workspace/db";
import { eq, and, desc, sum, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { capSettingsFrom, capForUser, buildDirectVolumeMap, loadRoiLevelEarnedMap } from "../lib/earningsCap";

const router = Router();

function incomeToResponse(inc: typeof incomeTable.$inferSelect) {
  return {
    id: inc.id,
    userId: inc.userId,
    type: inc.type,
    amount: parseFloat(inc.amount),
    description: inc.description,
    fromUserId: inc.fromUserId,
    fromUserName: inc.fromUserName,
    level: inc.level,
    createdAt: inc.createdAt.toISOString(),
  };
}

// GET /api/income
router.get("/income", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const type = req.query.type as string | undefined;
  const offset = (page - 1) * limit;

  const conditions = [eq(incomeTable.userId, user.id)];
  if (type) conditions.push(eq(incomeTable.type, type));

  const allRecords = await db.select().from(incomeTable)
    .where(and(...conditions))
    .orderBy(desc(incomeTable.createdAt));

  const paginated = allRecords.slice(offset, offset + limit);
  res.json({
    records: paginated.map(incomeToResponse),
    total: allRecords.length,
    page,
    limit,
  });
});

// GET /api/income/summary
router.get("/income/summary", requireAuth, async (req, res) => {
  const user = (req as any).user;

  const allIncome = await db.select().from(incomeTable).where(eq(incomeTable.userId, user.id));

  let dailyReturnTotal = 0;
  let spotReferralTotal = 0;
  let levelCommissionTotal = 0;
  let rankBonusTotal = 0;
  let tokenSaleTotal = 0;

  for (const rec of allIncome) {
    const amt = parseFloat(rec.amount);
    if (rec.type === "daily_return") dailyReturnTotal += amt;
    else if (rec.type === "spot_referral") spotReferralTotal += amt;
    else if (rec.type === "level_commission") levelCommissionTotal += amt;
    else if (rec.type === "rank_bonus") rankBonusTotal += amt;
    else if (rec.type === "token_sale") tokenSaleTotal += amt;
  }

  // USDT-denominated income — these are the only types withdrawable in USDT
  const usdtEarningsTotal = spotReferralTotal + rankBonusTotal + tokenSaleTotal;
  // WTA-denominated income — stored as token amounts, NOT directly withdrawable
  const wtaEarningsTotal  = dailyReturnTotal + levelCommissionTotal;

  const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, user.id));
  const withdrawnTotal = withdrawals
    .filter(w => w.status === "approved")
    .reduce((s, w) => s + parseFloat(w.amount), 0);
  const pendingWithdrawal = withdrawals
    .filter(w => w.status === "pending")
    .reduce((s, w) => s + parseFloat(w.amount), 0);

  // Available balance is only from USDT earnings (WTA must be sold first)
  const availableBalance = usdtEarningsTotal - withdrawnTotal - pendingWithdrawal;

  // Earnings cap (ROI + level combined) — computed consistently with the distribution engine.
  const [settingsRow] = await db.select().from(platformSettingsTable).limit(1);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  const directRows = await db
    .select({ ti: usersTable.totalInvested })
    .from(usersTable)
    .where(eq(usersTable.sponsorId, user.id));
  const directVolume = directRows.reduce((s, r) => s + (parseFloat(r.ti ?? "0") || 0), 0);
  const [earnedRow] = await db
    .select({ total: sql<string>`coalesce(sum(${tokenRewardsTable.usdValue}), 0)` })
    .from(tokenRewardsTable)
    .where(and(eq(tokenRewardsTable.userId, user.id), inArray(tokenRewardsTable.type, ["roi", "level"])));
  const capEarned = parseFloat(earnedRow?.total ?? "0") || 0;
  const cs = settingsRow ? capSettingsFrom(settingsRow) : { enabled: true, base: 2, boosted: 3 };
  const capInfo = capForUser(u ?? { isAdmin: user.isAdmin, totalInvested: "0" }, directVolume, capEarned, cs);
  const earningsCap = {
    enabled: capInfo.enabled,
    multiplier: capInfo.multiplier,
    personalInvested: capInfo.personalInvested,
    directVolume: capInfo.directVolume,
    earned: capInfo.earned,
    cap: capInfo.cap === Infinity ? null : capInfo.cap,
    remaining: capInfo.remaining === Infinity ? null : capInfo.remaining,
    reached: capInfo.reached,
  };

  // ── Daily potential (expected ROI + level commission per day) ──
  // "If all conditions pass" — assumes the user qualifies for every level depth,
  // so it shows the full earning potential of their own investment + downline.
  const dailyRoiRate = parseFloat(settingsRow?.dailyRoiRate ?? "0") || 0;
  const levelRates: Record<number, number> = {
    1: parseFloat(settingsRow?.levelCommL1 ?? "0") || 0,
    2: parseFloat(settingsRow?.levelCommL2 ?? "0") || 0,
    3: parseFloat(settingsRow?.levelCommL3 ?? "0") || 0,
    4: parseFloat(settingsRow?.levelCommL4 ?? "0") || 0,
    5: parseFloat(settingsRow?.levelCommL5 ?? "0") || 0,
    6: parseFloat(settingsRow?.levelCommL6 ?? "0") || 0,
    7: parseFloat(settingsRow?.levelCommL7 ?? "0") || 0,
    8: parseFloat(settingsRow?.levelCommL8 ?? "0") || 0,
    9: parseFloat(settingsRow?.levelCommL9 ?? "0") || 0,
    10: parseFloat(settingsRow?.levelCommL10 ?? "0") || 0,
  };

  const allUsersFull = await db
    .select({
      id: usersTable.id,
      sponsorId: usersTable.sponsorId,
      isActive: usersTable.isActive,
      isAdmin: usersTable.isAdmin,
      totalInvested: usersTable.totalInvested,
    })
    .from(usersTable);
  const activeInvs = await db
    .select()
    .from(investmentsTable)
    .where(eq(investmentsTable.status, "active"));

  // Mirror the distribution engine's ROI base: an account earns ROI only when it is
  // active AND has not already reached its earnings cap. (Cooling is a transient
  // per-investment timing gate, so we include it in this "potential" projection.)
  const dpEarnedMap = await loadRoiLevelEarnedMap();
  const dpDirectVol = buildDirectVolumeMap(
    allUsersFull.map((u) => ({ id: u.id, sponsorId: u.sponsorId, totalInvested: u.totalInvested })),
  );
  const dpCs = settingsRow ? capSettingsFrom(settingsRow) : { enabled: true, base: 2, boosted: 3 };
  const capReached = new Set<number>();
  if (dpCs.enabled) {
    for (const u of allUsersFull) {
      const info = capForUser(u, dpDirectVol.get(u.id) ?? 0, dpEarnedMap.get(u.id) ?? 0, dpCs);
      if (info.cap !== Infinity && (dpEarnedMap.get(u.id) ?? 0) + 1e-9 >= info.cap) capReached.add(u.id);
    }
  }
  const activeUser = new Map(allUsersFull.map((u) => [u.id, !!u.isActive]));
  const earnable = (uid: number) => (activeUser.get(uid) ?? false) && !capReached.has(uid);

  // ROI principal per earnable user from active investments (Safe-plan token portion excluded).
  const roiPrincipalByUser = new Map<number, number>();
  for (const inv of activeInvs) {
    if (!earnable(inv.userId)) continue;
    const amt = parseFloat(inv.amount) || 0;
    const tok = parseFloat((inv as any).tokenPurchaseAmount ?? "0") || 0;
    const roiP = Math.max(0, amt - tok);
    roiPrincipalByUser.set(inv.userId, (roiPrincipalByUser.get(inv.userId) ?? 0) + roiP);
  }

  // If the current user themselves can't earn (inactive / cap reached), both their
  // ROI and level commission would be clamped to zero by the engine.
  const selfEarnable = earnable(user.id);
  let dailyRoiUsd = selfEarnable ? (roiPrincipalByUser.get(user.id) ?? 0) * dailyRoiRate : 0;

  // Downline by depth (level 1..10): each member's daily ROI × that level's rate.
  // Assumes the user passes every level's qualification (best-case potential).
  const childrenMap = new Map<number, number[]>();
  for (const uu of allUsersFull) {
    if (uu.sponsorId != null) {
      const arr = childrenMap.get(uu.sponsorId) ?? [];
      arr.push(uu.id);
      childrenMap.set(uu.sponsorId, arr);
    }
  }
  let dailyLevelUsd = 0;
  if (selfEarnable) {
    let frontier = [user.id];
    for (let level = 1; level <= 10; level++) {
      const next: number[] = [];
      for (const pid of frontier) {
        for (const cid of childrenMap.get(pid) ?? []) {
          next.push(cid);
          const childDailyRoi = (roiPrincipalByUser.get(cid) ?? 0) * dailyRoiRate;
          dailyLevelUsd += childDailyRoi * (levelRates[level] ?? 0);
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
  }

  // Clamp the projection to the current user's remaining cap room (partial clamp),
  // mirroring the engine's clampToCap so a near-cap user is never overstated.
  if (capInfo.cap !== Infinity) {
    const room = Math.max(0, capInfo.cap - capInfo.earned);
    const projTotal = dailyRoiUsd + dailyLevelUsd;
    if (projTotal > room) {
      const scale = projTotal > 0 ? room / projTotal : 0;
      dailyRoiUsd *= scale;
      dailyLevelUsd *= scale;
    }
  }

  const dailyPotential = {
    dailyRoiRate,
    roiUsd: dailyRoiUsd,
    levelUsd: dailyLevelUsd,
    totalUsd: dailyRoiUsd + dailyLevelUsd,
  };

  res.json({
    earningsCap,
    dailyPotential,
    totalEarnings: usdtEarningsTotal,   // USDT only — what can actually be withdrawn
    wtaEarningsTotal,                    // WTA tokens total (daily + level comm)
    dailyReturnTotal,
    spotReferralTotal,
    levelCommissionTotal,
    rankBonusTotal,
    tokenSaleTotal,
    usdtEarningsTotal,
    availableBalance: Math.max(0, availableBalance),
    withdrawnTotal,
    pendingWithdrawal,
  });
});

export default router;
