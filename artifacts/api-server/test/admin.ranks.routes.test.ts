import { describe, it, expect, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { db, usersTable, ranksTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// Imported real (no mocks needed — these routes touch no blockchain/network).
const { signToken } = await import("../src/middlewares/auth");
const adminRouter = (await import("../src/routes/admin")).default;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Mount the real router directly (no rate limiter / CORS / static) so the
  // tests exercise the actual handlers without app-level throttling.
  app.use("/api", adminRouter);
  return app;
}

const app = buildApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ── Fixtures ─────────────────────────────────────────────────────────────────
const createdUserIds: number[] = [];
const createdRankIds: number[] = [];

// High base so generated rank numbers don't collide with real/seeded ranks.
let rankCounter = 70000 + Math.floor(Math.random() * 9000);

async function createRank(opts: {
  rankNumber?: number;
  selfMin?: number;
  monthly?: number;
  months?: number;
} = {}): Promise<typeof ranksTable.$inferSelect> {
  const rankNumber = opts.rankNumber ?? rankCounter++;
  const [r] = await db
    .insert(ranksTable)
    .values({
      rankNumber,
      name: `AdminRouteTestRank ${rankNumber}`,
      criteria: "test criteria",
      reward: "test reward",
      selfInvestmentMin: (opts.selfMin ?? 0).toFixed(6),
      directBusinessMin: "0",
      teamBusinessMin: "0",
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

async function createUser(opts: { isAdmin?: boolean } = {}) {
  const uniq = `arrtest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
      totalInvested: "0",
      withdrawBalance: "0",
      totalEarnings: "0",
    })
    .returning();
  createdUserIds.push(u.id);
  return u;
}

async function getRank(id: number) {
  const [r] = await db.select().from(ranksTable).where(eq(ranksTable.id, id)).limit(1);
  return r;
}

afterEach(async () => {
  if (createdRankIds.length > 0) {
    await db.delete(ranksTable).where(inArray(ranksTable.id, createdRankIds));
    createdRankIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    createdUserIds.length = 0;
  }
});

// ── POST /api/admin/ranks ────────────────────────────────────────────────────
describe("POST /api/admin/ranks", () => {
  it("rejects unauthenticated callers", async () => {
    const res = await request(app)
      .post("/api/admin/ranks")
      .send({ rankNumber: rankCounter++, name: "X" });
    expect(res.status).toBe(401);
  });

  it("forbids non-admin users", async () => {
    const user = await createUser({ isAdmin: false });
    const token = signToken(user.id);
    const res = await request(app)
      .post("/api/admin/ranks")
      .set(auth(token))
      .send({ rankNumber: rankCounter++, name: "X" });
    expect(res.status).toBe(403);
  });

  it("creates a rank and persists it, auto-deriving display strings", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const rankNumber = rankCounter++;

    const res = await request(app)
      .post("/api/admin/ranks")
      .set(auth(token))
      .send({
        rankNumber,
        name: "Test Tier",
        selfInvestmentMin: 100,
        directBusinessMin: 500,
        teamBusinessMin: 1000,
        rewardMonthlyAmount: 10,
        rewardMonths: 6,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdRankIds.push(res.body.id);

    expect(res.body.rankNumber).toBe(rankNumber);
    expect(res.body.name).toBe("Test Tier");
    // Display strings auto-generated from the structured fields.
    expect(res.body.criteria).toContain("$100");
    expect(res.body.criteria).toContain("$500");
    expect(res.body.reward).toContain("$10");
    expect(res.body.reward).toContain("6 months");

    // The row actually landed in the DB with the right structured values.
    const stored = await getRank(res.body.id);
    expect(stored).toBeDefined();
    expect(stored.name).toBe("Test Tier");
    expect(parseFloat(stored.selfInvestmentMin)).toBe(100);
    expect(parseFloat(stored.directBusinessMin)).toBe(500);
    expect(parseFloat(stored.teamBusinessMin)).toBe(1000);
    expect(parseFloat(stored.rewardMonthlyAmount)).toBe(10);
    expect(stored.rewardMonths).toBe(6);
  });

  it("honours explicit criteria/reward overrides", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);

    const res = await request(app)
      .post("/api/admin/ranks")
      .set(auth(token))
      .send({
        rankNumber: rankCounter++,
        name: "Custom Tier",
        criteria: "my custom criteria",
        reward: "my custom reward",
      });

    expect(res.status).toBe(201);
    createdRankIds.push(res.body.id);
    expect(res.body.criteria).toBe("my custom criteria");
    expect(res.body.reward).toBe("my custom reward");
  });

  it("rejects invalid input (missing name)", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const res = await request(app)
      .post("/api/admin/ranks")
      .set(auth(token))
      .send({ rankNumber: rankCounter++ });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (rankNumber < 1)", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const res = await request(app)
      .post("/api/admin/ranks")
      .set(auth(token))
      .send({ rankNumber: 0, name: "Bad" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid input (negative selfInvestmentMin)", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const res = await request(app)
      .post("/api/admin/ranks")
      .set(auth(token))
      .send({ rankNumber: rankCounter++, name: "Bad", selfInvestmentMin: -5 });
    expect(res.status).toBe(400);
  });
});

// ── PUT /api/admin/ranks/:id ─────────────────────────────────────────────────
describe("PUT /api/admin/ranks/:id", () => {
  it("rejects unauthenticated callers", async () => {
    const rank = await createRank();
    const res = await request(app)
      .put(`/api/admin/ranks/${rank.id}`)
      .send({ name: "Renamed" });
    expect(res.status).toBe(401);
  });

  it("forbids non-admin users", async () => {
    const rank = await createRank();
    const user = await createUser({ isAdmin: false });
    const token = signToken(user.id);
    const res = await request(app)
      .put(`/api/admin/ranks/${rank.id}`)
      .set(auth(token))
      .send({ name: "Renamed" });
    expect(res.status).toBe(403);
  });

  it("rejects a non-numeric id", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const res = await request(app)
      .put("/api/admin/ranks/not-a-number")
      .set(auth(token))
      .send({ name: "Renamed" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a missing rank", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const res = await request(app)
      .put("/api/admin/ranks/2000000000")
      .set(auth(token))
      .send({ name: "Renamed" });
    expect(res.status).toBe(404);
  });

  it("rejects invalid input (negative reward months)", async () => {
    const rank = await createRank();
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const res = await request(app)
      .put(`/api/admin/ranks/${rank.id}`)
      .set(auth(token))
      .send({ rewardMonths: -1 });
    expect(res.status).toBe(400);
  });

  it("updates the rank and recomputes display strings", async () => {
    const rank = await createRank({ selfMin: 100, monthly: 10, months: 3 });
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);

    const res = await request(app)
      .put(`/api/admin/ranks/${rank.id}`)
      .set(auth(token))
      .send({ name: "Updated Name", selfInvestmentMin: 250 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
    // selfInvestmentMin changed; criteria recomputed from the merged record.
    expect(res.body.criteria).toContain("$250");
    expect(parseFloat(res.body.selfInvestmentMin)).toBe(250);

    // Persisted, and unspecified fields preserved from the existing row.
    const stored = await getRank(rank.id);
    expect(stored.name).toBe("Updated Name");
    expect(parseFloat(stored.selfInvestmentMin)).toBe(250);
    expect(parseFloat(stored.rewardMonthlyAmount)).toBe(10);
    expect(stored.rewardMonths).toBe(3);
  });
});

// ── DELETE /api/admin/ranks/:id ──────────────────────────────────────────────
describe("DELETE /api/admin/ranks/:id", () => {
  it("rejects unauthenticated callers", async () => {
    const rank = await createRank();
    const res = await request(app).delete(`/api/admin/ranks/${rank.id}`);
    expect(res.status).toBe(401);
  });

  it("forbids non-admin users", async () => {
    const rank = await createRank();
    const user = await createUser({ isAdmin: false });
    const token = signToken(user.id);
    const res = await request(app)
      .delete(`/api/admin/ranks/${rank.id}`)
      .set(auth(token));
    expect(res.status).toBe(403);
    // The rank survives a forbidden delete.
    expect(await getRank(rank.id)).toBeDefined();
  });

  it("rejects a non-numeric id", async () => {
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);
    const res = await request(app)
      .delete("/api/admin/ranks/not-a-number")
      .set(auth(token));
    expect(res.status).toBe(400);
  });

  it("deletes the rank from the DB", async () => {
    const rank = await createRank();
    const admin = await createUser({ isAdmin: true });
    const token = signToken(admin.id);

    const res = await request(app)
      .delete(`/api/admin/ranks/${rank.id}`)
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await getRank(rank.id)).toBeUndefined();
  });
});
