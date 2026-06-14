import {
  db,
  usersTable,
  ranksTable,
  rankRewardSchedulesTable,
  incomeTable,
} from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

type RankRow = typeof ranksTable.$inferSelect;

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export interface LegBand {
  band: "top" | "second" | "rest";
  current: number; // actual leg volume
  required: number; // cap amount counted toward the requirement
}

export interface RankMetrics {
  selfInvest: number; // user's own total invested
  directBusiness: number; // combined PERSONAL invest of all direct referrals
  legVolumes: number[]; // each direct's whole-team volume, sorted desc
}

// Build children adjacency + per-user personal invested maps from a flat list.
export function buildMaps(
  allUsers: { id: number; sponsorId: number | null; totalInvested: string }[],
) {
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
  return { children, invested };
}

// Whole-team volume of a single user: their own invest + entire downline's invest.
function legVolumeOf(
  rootId: number,
  children: Map<number, number[]>,
  invested: Map<number, number>,
): number {
  let vol = invested.get(rootId) ?? 0;
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const cid = stack.pop()!;
    vol += invested.get(cid) ?? 0;
    for (const gc of children.get(cid) ?? []) stack.push(gc);
  }
  return vol;
}

export function computeUserRankMetrics(
  userId: number,
  children: Map<number, number[]>,
  invested: Map<number, number>,
): RankMetrics {
  const directs = children.get(userId) ?? [];
  const selfInvest = invested.get(userId) ?? 0;
  let directBusiness = 0;
  const legVolumes: number[] = [];
  for (const d of directs) {
    directBusiness += invested.get(d) ?? 0;
    legVolumes.push(legVolumeOf(d, children, invested));
  }
  legVolumes.sort((a, b) => b - a);
  return { selfInvest, directBusiness, legVolumes };
}

// Balanced-leg counted business: top leg counts up to topPct% of the requirement,
// second up to secondPct%, all remaining legs combined up to restPct%.
export function balancedTeamBusiness(
  legVolumes: number[],
  teamReq: number,
  topPct: number,
  secondPct: number,
  restPct: number,
): { counted: number; bands: LegBand[] } {
  const topCap = teamReq * (topPct / 100);
  const secondCap = teamReq * (secondPct / 100);
  const restCap = teamReq * (restPct / 100);
  const top = legVolumes[0] ?? 0;
  const second = legVolumes[1] ?? 0;
  const rest = legVolumes.slice(2).reduce((s, v) => s + v, 0);
  const topC = Math.min(top, topCap);
  const secondC = Math.min(second, secondCap);
  const restC = Math.min(rest, restCap);
  return {
    counted: topC + secondC + restC,
    bands: [
      { band: "top", current: top, required: topCap },
      { band: "second", current: second, required: secondCap },
      { band: "rest", current: rest, required: restCap },
    ],
  };
}

export function qualifiesForRank(metrics: RankMetrics, rank: RankRow): boolean {
  const selfMin = parseFloat(rank.selfInvestmentMin ?? "0") || 0;
  const directMin = parseFloat(rank.directBusinessMin ?? "0") || 0;
  const teamMin = parseFloat(rank.teamBusinessMin ?? "0") || 0;
  if (metrics.selfInvest + 1e-9 < selfMin) return false;
  if (metrics.directBusiness + 1e-9 < directMin) return false;
  if (teamMin > 0) {
    const { counted } = balancedTeamBusiness(
      metrics.legVolumes,
      teamMin,
      rank.legTopPct,
      rank.legSecondPct,
      rank.legRestPct,
    );
    if (counted + 1e-9 < teamMin) return false;
  }
  return true;
}

// Highest-numbered rank the metrics satisfy.
export function highestQualifiedRank(
  metrics: RankMetrics,
  ranks: RankRow[],
): RankRow | null {
  let best: RankRow | null = null;
  for (const r of ranks) {
    if (qualifiesForRank(metrics, r)) {
      if (!best || r.rankNumber > best.rankNumber) best = r;
    }
  }
  return best;
}

// Detailed per-requirement progress for a given target rank.
export function rankProgressForRank(metrics: RankMetrics, rank: RankRow) {
  const selfMin = parseFloat(rank.selfInvestmentMin ?? "0") || 0;
  const directMin = parseFloat(rank.directBusinessMin ?? "0") || 0;
  const teamMin = parseFloat(rank.teamBusinessMin ?? "0") || 0;
  const team = balancedTeamBusiness(
    metrics.legVolumes,
    teamMin,
    rank.legTopPct,
    rank.legSecondPct,
    rank.legRestPct,
  );
  return {
    self: { current: metrics.selfInvest, required: selfMin },
    direct: { current: metrics.directBusiness, required: directMin },
    legs: team.bands,
  };
}

/**
 * Periodic engine:
 *  1. Auto-promote every user UPWARD to the highest rank they qualify for
 *     (ranks are sticky — never auto-demoted). On promotion any active reward
 *     schedule is superseded and a fresh one for the new rank starts now.
 *  2. Pay every active schedule whose next payout date has arrived. The monthly
 *     amount is credited to the Withdraw Wallet, recorded in income history,
 *     months-paid is incremented, and the next payout advances by one month.
 *     The conditional UPDATE (guarded on status + nextPayoutAt + monthsPaid)
 *     makes each month's payment atomic and idempotent — never double-paid.
 */
// In-process guard so overlapping triggers (startup run + daily cron + manual
// admin trigger, all in the same Node process) never run concurrently. The
// partial unique index on active schedules is the cross-process safety net.
let engineRunning = false;

export async function runRankEngine(): Promise<{
  promoted: number;
  paid: number;
  paidAmount: number;
}> {
  if (engineRunning) {
    logger.info("Rank engine already running — skipping overlapping invocation");
    return { promoted: 0, paid: 0, paidAmount: 0 };
  }
  engineRunning = true;
  try {
    return await runRankEngineInner();
  } finally {
    engineRunning = false;
  }
}

async function runRankEngineInner(): Promise<{
  promoted: number;
  paid: number;
  paidAmount: number;
}> {
  const ranks = await db.select().from(ranksTable).orderBy(ranksTable.rankNumber);
  const rankById = new Map(ranks.map((r) => [r.id, r]));
  const allUsers = await db.select().from(usersTable);
  const { children, invested } = buildMaps(
    allUsers.map((u) => ({ id: u.id, sponsorId: u.sponsorId, totalInvested: u.totalInvested })),
  );

  // ── 1. Auto-promotion (upward only) ──
  let promoted = 0;
  for (const u of allUsers) {
    const metrics = computeUserRankMetrics(u.id, children, invested);
    const best = highestQualifiedRank(metrics, ranks);
    if (!best) continue;
    const currentRank = u.currentRankId != null ? rankById.get(u.currentRankId) : undefined;
    const currentNum = currentRank?.rankNumber ?? 0;
    if (best.rankNumber <= currentNum) continue;
    try {
      await db.transaction(async (tx) => {
        await tx.update(usersTable).set({ currentRankId: best.id }).where(eq(usersTable.id, u.id));
        await tx
          .update(rankRewardSchedulesTable)
          .set({ status: "superseded" })
          .where(
            and(
              eq(rankRewardSchedulesTable.userId, u.id),
              eq(rankRewardSchedulesTable.status, "active"),
            ),
          );
        const months = best.rewardMonths ?? 0;
        const monthly = parseFloat(best.rewardMonthlyAmount ?? "0") || 0;
        if (months > 0 && monthly > 0) {
          await tx.insert(rankRewardSchedulesTable).values({
            userId: u.id,
            rankId: best.id,
            monthlyAmount: monthly.toFixed(6),
            totalMonths: months,
            monthsPaid: 0,
            // First reward is due one month after achieving the rank, so payouts
            // are truly monthly rather than firing immediately on promotion.
            nextPayoutAt: new Date(Date.now() + MONTH_MS),
            status: "active",
          });
        }
      });
      promoted++;
    } catch (err) {
      logger.error({ err, userId: u.id }, "Rank promotion failed");
    }
  }

  // ── 2. Monthly payouts ──
  let paid = 0;
  let paidAmount = 0;
  const now = new Date();
  const due = await db
    .select()
    .from(rankRewardSchedulesTable)
    .where(
      and(
        eq(rankRewardSchedulesTable.status, "active"),
        lte(rankRewardSchedulesTable.nextPayoutAt, now),
      ),
    );
  for (const sch of due) {
    if (sch.monthsPaid >= sch.totalMonths) continue;
    const monthly = parseFloat(sch.monthlyAmount) || 0;
    if (monthly <= 0) continue;
    const rank = rankById.get(sch.rankId);
    try {
      const ok = await db.transaction(async (tx) => {
        const newMonthsPaid = sch.monthsPaid + 1;
        const completed = newMonthsPaid >= sch.totalMonths;
        const newNext = new Date(sch.nextPayoutAt.getTime() + MONTH_MS);
        // Atomic claim — guarded so concurrent/repeat runs can't double-pay.
        const claimed = await tx
          .update(rankRewardSchedulesTable)
          .set({
            monthsPaid: newMonthsPaid,
            nextPayoutAt: newNext,
            status: completed ? "completed" : "active",
          })
          .where(
            and(
              eq(rankRewardSchedulesTable.id, sch.id),
              eq(rankRewardSchedulesTable.status, "active"),
              lte(rankRewardSchedulesTable.nextPayoutAt, now),
              sql`${rankRewardSchedulesTable.monthsPaid} = ${sch.monthsPaid}`,
            ),
          )
          .returning({ id: rankRewardSchedulesTable.id });
        if (claimed.length === 0) return false;
        await tx
          .update(usersTable)
          .set({
            withdrawBalance: sql`${usersTable.withdrawBalance} + ${monthly.toFixed(6)}::numeric`,
            totalEarnings: sql`${usersTable.totalEarnings} + ${monthly.toFixed(6)}::numeric`,
          })
          .where(eq(usersTable.id, sch.userId));
        await tx.insert(incomeTable).values({
          userId: sch.userId,
          type: "rank_bonus",
          amount: monthly.toFixed(6),
          description: `${rank?.name ?? "Rank"} reward — month ${newMonthsPaid} of ${sch.totalMonths}`,
        });
        return true;
      });
      if (ok) {
        paid++;
        paidAmount += monthly;
      }
    } catch (err) {
      logger.error({ err, scheduleId: sch.id }, "Rank reward payout failed");
    }
  }

  logger.info({ promoted, paid, paidAmount }, "Rank engine run complete");
  return { promoted, paid, paidAmount };
}
