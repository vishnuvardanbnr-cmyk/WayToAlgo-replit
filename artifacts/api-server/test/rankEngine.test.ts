import { describe, it, expect, afterEach, beforeAll } from "vitest";
import {
  db,
  usersTable,
  ranksTable,
  rankRewardSchedulesTable,
  incomeTable,
} from "@workspace/db";
import { eq, inArray, and, lte } from "drizzle-orm";
import {
  buildMaps,
  computeUserRankMetrics,
  balancedTeamBusiness,
  qualifiesForRank,
  highestQualifiedRank,
  rankProgressForRank,
  runRankEngine,
} from "../src/lib/rankEngine";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

type RankRow = typeof ranksTable.$inferSelect;

// ── Fixtures ─────────────────────────────────────────────────────────────────
const createdUserIds: number[] = [];
const createdRankIds: number[] = [];

// High base so generated rank numbers don't collide with real/seeded ranks.
let rankCounter = 90000 + Math.floor(Math.random() * 9000);

async function createRank(opts: {
  rankNumber?: number;
  selfMin?: number;
  directMin?: number;
  teamMin?: number;
  legTop?: number;
  legSecond?: number;
  legRest?: number;
  monthly?: number;
  months?: number;
}): Promise<RankRow> {
  const rankNumber = opts.rankNumber ?? rankCounter++;
  const [r] = await db
    .insert(ranksTable)
    .values({
      rankNumber,
      name: `TestRank ${rankNumber}`,
      criteria: "test criteria",
      reward: "test reward",
      selfInvestmentMin: (opts.selfMin ?? 0).toFixed(6),
      directBusinessMin: (opts.directMin ?? 0).toFixed(6),
      teamBusinessMin: (opts.teamMin ?? 0).toFixed(6),
      legTopPct: opts.legTop ?? 40,
      legSecondPct: opts.legSecond ?? 30,
      legRestPct: opts.legRest ?? 30,
      rewardMonthlyAmount: (opts.monthly ?? 0).toFixed(6),
      rewardMonths: opts.months ?? 0,
    })
    .returning();
  createdRankIds.push(r.id);
  return r;
}

async function createUser(opts: {
  totalInvested?: number;
  sponsorId?: number | null;
  currentRankId?: number | null;
} = {}) {
  const uniq = `rtest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const [u] = await db
    .insert(usersTable)
    .values({
      name: `Test ${uniq}`,
      email: `${uniq}@test.local`,
      phone: "0000000000",
      passwordHash: "not-a-real-hash",
      referralCode: uniq,
      isActive: true,
      totalInvested: (opts.totalInvested ?? 0).toFixed(6),
      sponsorId: opts.sponsorId ?? null,
      currentRankId: opts.currentRankId ?? null,
      withdrawBalance: "0",
      totalEarnings: "0",
    })
    .returning();
  createdUserIds.push(u.id);
  return u;
}

async function getUser(id: number) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return u;
}

async function getActiveSchedules(userId: number) {
  return db
    .select()
    .from(rankRewardSchedulesTable)
    .where(
      and(
        eq(rankRewardSchedulesTable.userId, userId),
        eq(rankRewardSchedulesTable.status, "active"),
      ),
    );
}

async function getAllSchedules(userId: number) {
  return db
    .select()
    .from(rankRewardSchedulesTable)
    .where(eq(rankRewardSchedulesTable.userId, userId));
}

async function countRankBonusIncome(userId: number): Promise<number> {
  const rows = await db
    .select()
    .from(incomeTable)
    .where(and(eq(incomeTable.userId, userId), eq(incomeTable.type, "rank_bonus")));
  return rows.length;
}

// runRankEngine() scans EVERY user/rank in the shared dev DB. Snapshot the
// pre-existing ("ambient") users so afterEach can restore any rank/balance the
// engine might have mutated if one of them happened to qualify for a test rank.
type AmbientSnapshot = {
  id: number;
  currentRankId: number | null;
  withdrawBalance: string;
  totalEarnings: string;
};
let ambientUsers: AmbientSnapshot[] = [];

beforeAll(async () => {
  ambientUsers = await db
    .select({
      id: usersTable.id,
      currentRankId: usersTable.currentRankId,
      withdrawBalance: usersTable.withdrawBalance,
      totalEarnings: usersTable.totalEarnings,
    })
    .from(usersTable);
});

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(incomeTable).where(inArray(incomeTable.userId, createdUserIds));
    await db
      .delete(rankRewardSchedulesTable)
      .where(inArray(rankRewardSchedulesTable.userId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    createdUserIds.length = 0;
  }
  if (createdRankIds.length > 0) {
    // Sweep any schedules tied to test ranks (e.g. if an ambient user qualified).
    await db
      .delete(rankRewardSchedulesTable)
      .where(inArray(rankRewardSchedulesTable.rankId, createdRankIds));
    await db.delete(ranksTable).where(inArray(ranksTable.id, createdRankIds));
    createdRankIds.length = 0;
  }
  // Restore ambient users to their pre-test rank/balances in case the engine
  // promoted or paid one of them (keeps the suite safe on a shared DB).
  for (const u of ambientUsers) {
    await db
      .update(usersTable)
      .set({
        currentRankId: u.currentRankId,
        withdrawBalance: u.withdrawBalance,
        totalEarnings: u.totalEarnings,
      })
      .where(eq(usersTable.id, u.id));
  }
});

// A fake rank row for the pure-function tests (no DB needed).
function fakeRank(over: Partial<RankRow>): RankRow {
  return {
    id: 1,
    rankNumber: 1,
    name: "R",
    criteria: "",
    reward: "",
    selfInvestmentMin: "0",
    directBusinessMin: "0",
    teamBusinessMin: "0",
    legTopPct: 40,
    legSecondPct: 30,
    legRestPct: 30,
    rewardMonthlyAmount: "0",
    rewardMonths: 0,
    requiresRankId: null,
    requiresCount: null,
    requiresLevels: null,
    ...over,
  } as RankRow;
}

// ── Unit tests: pure qualification math ──────────────────────────────────────
describe("balancedTeamBusiness — 40/30/30 capping", () => {
  it("caps each band at its percentage of the team requirement", () => {
    // Four equal big legs, requirement 1000, caps 400/300/300.
    const { counted, bands } = balancedTeamBusiness([1000, 1000, 1000, 1000], 1000, 40, 30, 30);
    expect(bands[0]).toEqual({ band: "top", current: 1000, required: 400 });
    expect(bands[1]).toEqual({ band: "second", current: 1000, required: 300 });
    // rest = legs 3+4 combined = 2000, capped at 300.
    expect(bands[2]).toEqual({ band: "rest", current: 2000, required: 300 });
    expect(counted).toBe(1000); // 400 + 300 + 300
  });

  it("a single huge leg cannot satisfy the whole requirement alone", () => {
    const { counted } = balancedTeamBusiness([5000], 1000, 40, 30, 30);
    expect(counted).toBe(400); // top capped at 40% → 400 < 1000
  });

  it("counts under-cap legs at their actual value", () => {
    // top 100 (<400), second 0, rest 0.
    const { counted } = balancedTeamBusiness([100], 1000, 40, 30, 30);
    expect(counted).toBe(100);
  });

  it("a properly balanced team reaches exactly the requirement", () => {
    const { counted } = balancedTeamBusiness([400, 300, 200, 100], 1000, 40, 30, 30);
    expect(counted).toBe(1000); // 400 + 300 + (200+100 capped 300 → 300)
  });

  it("zero requirement yields zero caps", () => {
    const { counted, bands } = balancedTeamBusiness([1000], 0, 40, 30, 30);
    expect(counted).toBe(0);
    expect(bands.every((b) => b.required === 0)).toBe(true);
  });
});

describe("computeUserRankMetrics", () => {
  it("direct business is directs' PERSONAL invest only; legs are whole-team volume", () => {
    // U -> [A, B]; A -> [A1]. invest: U500, A100, A1 50, B200.
    const { children, invested } = buildMaps([
      { id: 1, sponsorId: null, totalInvested: "500" }, // U
      { id: 2, sponsorId: 1, totalInvested: "100" }, // A
      { id: 3, sponsorId: 2, totalInvested: "50" }, // A1 (under A)
      { id: 4, sponsorId: 1, totalInvested: "200" }, // B
    ]);
    const m = computeUserRankMetrics(1, children, invested);
    expect(m.selfInvest).toBe(500);
    expect(m.directBusiness).toBe(300); // A(100) + B(200), NOT A1
    // leg volumes: A subtree = 100 + 50 = 150; B subtree = 200 → sorted desc.
    expect(m.legVolumes).toEqual([200, 150]);
  });

  it("handles a user with no directs", () => {
    const { children, invested } = buildMaps([{ id: 1, sponsorId: null, totalInvested: "100" }]);
    const m = computeUserRankMetrics(1, children, invested);
    expect(m).toEqual({ selfInvest: 100, directBusiness: 0, legVolumes: [] });
  });
});

describe("qualifiesForRank / highestQualifiedRank", () => {
  const r1 = fakeRank({ id: 1, rankNumber: 1, selfInvestmentMin: "100" });
  const r2 = fakeRank({ id: 2, rankNumber: 2, selfInvestmentMin: "500" });
  const r3 = fakeRank({ id: 3, rankNumber: 3, selfInvestmentMin: "1000" });

  it("returns the highest rank whose requirements are met", () => {
    const m = { selfInvest: 500, directBusiness: 0, legVolumes: [] };
    expect(qualifiesForRank(m, r1)).toBe(true);
    expect(qualifiesForRank(m, r2)).toBe(true);
    expect(qualifiesForRank(m, r3)).toBe(false);
    expect(highestQualifiedRank(m, [r1, r2, r3])?.rankNumber).toBe(2);
  });

  it("fails when the balanced-leg team requirement is not met by one big leg", () => {
    const teamRank = fakeRank({ id: 9, rankNumber: 9, teamBusinessMin: "1000" });
    const m = { selfInvest: 0, directBusiness: 0, legVolumes: [5000] };
    expect(qualifiesForRank(m, teamRank)).toBe(false); // capped at 400 < 1000
  });

  it("passes when self, direct, and balanced team are all satisfied", () => {
    const rank = fakeRank({
      id: 9,
      rankNumber: 9,
      selfInvestmentMin: "100",
      directBusinessMin: "300",
      teamBusinessMin: "1000",
    });
    const m = { selfInvest: 100, directBusiness: 300, legVolumes: [400, 300, 300] };
    expect(qualifiesForRank(m, rank)).toBe(true);
  });

  it("returns null when no rank qualifies", () => {
    const m = { selfInvest: 10, directBusiness: 0, legVolumes: [] };
    expect(highestQualifiedRank(m, [r1, r2, r3])).toBeNull();
  });
});

describe("rankProgressForRank", () => {
  it("reports current vs required for self, direct, and the three leg bands", () => {
    const rank = fakeRank({
      selfInvestmentMin: "100",
      directBusinessMin: "300",
      teamBusinessMin: "1000",
    });
    const m = { selfInvest: 50, directBusiness: 150, legVolumes: [600, 100] };
    const p = rankProgressForRank(m, rank);
    expect(p.self).toEqual({ current: 50, required: 100 });
    expect(p.direct).toEqual({ current: 150, required: 300 });
    expect(p.legs.map((b) => b.band)).toEqual(["top", "second", "rest"]);
    expect(p.legs[0]).toEqual({ band: "top", current: 600, required: 400 });
    expect(p.legs[1]).toEqual({ band: "second", current: 100, required: 300 });
  });
});

// ── Integration tests: runRankEngine against the real DB ─────────────────────
describe("runRankEngine — promotion", () => {
  it("promotes a qualifying user and creates an active reward schedule", async () => {
    const rank = await createRank({ selfMin: 100, monthly: 10, months: 3 });
    const user = await createUser({ totalInvested: 100 });

    await runRankEngine();

    const refreshed = await getUser(user.id);
    expect(refreshed.currentRankId).toBe(rank.id);

    const active = await getActiveSchedules(user.id);
    expect(active.length).toBe(1);
    expect(active[0].rankId).toBe(rank.id);
    expect(active[0].monthsPaid).toBe(0);
    expect(active[0].totalMonths).toBe(3);
    expect(parseFloat(active[0].monthlyAmount)).toBe(10);
    // First payout is one month out, so promotion alone pays nothing yet.
    expect(active[0].nextPayoutAt.getTime()).toBeGreaterThan(Date.now());
    expect(parseFloat(refreshed.withdrawBalance)).toBe(0);
  });

  it("is upward-only / sticky: never demotes a user who sits above what they qualify for", async () => {
    const low = await createRank({ rankNumber: rankCounter++, selfMin: 100 });
    const high = await createRank({ rankNumber: low.rankNumber + 1, selfMin: 500, monthly: 5, months: 2 });
    // User only qualifies for `low` (invest 100) but is already at `high`.
    const user = await createUser({ totalInvested: 100, currentRankId: high.id });

    await runRankEngine();

    const refreshed = await getUser(user.id);
    expect(refreshed.currentRankId).toBe(high.id); // unchanged, not demoted
  });

  it("supersedes the old schedule and starts a fresh one when promoted (no stacking)", async () => {
    const r1 = await createRank({ rankNumber: rankCounter++, selfMin: 100, monthly: 5, months: 6 });
    const r2 = await createRank({ rankNumber: r1.rankNumber + 1, selfMin: 500, monthly: 20, months: 3 });

    const user = await createUser({ totalInvested: 100 });
    await runRankEngine(); // promotes to r1
    expect((await getUser(user.id)).currentRankId).toBe(r1.id);

    // Raise investment so the user now qualifies for r2.
    await db.update(usersTable).set({ totalInvested: "500" }).where(eq(usersTable.id, user.id));
    await runRankEngine(); // promotes to r2

    expect((await getUser(user.id)).currentRankId).toBe(r2.id);

    const all = await getAllSchedules(user.id);
    const active = all.filter((s) => s.status === "active");
    const superseded = all.filter((s) => s.status === "superseded");
    expect(active.length).toBe(1);
    expect(active[0].rankId).toBe(r2.id);
    expect(superseded.length).toBe(1);
    expect(superseded[0].rankId).toBe(r1.id);
  });
});

describe("runRankEngine — payouts", () => {
  it("pays exactly one month per due cycle and credits the withdraw wallet", async () => {
    const rank = await createRank({ selfMin: 100, monthly: 10, months: 3 });
    const user = await createUser({ totalInvested: 100 });
    await runRankEngine(); // promote (schedule due in +1 month → nothing paid yet)

    // Force the schedule due now.
    await db
      .update(rankRewardSchedulesTable)
      .set({ nextPayoutAt: new Date(Date.now() - 1000) })
      .where(eq(rankRewardSchedulesTable.userId, user.id));

    await runRankEngine(); // pays month 1

    let refreshed = await getUser(user.id);
    expect(parseFloat(refreshed.withdrawBalance)).toBe(10);
    expect(parseFloat(refreshed.totalEarnings)).toBe(10);
    expect(await countRankBonusIncome(user.id)).toBe(1);

    const [sched] = await getAllSchedules(user.id);
    expect(sched.monthsPaid).toBe(1);
    expect(sched.status).toBe("active");
    expect(sched.nextPayoutAt.getTime()).toBeGreaterThan(Date.now()); // advanced ~1 month

    // Immediate re-run: not due → no further payout (idempotent claim).
    await runRankEngine();
    refreshed = await getUser(user.id);
    expect(parseFloat(refreshed.withdrawBalance)).toBe(10);
    expect(await countRankBonusIncome(user.id)).toBe(1);
  });

  it("continues paying for the full term even after the downline team volume collapses", async () => {
    // Qualification is driven by the balanced-leg TEAM requirement here.
    const rank = await createRank({ selfMin: 50, teamMin: 1000, monthly: 7, months: 4 });
    const user = await createUser({ totalInvested: 50 });
    // Three legs that satisfy the 40/30/30 caps (400/300/300 of a 1000 req).
    const a = await createUser({ totalInvested: 400, sponsorId: user.id });
    const b = await createUser({ totalInvested: 300, sponsorId: user.id });
    const c = await createUser({ totalInvested: 300, sponsorId: user.id });

    await runRankEngine(); // promote via team business
    expect((await getUser(user.id)).currentRankId).toBe(rank.id);

    // Team collapses below requirement; the active schedule must keep paying.
    await db
      .update(usersTable)
      .set({ totalInvested: "0" })
      .where(inArray(usersTable.id, [a.id, b.id, c.id]));
    await db
      .update(rankRewardSchedulesTable)
      .set({ nextPayoutAt: new Date(Date.now() - 1000) })
      .where(eq(rankRewardSchedulesTable.userId, user.id));

    await runRankEngine();

    expect(parseFloat((await getUser(user.id)).withdrawBalance)).toBe(7);
    const [sched] = await getAllSchedules(user.id);
    expect(sched.monthsPaid).toBe(1);
  });

  it("marks the schedule completed after the final month is paid", async () => {
    const rank = await createRank({ selfMin: 100, monthly: 10, months: 1 });
    const user = await createUser({ totalInvested: 100 });
    await runRankEngine(); // promote (1-month schedule)

    await db
      .update(rankRewardSchedulesTable)
      .set({ nextPayoutAt: new Date(Date.now() - 1000) })
      .where(eq(rankRewardSchedulesTable.userId, user.id));
    await runRankEngine(); // pays the only month

    const [sched] = await getAllSchedules(user.id);
    expect(sched.monthsPaid).toBe(1);
    expect(sched.status).toBe("completed");
    expect(parseFloat((await getUser(user.id)).withdrawBalance)).toBe(10);
  });
});

describe("runRankEngine — double-pay protection", () => {
  it("never double-pays under concurrent invocation", async () => {
    const rank = await createRank({ selfMin: 100, monthly: 10, months: 3 });
    const user = await createUser({ totalInvested: 100 });
    await runRankEngine(); // promote

    await db
      .update(rankRewardSchedulesTable)
      .set({ nextPayoutAt: new Date(Date.now() - 1000) })
      .where(eq(rankRewardSchedulesTable.userId, user.id));

    // Fire two engine runs at once; the in-process guard + atomic claim must
    // ensure only a single month is ever paid.
    await Promise.all([runRankEngine(), runRankEngine()]);

    expect(parseFloat((await getUser(user.id)).withdrawBalance)).toBe(10);
    expect(await countRankBonusIncome(user.id)).toBe(1);
    const [sched] = await getAllSchedules(user.id);
    expect(sched.monthsPaid).toBe(1);
  });

  it("the atomic monthly claim lets only one of two racing claims win the month", async () => {
    // This exercises the DB-level guarded UPDATE directly (the in-process guard
    // would otherwise short-circuit the second runRankEngine before it reaches
    // the claim). It mirrors the exact WHERE clause used inside runRankEngine:
    // status='active' AND nextPayoutAt<=now AND monthsPaid=<expected>.
    const rank = await createRank({ selfMin: 100, monthly: 10, months: 3 });
    const user = await createUser({ totalInvested: 100 });
    await runRankEngine(); // promote → one active schedule
    const [sched] = await getAllSchedules(user.id);

    await db
      .update(rankRewardSchedulesTable)
      .set({ nextPayoutAt: new Date(Date.now() - 1000) })
      .where(eq(rankRewardSchedulesTable.id, sched.id));

    const now = new Date();
    const claim = () =>
      db
        .update(rankRewardSchedulesTable)
        .set({ monthsPaid: 1, nextPayoutAt: new Date(now.getTime() + MONTH_MS) })
        .where(
          and(
            eq(rankRewardSchedulesTable.id, sched.id),
            eq(rankRewardSchedulesTable.status, "active"),
            lte(rankRewardSchedulesTable.nextPayoutAt, now),
            eq(rankRewardSchedulesTable.monthsPaid, 0),
          ),
        )
        .returning({ id: rankRewardSchedulesTable.id });

    const [r1, r2] = await Promise.all([claim(), claim()]);
    const winners = (r1.length > 0 ? 1 : 0) + (r2.length > 0 ? 1 : 0);
    expect(winners).toBe(1); // exactly one UPDATE matched the guarded row
    expect((await getAllSchedules(user.id))[0].monthsPaid).toBe(1);
  });

  it("the partial unique index forbids two active schedules for one user", async () => {
    const rank = await createRank({ selfMin: 0, monthly: 5, months: 2 });
    const user = await createUser({ totalInvested: 0 });

    await db.insert(rankRewardSchedulesTable).values({
      userId: user.id,
      rankId: rank.id,
      monthlyAmount: "5",
      totalMonths: 2,
      monthsPaid: 0,
      nextPayoutAt: new Date(),
      status: "active",
    });

    // A second ACTIVE schedule for the same user must be rejected by the index.
    await expect(
      db.insert(rankRewardSchedulesTable).values({
        userId: user.id,
        rankId: rank.id,
        monthlyAmount: "5",
        totalMonths: 2,
        monthsPaid: 0,
        nextPayoutAt: new Date(),
        status: "active",
      }),
    ).rejects.toThrow();
  });
});
