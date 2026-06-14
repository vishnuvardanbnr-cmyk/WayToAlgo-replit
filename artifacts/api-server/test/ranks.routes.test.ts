import { describe, it, expect, beforeAll, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import {
  db,
  usersTable,
  ranksTable,
  rankRewardSchedulesTable,
  incomeTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// Imported real (no mocks needed — these routes touch no blockchain/network).
const { signToken } = await import("../src/middlewares/auth");
const ranksRouter = (await import("../src/routes/ranks")).default;
const adminRouter = (await import("../src/routes/admin")).default;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Mount the real routers directly (no rate limiter / CORS / static) so the
  // tests exercise the actual handlers without app-level throttling.
  app.use("/api", ranksRouter);
  app.use("/api", adminRouter);
  return app;
}

const app = buildApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ── Fixtures ─────────────────────────────────────────────────────────────────
const createdUserIds: number[] = [];
const createdRankIds: number[] = [];

// High base so generated rank numbers don't collide with real/seeded ranks.
let rankCounter = 80000 + Math.floor(Math.random() * 9000);

async function createRank(opts: {
  rankNumber?: number;
  selfMin?: number;
  directMin?: number;
  teamMin?: number;
  monthly?: number;
  months?: number;
}): Promise<typeof ranksTable.$inferSelect> {
  const rankNumber = opts.rankNumber ?? rankCounter++;
  const [r] = await db
    .insert(ranksTable)
    .values({
      rankNumber,
      name: `RouteTestRank ${rankNumber}`,
      criteria: "test criteria",
      reward: "test reward",
      selfInvestmentMin: (opts.selfMin ?? 0).toFixed(6),
      directBusinessMin: (opts.directMin ?? 0).toFixed(6),
      teamBusinessMin: (opts.teamMin ?? 0).toFixed(6),
      legTopPct: 40,
      legSecondPct: 30,
      legRestPct: 30,
      rewardMonthlyAmount: (opts.monthly ?? 0).toFixed(6),
      rewardMonths: opts.months ?? 0,
    })
    .returning();
  createdRankIds.push(r.id);
  return r;
}

async function createUser(opts: {
  isAdmin?: boolean;
  totalInvested?: number;
  sponsorId?: number | null;
  currentRankId?: number | null;
} = {}) {
  const uniq = `rrtest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const [u] = await db
    .insert(usersTable)
    .values({
      name: `Test ${uniq}`,
      email: `${uniq}@test.local`,
      phone: "0000000000",
      passwordHash: "not-a-real-hash",
      referralCode: uniq,
      isAdmin: opts.isAdmin ?? false,
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

// The admin run-engine route invokes runRankEngine(), which scans EVERY user in
// the shared dev DB and may promote/pay an ambient user that happens to qualify
// for a test rank. Snapshot the ambient users and restore them in afterEach so
// the suite stays safe on a shared DB (mirrors rankEngine.test.ts discipline).
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
  // Restore ambient users in case the engine promoted/paid one of them.
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

// ── GET /api/ranks/my-progress ───────────────────────────────────────────────
describe("GET /api/ranks/my-progress", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/ranks/my-progress");
    expect(res.status).toBe(401);
  });

  it("returns metrics, progress, and rank bands for a seeded user", async () => {
    // Two ranks: one the user already qualifies for (low), one to aim at (high).
    const low = await createRank({ rankNumber: rankCounter++, selfMin: 100, directMin: 200 });
    const high = await createRank({
      rankNumber: low.rankNumber + 1,
      selfMin: 1000,
      directMin: 2000,
      teamMin: 5000,
    });

    // User sits at `low`, invested 100, with two directs (personal invest 150+50).
    const user = await createUser({ totalInvested: 100, currentRankId: low.id });
    await createUser({ totalInvested: 150, sponsorId: user.id });
    await createUser({ totalInvested: 50, sponsorId: user.id });

    const token = signToken(user.id);
    const res = await request(app).get("/api/ranks/my-progress").set(auth(token));
    expect(res.status).toBe(200);

    // Metrics computed from the member graph.
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.selfInvest).toBe(100);
    expect(res.body.metrics.directBusiness).toBe(200); // 150 + 50 personal invest
    expect(res.body.metrics.legVolumes).toEqual([150, 50]);

    // Current and next rank are surfaced.
    expect(res.body.currentRank?.id).toBe(low.id);
    expect(res.body.nextRank?.id).toBe(high.id);

    // Progress is reported toward the next rank with the three leg bands.
    expect(res.body.progress).toBeDefined();
    expect(res.body.progress.self).toEqual({ current: 100, required: 1000 });
    expect(res.body.progress.direct).toEqual({ current: 200, required: 2000 });
    expect(res.body.progress.legs.map((b: any) => b.band)).toEqual([
      "top",
      "second",
      "rest",
    ]);
  });

  it("reports the active reward schedule status for the user", async () => {
    const rank = await createRank({ rankNumber: rankCounter++, selfMin: 50, monthly: 10, months: 3 });
    const user = await createUser({ totalInvested: 50, currentRankId: rank.id });

    const nextPayoutAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(rankRewardSchedulesTable).values({
      userId: user.id,
      rankId: rank.id,
      monthlyAmount: "10",
      totalMonths: 3,
      monthsPaid: 1,
      nextPayoutAt,
      status: "active",
    });

    const token = signToken(user.id);
    const res = await request(app).get("/api/ranks/my-progress").set(auth(token));
    expect(res.status).toBe(200);

    expect(res.body.schedule).toBeDefined();
    expect(res.body.schedule.rankId).toBe(rank.id);
    expect(res.body.schedule.monthlyAmount).toBe(10);
    expect(res.body.schedule.totalMonths).toBe(3);
    expect(res.body.schedule.monthsPaid).toBe(1);
    expect(res.body.schedule.status).toBe("active");
    expect(res.body.schedule.nextPayoutAt).toBe(nextPayoutAt.toISOString());
  });

  it("surfaces the highest rank the user actually qualifies for", async () => {
    // User has no stored rank but invests enough to qualify for `r`.
    const r = await createRank({ rankNumber: rankCounter++, selfMin: 100 });
    const user = await createUser({ totalInvested: 100, currentRankId: null });

    const token = signToken(user.id);
    const res = await request(app).get("/api/ranks/my-progress").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.qualifiedRank?.id).toBe(r.id);
    // No stored rank yet, so currentRank is absent.
    expect(res.body.currentRank).toBeUndefined();
  });
});

// ── POST /api/admin/ranks/run-engine ─────────────────────────────────────────
describe("POST /api/admin/ranks/run-engine", () => {
  it("rejects unauthenticated callers", async () => {
    const res = await request(app).post("/api/admin/ranks/run-engine").send({});
    expect(res.status).toBe(401);
  });

  it("forbids non-admin users", async () => {
    const user = await createUser({ isAdmin: false });
    const token = signToken(user.id);
    const res = await request(app)
      .post("/api/admin/ranks/run-engine")
      .set(auth(token))
      .send({});
    expect(res.status).toBe(403);
  });

  it("runs the engine and returns its summary, promoting a qualifying user", async () => {
    const admin = await createUser({ isAdmin: true });
    const rank = await createRank({ rankNumber: rankCounter++, selfMin: 100, monthly: 10, months: 3 });
    const user = await createUser({ totalInvested: 100, currentRankId: null });

    const token = signToken(admin.id);
    const res = await request(app)
      .post("/api/admin/ranks/run-engine")
      .set(auth(token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Engine summary shape.
    expect(typeof res.body.promoted).toBe("number");
    expect(typeof res.body.paid).toBe("number");
    expect(typeof res.body.paidAmount).toBe("number");
    // At least the user we seeded should have been promoted.
    expect(res.body.promoted).toBeGreaterThanOrEqual(1);

    // The promotion is reflected in the DB.
    const refreshed = await getUser(user.id);
    expect(refreshed.currentRankId).toBe(rank.id);

    const [schedule] = await db
      .select()
      .from(rankRewardSchedulesTable)
      .where(eq(rankRewardSchedulesTable.userId, user.id));
    expect(schedule).toBeDefined();
    expect(schedule.rankId).toBe(rank.id);
    expect(schedule.status).toBe("active");
  });
});
