import { sql } from "drizzle-orm";
import { db as defaultDb } from "./index";
import { ranksTable } from "./schema";

// Format a USD amount the same way the admin rank UI does (see deriveRankDisplay
// in artifacts/api-server/src/routes/admin.ts) so seeded criteria/reward strings
// match anything later created through the admin panel.
function fmtUsd(n: number): string {
  return n % 1 === 0
    ? `$${n.toLocaleString("en-US")}`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type DefaultRank = {
  rankNumber: number;
  name: string;
  selfInvestmentMin: number;
  directBusinessMin: number;
  teamBusinessMin: number;
  rewardMonthlyAmount: number;
  rewardMonths: number;
};

// A sensible default ladder (Bronze → Diamond) with escalating self-invest,
// direct-business and team-business minimums and monthly reward schedules.
// Admins can edit/delete these freely from the admin Ranks panel afterwards.
export const DEFAULT_RANKS: DefaultRank[] = [
  { rankNumber: 1, name: "Bronze", selfInvestmentMin: 100, directBusinessMin: 500, teamBusinessMin: 1_000, rewardMonthlyAmount: 10, rewardMonths: 6 },
  { rankNumber: 2, name: "Silver", selfInvestmentMin: 250, directBusinessMin: 2_000, teamBusinessMin: 5_000, rewardMonthlyAmount: 25, rewardMonths: 6 },
  { rankNumber: 3, name: "Gold", selfInvestmentMin: 500, directBusinessMin: 5_000, teamBusinessMin: 25_000, rewardMonthlyAmount: 75, rewardMonths: 8 },
  { rankNumber: 4, name: "Platinum", selfInvestmentMin: 1_000, directBusinessMin: 15_000, teamBusinessMin: 100_000, rewardMonthlyAmount: 250, rewardMonths: 10 },
  { rankNumber: 5, name: "Diamond", selfInvestmentMin: 2_500, directBusinessMin: 50_000, teamBusinessMin: 500_000, rewardMonthlyAmount: 1_000, rewardMonths: 12 },
];

function toRow(r: DefaultRank): typeof ranksTable.$inferInsert {
  const criteria = `Self invest ≥ ${fmtUsd(r.selfInvestmentMin)} · Direct business ≥ ${fmtUsd(r.directBusinessMin)} · Team business ≥ ${fmtUsd(r.teamBusinessMin)}`;
  const reward =
    r.rewardMonths > 0 && r.rewardMonthlyAmount > 0
      ? `${fmtUsd(r.rewardMonthlyAmount)}/month × ${r.rewardMonths} months (${fmtUsd(r.rewardMonthlyAmount * r.rewardMonths)} total)`
      : "—";
  return {
    rankNumber: r.rankNumber,
    name: r.name,
    criteria,
    reward,
    selfInvestmentMin: r.selfInvestmentMin.toFixed(6),
    directBusinessMin: r.directBusinessMin.toFixed(6),
    teamBusinessMin: r.teamBusinessMin.toFixed(6),
    legTopPct: 40,
    legSecondPct: 30,
    legRestPct: 30,
    rewardMonthlyAmount: r.rewardMonthlyAmount.toFixed(6),
    rewardMonths: r.rewardMonths,
  };
}

/**
 * Seed the default rank ladder.
 *
 * Idempotent in two ways:
 *  1. It only seeds when the ranks table is completely empty, so it never fights
 *     an admin who has customised or deleted ranks.
 *  2. The insert still uses ON CONFLICT DO NOTHING on the unique rank_number, so
 *     concurrent callers can't create duplicates.
 */
export async function seedRanks(database = defaultDb): Promise<{ inserted: number; skipped: boolean }> {
  const [{ count }] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(ranksTable);

  if (count > 0) {
    return { inserted: 0, skipped: true };
  }

  const inserted = await database
    .insert(ranksTable)
    .values(DEFAULT_RANKS.map(toRow))
    .onConflictDoNothing({ target: ranksTable.rankNumber })
    .returning();

  return { inserted: inserted.length, skipped: false };
}
