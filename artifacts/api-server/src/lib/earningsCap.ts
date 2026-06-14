import { db, usersTable, tokenRewardsTable, platformSettingsTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";

export interface CapSettings {
  enabled: boolean;
  base: number;
  boosted: number;
}

export interface CapInfo {
  enabled: boolean;
  personalInvested: number;
  directVolume: number;
  multiplier: number; // 2 / 3 (or whatever base/boosted are configured to)
  cap: number; // USD ceiling on ROI + level earnings; Infinity when uncapped
  earned: number; // cumulative USD earned from roi + level so far
  remaining: number; // cap - earned (Infinity when uncapped)
  reached: boolean;
}

export function capSettingsFrom(
  s: typeof platformSettingsTable.$inferSelect,
): CapSettings {
  return {
    enabled: s.earningsCapEnabled ?? true,
    base: parseFloat(s.earningsCapBase ?? "2") || 2,
    boosted: parseFloat(s.earningsCapBoosted ?? "3") || 3,
  };
}

/**
 * Sum of each user's DIRECT referrals' totalInvested (level-1 downline only),
 * keyed by the sponsor's user id.
 */
export function buildDirectVolumeMap(
  allUsers: { id: number; sponsorId: number | null; totalInvested: string }[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const u of allUsers) {
    if (u.sponsorId != null) {
      const amt = parseFloat(u.totalInvested ?? "0") || 0;
      map.set(u.sponsorId, (map.get(u.sponsorId) ?? 0) + amt);
    }
  }
  return map;
}

/** Cumulative USD earned from roi + level token rewards, keyed by user id. */
export async function loadRoiLevelEarnedMap(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      userId: tokenRewardsTable.userId,
      total: sql<string>`coalesce(sum(${tokenRewardsTable.usdValue}), 0)`,
    })
    .from(tokenRewardsTable)
    .where(inArray(tokenRewardsTable.type, ["roi", "level"]))
    .groupBy(tokenRewardsTable.userId);
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.userId, parseFloat(r.total) || 0);
  return map;
}

/**
 * Compute a single user's earnings cap. Admin accounts are always uncapped.
 * multiplier = boosted when directVolume > personalInvested, else base.
 */
export function capForUser(
  user: { isAdmin?: boolean | null; totalInvested: string },
  directVolume: number,
  earned: number,
  cs: CapSettings,
): CapInfo {
  const personalInvested = parseFloat(user.totalInvested ?? "0") || 0;
  const uncapped = !cs.enabled || !!user.isAdmin;
  const multiplier = directVolume > personalInvested ? cs.boosted : cs.base;
  const cap = uncapped ? Infinity : personalInvested * multiplier;
  const remaining = uncapped ? Infinity : Math.max(0, cap - earned);
  return {
    enabled: cs.enabled && !user.isAdmin,
    personalInvested,
    directVolume,
    multiplier,
    cap,
    earned,
    remaining,
    reached: !uncapped && earned + 1e-9 >= cap,
  };
}
