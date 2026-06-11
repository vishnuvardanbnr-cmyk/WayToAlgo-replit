import { Router } from "express";
import { db, ranksTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function rankToResponse(r: typeof ranksTable.$inferSelect) {
  return {
    id: r.id,
    rankNumber: r.rankNumber,
    name: r.name,
    criteria: r.criteria,
    reward: r.reward,
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

  const currentRankId = user.currentRankId;
  const currentRank = currentRankId ? ranks.find(r => r.id === currentRankId) : undefined;
  const currentRankNumber = currentRank?.rankNumber ?? 0;
  const nextRank = ranks.find(r => r.rankNumber === currentRankNumber + 1);

  // Count how many levels they've completed (simplified by checking currentLevel)
  const levelsCompleted = user.currentLevel;

  // Count qualifying rank-1 referrers in their downline
  const directRefs = await db.select().from(usersTable).where(eq(usersTable.sponsorId, user.id));
  const qualifyingReferrersCount = directRefs.filter(u => u.currentRankId !== null).length;

  // Lugs progress (3-leg requirement for ranks 2+)
  const lugsProgress = [];
  const legRequirement = nextRank?.rankNumber === 2 ? 10000
    : nextRank?.rankNumber === 3 ? 25000
    : nextRank?.rankNumber === 4 ? 50000
    : nextRank?.rankNumber === 5 ? 100000
    : 10000;

  for (let i = 0; i < 3; i++) {
    const legUser = directRefs[i];
    let legBusiness = 0;
    if (legUser) {
      legBusiness = parseFloat(legUser.totalInvested);
    }
    lugsProgress.push({ lugIndex: i + 1, business: legBusiness, required: legRequirement });
  }

  const response: any = {
    levelsCompleted,
    qualifyingReferrersCount,
    lugsProgress,
  };
  if (currentRank) response.currentRank = rankToResponse(currentRank);
  if (nextRank) response.nextRank = rankToResponse(nextRank);

  res.json(response);
});

export default router;
