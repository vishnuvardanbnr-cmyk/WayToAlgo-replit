import { Router } from "express";
import { db, ranksTable, usersTable, rankRewardSchedulesTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  buildMaps,
  computeUserRankMetrics,
  highestQualifiedRank,
  rankProgressForRank,
} from "../lib/rankEngine";

const router = Router();

function rankToResponse(r: typeof ranksTable.$inferSelect) {
  return {
    id: r.id,
    rankNumber: r.rankNumber,
    name: r.name,
    criteria: r.criteria,
    reward: r.reward,
    selfInvestmentMin: parseFloat(r.selfInvestmentMin),
    directBusinessMin: parseFloat(r.directBusinessMin),
    teamBusinessMin: parseFloat(r.teamBusinessMin),
    legTopPct: r.legTopPct,
    legSecondPct: r.legSecondPct,
    legRestPct: r.legRestPct,
    rewardMonthlyAmount: parseFloat(r.rewardMonthlyAmount),
    rewardMonths: r.rewardMonths,
    requiresRankId: r.requiresRankId,
    requiresCount: r.requiresCount,
    requiresLevels: r.requiresLevels,
  };
}

// GET /api/ranks
router.get("/ranks", async (_req, res) => {
  const ranks = await db.select().from(ranksTable).orderBy(ranksTable.rankNumber);
  res.json(ranks.map(rankToResponse));
});

// GET /api/ranks/my-progress
router.get("/ranks/my-progress", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const ranks = await db.select().from(ranksTable).orderBy(ranksTable.rankNumber);

  const currentRank = user.currentRankId ? ranks.find((r) => r.id === user.currentRankId) : undefined;
  const currentRankNumber = currentRank?.rankNumber ?? 0;
  // Next rank = the smallest rank strictly above the current one. Using a search
  // (not currentRankNumber + 1) so non-contiguous rank numbers — possible after
  // a rank is deleted or renumbered — still resolve a valid next target. `ranks`
  // is already ordered ascending by rankNumber.
  const nextRank = ranks.find((r) => r.rankNumber > currentRankNumber);

  // Compute this user's qualification metrics from the full member graph.
  const allUsers = await db.select({ id: usersTable.id, sponsorId: usersTable.sponsorId, totalInvested: usersTable.totalInvested }).from(usersTable);
  const { children, invested } = buildMaps(allUsers);
  const metrics = computeUserRankMetrics(user.id, children, invested);

  // Sanity: surface the highest rank they actually qualify for (auto-promotion
  // runs on a schedule, so this can be ahead of the stored currentRankId).
  const qualified = highestQualifiedRank(metrics, ranks);

  // Detailed progress toward the next rank (or, if maxed out, the current one).
  const target = nextRank ?? currentRank;
  const progress = target ? rankProgressForRank(metrics, target) : null;

  // Active reward schedule status (for the current rank).
  const [schedule] = await db
    .select()
    .from(rankRewardSchedulesTable)
    .where(
      and(
        eq(rankRewardSchedulesTable.userId, user.id),
        inArray(rankRewardSchedulesTable.status, ["active", "completed"]),
      ),
    )
    .orderBy(desc(rankRewardSchedulesTable.startedAt))
    .limit(1);

  const response: any = {
    metrics: {
      selfInvest: metrics.selfInvest,
      directBusiness: metrics.directBusiness,
      legVolumes: metrics.legVolumes,
    },
    progress,
  };
  if (currentRank) response.currentRank = rankToResponse(currentRank);
  if (nextRank) response.nextRank = rankToResponse(nextRank);
  if (qualified) response.qualifiedRank = rankToResponse(qualified);
  if (schedule) {
    response.schedule = {
      rankId: schedule.rankId,
      monthlyAmount: parseFloat(schedule.monthlyAmount),
      totalMonths: schedule.totalMonths,
      monthsPaid: schedule.monthsPaid,
      nextPayoutAt: schedule.status === "active" ? schedule.nextPayoutAt.toISOString() : null,
      status: schedule.status,
    };
  }

  res.json(response);
});

export default router;
