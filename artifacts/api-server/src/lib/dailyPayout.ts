import { db, investmentsTable, usersTable, incomeTable, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

async function getIncomeSettings() {
  const [s] = await db.select().from(platformSettingsTable).limit(1);
  if (!s) return null;
  return {
    withdrawalCoolingHours: s.withdrawalCoolingHours ?? 24,
    levelRates: {
      1: parseFloat(s.levelCommL1),
      2: parseFloat(s.levelCommL2),
      3: parseFloat(s.levelCommL3),
      4: parseFloat(s.levelCommL4),
      5: parseFloat(s.levelCommL5),
      6: parseFloat(s.levelCommL6),
      7: parseFloat(s.levelCommL7),
      8: parseFloat(s.levelCommL8),
    } as Record<number, number>,
    levelUnlocks: {
      1: 0,
      2: parseFloat(s.levelUnlockL2),
      3: parseFloat(s.levelUnlockL3),
      4: parseFloat(s.levelUnlockL4),
      5: parseFloat(s.levelUnlockL5),
      6: parseFloat(s.levelUnlockL6),
      7: parseFloat(s.levelUnlockL7),
      8: parseFloat(s.levelUnlockL8),
    } as Record<number, number>,
    levelDays: {
      1: s.levelDaysL1,
      2: s.levelDaysL2,
      3: s.levelDaysL3,
      4: s.levelDaysL4,
      5: s.levelDaysL5,
      6: s.levelDaysL6,
      7: s.levelDaysL7,
      8: s.levelDaysL8,
    } as Record<number, number>,
  };
}

// Fallback defaults if no settings row exists yet
const DEFAULT_LEVEL_RATES: Record<number, number> = {
  1: 0.20, 2: 0.10, 3: 0.10,
  4: 0.04, 5: 0.04, 6: 0.04, 7: 0.04, 8: 0.04,
};
const DEFAULT_LEVEL_UNLOCKS: Record<number, number> = {
  1: 0, 2: 1000, 3: 3000,
  4: 10000, 5: 10000, 6: 10000, 7: 10000, 8: 10000,
};
const DEFAULT_LEVEL_DAYS: Record<number, number> = {
  1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0,
};

/**
 * Precompute team business volume for every user in one DB round-trip.
 *
 * Business volume of user X = sum of totalInvested for every member
 * in X's entire downline (all generations, excluding X themselves).
 *
 * Algorithm:
 *  1. Fetch all users (id, sponsorId, totalInvested).
 *  2. Build a children map: parentId -> [childId, ...].
 *  3. For each user, DFS-sum all descendants' totalInvested.
 *
 * Returns Map<userId, teamBusinessVolume>.
 */
async function buildTeamBusinessVolumeMap(): Promise<Map<number, number>> {
  const allUsers = await db
    .select({ id: usersTable.id, sponsorId: usersTable.sponsorId, totalInvested: usersTable.totalInvested })
    .from(usersTable);

  // children map: parentId -> child ids
  const children = new Map<number, number[]>();
  for (const u of allUsers) {
    if (u.sponsorId != null) {
      const arr = children.get(u.sponsorId) ?? [];
      arr.push(u.id);
      children.set(u.sponsorId, arr);
    }
  }

  // totalInvested per user (as number)
  const invested = new Map<number, number>();
  for (const u of allUsers) {
    invested.set(u.id, parseFloat(u.totalInvested ?? "0") || 0);
  }

  // DFS sum for a given root (excludes root itself)
  function teamVolume(userId: number): number {
    let vol = 0;
    const stack = [...(children.get(userId) ?? [])];
    while (stack.length > 0) {
      const cid = stack.pop()!;
      vol += invested.get(cid) ?? 0;
      const grandchildren = children.get(cid) ?? [];
      for (const gc of grandchildren) stack.push(gc);
    }
    return vol;
  }

  const volumeMap = new Map<number, number>();
  for (const u of allUsers) {
    volumeMap.set(u.id, teamVolume(u.id));
  }
  return volumeMap;
}

export async function processDailyPayout(): Promise<{ processed: number; skipped: number; errors: number }> {
  const stats = { processed: 0, skipped: 0, errors: 0 };

  logger.info("Daily payout started");

  const cfg = await getIncomeSettings();
  const coolingHours = cfg?.withdrawalCoolingHours ?? 24;
  const levelRates   = cfg?.levelRates   ?? DEFAULT_LEVEL_RATES;
  const levelUnlocks = cfg?.levelUnlocks ?? DEFAULT_LEVEL_UNLOCKS;
  const levelDays    = cfg?.levelDays    ?? DEFAULT_LEVEL_DAYS;

  // Build business-volume map once before the loop (single DB query)
  const teamVolumeMap = await buildTeamBusinessVolumeMap();

  const activeInvestments = await db
    .select()
    .from(investmentsTable)
    .where(eq(investmentsTable.status, "active"));

  logger.info({ count: activeInvestments.length }, "Active investments found");

  const now = new Date();

  for (const inv of activeInvestments) {
    try {
      // ── Cooling period: skip investments created less than N hours ago ──
      const hoursElapsed = (now.getTime() - new Date(inv.createdAt).getTime()) / 3_600_000;
      if (hoursElapsed < coolingHours) {
        logger.info({ investmentId: inv.id, hoursElapsed: hoursElapsed.toFixed(1), coolingHours }, "Investment in cooling period — skipping");
        stats.skipped++;
        continue;
      }

      const dailyReturn  = parseFloat(inv.amount) * parseFloat(inv.dailyRate);
      const newEarned    = parseFloat(inv.earnedSoFar) + dailyReturn;
      const newRemaining = Math.max(0, inv.remainingDays - 1);
      const isCompleted  = newRemaining === 0;

      // daysElapsed counts how many distributions have been run INCLUDING this one.
      const daysElapsed = inv.durationDays - newRemaining;

      // Update investment
      await db.update(investmentsTable)
        .set({
          earnedSoFar:  newEarned.toString(),
          remainingDays: newRemaining,
          status: isCompleted ? "completed" : "active",
        })
        .where(eq(investmentsTable.id, inv.id));

      // Fetch investor — skip earnings entirely if account is inactive
      const [investor] = await db.select().from(usersTable).where(eq(usersTable.id, inv.userId)).limit(1);
      if (!investor || !investor.isActive) {
        logger.info({ investmentId: inv.id, userId: inv.userId }, "Investor account inactive — skipping daily return");
        stats.skipped++;
        continue;
      }

      // Credit daily return to investor
      await db.insert(incomeTable).values({
        userId: inv.userId,
        type: "daily_return",
        amount: dailyReturn.toString(),
        description: `Daily return on $${parseFloat(inv.amount).toFixed(2)} investment`,
      });

      // Update investor totalEarnings
      await db.update(usersTable)
        .set({ totalEarnings: (parseFloat(investor.totalEarnings) + dailyReturn).toString() })
        .where(eq(usersTable.id, inv.userId));

      // ── Level commissions — walk up the sponsor chain (up to 8 levels) ──
      let currentUserId: number | null = investor.sponsorId;
      let level = 1;

      while (currentUserId && level <= 8) {
        const [upline] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId)).limit(1);
        if (!upline) break;

        // Skip commission for inactive upline — but continue walking up the chain
        if (!upline.isActive) {
          currentUserId = upline.sponsorId;
          level++;
          continue;
        }

        const unlockThreshold = levelUnlocks[level] ?? 0;
        const maxDays         = levelDays[level] ?? 0; // 0 = unlimited

        // Unlock check: based on upline's TEAM BUSINESS VOLUME
        // (total amount invested by everyone in the upline's entire downline)
        const uplineTeamVolume = teamVolumeMap.get(upline.id) ?? 0;

        // Skip if this level's commission period has expired.
        if (maxDays > 0 && daysElapsed > maxDays) {
          currentUserId = upline.sponsorId;
          level++;
          continue;
        }

        if (uplineTeamVolume >= unlockThreshold) {
          const rate       = levelRates[level] ?? 0;
          const commission = dailyReturn * rate;

          if (commission > 0) {
            await db.insert(incomeTable).values({
              userId: upline.id,
              type: "level_commission",
              amount: commission.toString(),
              description: `Level ${level} commission from ${investor.name || investor.email}`,
              fromUserId: inv.userId,
              fromUserName: investor.name || investor.email,
              level,
            });

            await db.update(usersTable)
              .set({ totalEarnings: (parseFloat(upline.totalEarnings) + commission).toString() })
              .where(eq(usersTable.id, upline.id));
          }
        }

        currentUserId = upline.sponsorId;
        level++;
      }

      stats.processed++;
    } catch (err) {
      logger.error({ err, investmentId: inv.id }, "Error processing daily payout for investment");
      stats.errors++;
    }
  }

  logger.info(stats, "Daily payout completed");
  return stats;
}
