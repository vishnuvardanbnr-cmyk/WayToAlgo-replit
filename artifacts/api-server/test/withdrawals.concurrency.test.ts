import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { db, usersTable, withdrawalsTable, platformSettingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ── Blockchain mock ──────────────────────────────────────────────────────────
// The on-chain USDT send must never touch the network or move real funds during
// tests. We mock ONLY sendUsdtToAddress and keep every other export (getSettings,
// etc.) real. Both importers resolve to the same module:
//   - withdrawals.ts: import { sendUsdtToAddress } from "../lib/blockchain"
//   - admin.ts:       await import("../lib/blockchain.js")
// so a single mock covers both. sendMock is hoisted so the vi.mock factory can
// reference it.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("../src/lib/blockchain", async (importActual) => {
  const actual = await importActual<typeof import("../src/lib/blockchain")>();
  return { ...actual, sendUsdtToAddress: (...args: unknown[]) => sendMock(...args) };
});

// Imported AFTER the mock is declared (vi.mock is hoisted above all imports).
const { signToken } = await import("../src/middlewares/auth");
const withdrawalsRouter = (await import("../src/routes/withdrawals")).default;
const adminRouter = (await import("../src/routes/admin")).default;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Mount the real routers directly (no rate limiter / CORS / static) so the
  // tests exercise the actual handlers without app-level throttling.
  app.use("/api", withdrawalsRouter);
  app.use("/api", adminRouter);
  return app;
}

const app = buildApp();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Fixtures ─────────────────────────────────────────────────────────────────
const createdUserIds: number[] = [];

async function createUser(opts: { isAdmin?: boolean; withdrawBalance?: string } = {}) {
  const uniq = `wtest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
      withdrawBalance: opts.withdrawBalance ?? "0",
    })
    .returning();
  createdUserIds.push(u.id);
  return u;
}

async function insertPendingWithdrawal(userId: number, userName: string, amount: string, status = "pending") {
  const [w] = await db
    .insert(withdrawalsTable)
    .values({
      userId,
      userName,
      amount,
      walletAddress: "0x000000000000000000000000000000000000dEaD",
      status,
    })
    .returning();
  return w;
}

async function getWithdrawal(id: number) {
  const [w] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id)).limit(1);
  return w;
}

async function getWithdrawBalance(userId: number): Promise<number> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return parseFloat(u.withdrawBalance);
}

// Poll a withdrawal until it reaches a terminal status (the auto/approve on-chain
// dispatch is fire-and-forget and flips processing -> approved asynchronously).
async function waitForStatus(id: number, terminal: string[], timeoutMs = 5000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const w = await getWithdrawal(id);
    if (w && terminal.includes(w.status)) return w.status;
    await sleep(20);
  }
  return (await getWithdrawal(id)).status;
}

// ── Platform settings control ────────────────────────────────────────────────
// Routes read settings via `.limit(1)` with no ORDER BY, so when more than one
// platform_settings row exists the row returned is non-deterministic. We snapshot
// EVERY row and apply each test's patch to ALL rows, so whichever one a route
// happens to read carries the values we want. All rows are restored afterwards.
let originalSettings: (typeof platformSettingsTable.$inferSelect)[] = [];
let createdSettingsRow = false;

async function setSettings(patch: Partial<typeof platformSettingsTable.$inferInsert>) {
  await db.update(platformSettingsTable).set(patch); // no WHERE → all rows
}

// Manual mode: no auto-processing, no on-chain send, OTP disabled, zero fees so
// the amount debited equals the requested amount.
async function useManualMode() {
  await setSettings({
    withdrawalMode: "manual",
    withdrawWalletPrivateKey: "",
    gasWalletPrivateKey: "",
    smtpEnabled: false,
    otpWithdrawalEnabled: false,
    withdrawalEnabled: true,
    withdrawFeeMode: "deduct_from_amount",
  });
}

// Auto mode: dummy (resolvable) keys so the on-chain dispatch path is taken; the
// mocked sendUsdtToAddress means the keys are never actually used.
async function useAutoMode() {
  await setSettings({
    withdrawalMode: "auto",
    withdrawWalletPrivateKey: "0xwithdrawkey",
    gasWalletPrivateKey: "0xgaskey",
    bscRpcUrl: "http://127.0.0.1:1/never-used",
    smtpEnabled: false,
    otpWithdrawalEnabled: false,
    withdrawalEnabled: true,
    withdrawFeeMode: "deduct_from_amount",
  });
}

beforeAll(async () => {
  originalSettings = await db.select().from(platformSettingsTable);
  if (originalSettings.length === 0) {
    const [created] = await db.insert(platformSettingsTable).values({}).returning();
    originalSettings = [created];
    createdSettingsRow = true;
  }
});

afterAll(async () => {
  // Restore every platform settings row to exactly how we found it.
  if (createdSettingsRow) {
    await db.delete(platformSettingsTable).where(
      inArray(platformSettingsTable.id, originalSettings.map((r) => r.id)),
    );
    return;
  }
  for (const row of originalSettings) {
    const { id, ...rest } = row;
    await db.update(platformSettingsTable).set(rest).where(eq(platformSettingsTable.id, id));
  }
});

afterEach(async () => {
  // Clean up every user (and their withdrawals) created during the test.
  if (createdUserIds.length > 0) {
    await db.delete(withdrawalsTable).where(inArray(withdrawalsTable.userId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    createdUserIds.length = 0;
  }
  sendMock.mockReset();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("withdrawal money-flow concurrency invariants", () => {
  it("two simultaneous creates against the same balance cannot both succeed beyond it", async () => {
    await useManualMode();
    const user = await createUser({ withdrawBalance: "100" });
    const token = signToken(user.id);

    // Both request the FULL balance at once; only one can be debited.
    const [r1, r2] = await Promise.all([
      request(app).post("/api/withdrawals").set(auth(token)).send({ amount: 100, walletAddress: "0xRecipient1" }),
      request(app).post("/api/withdrawals").set(auth(token)).send({ amount: 100, walletAddress: "0xRecipient2" }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 400]); // exactly one created, one rejected

    // Balance fully drained, never negative, debited exactly once.
    expect(await getWithdrawBalance(user.id)).toBe(0);

    const rows = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, user.id));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("pending");
    expect(parseFloat(rows[0].amount)).toBe(100);
  });

  it("duplicate rejects refund the balance only once", async () => {
    await useManualMode();
    // User already had the amount debited (balance 0) with a pending request.
    const user = await createUser({ withdrawBalance: "0" });
    const admin = await createUser({ isAdmin: true });
    const adminToken = signToken(admin.id);
    const w = await insertPendingWithdrawal(user.id, user.name, "100");

    const [r1, r2] = await Promise.all([
      request(app).post(`/api/admin/withdrawals/${w.id}/reject`).set(auth(adminToken)).send({ note: "dup-a" }),
      request(app).post(`/api/admin/withdrawals/${w.id}/reject`).set(auth(adminToken)).send({ note: "dup-b" }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]); // one rejects, the other is a no-op

    // Refunded exactly once — NOT 200.
    expect(await getWithdrawBalance(user.id)).toBe(100);
    expect((await getWithdrawal(w.id)).status).toBe("rejected");
  });

  it("a reject racing the auto-process claim never both refunds AND sends on-chain", async () => {
    await useAutoMode();
    const admin = await createUser({ isAdmin: true });
    const adminToken = signToken(admin.id);

    // Run the race many times to exercise both win orders.
    for (let i = 0; i < 12; i++) {
      sendMock.mockReset();
      // Small delay widens the window between claiming the row and finishing the send.
      sendMock.mockImplementation(async () => {
        await sleep(15);
        return { success: true, txHash: `0xhash_${i}` };
      });

      const user = await createUser({ withdrawBalance: "0" });
      const w = await insertPendingWithdrawal(user.id, user.name, "100");

      // Approve (auto) claims pending->processing then sends; reject flips
      // pending->rejected + refunds. Both are guarded on status="pending".
      await Promise.all([
        request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(auth(adminToken)).send({}),
        request(app).post(`/api/admin/withdrawals/${w.id}/reject`).set(auth(adminToken)).send({ note: "race" }),
      ]);

      const finalStatus = await waitForStatus(w.id, ["approved", "rejected"]);
      const balance = await getWithdrawBalance(user.id);
      const sendCount = sendMock.mock.calls.length;
      const refundApplied = balance === 100;

      // THE invariant: never a refund AND an on-chain send for the same request.
      expect(refundApplied && sendCount > 0).toBe(false);

      // And exactly one of the two outcomes occurred, consistently.
      if (finalStatus === "approved") {
        expect(sendCount).toBe(1);
        expect(refundApplied).toBe(false);
        expect(balance).toBe(0);
      } else {
        expect(finalStatus).toBe("rejected");
        expect(sendCount).toBe(0);
        expect(refundApplied).toBe(true);
      }

      // Clean up this iteration's rows immediately (afterEach also covers it).
      await db.delete(withdrawalsTable).where(eq(withdrawalsTable.userId, user.id));
    }
  });

  it("the auto-process claim on create dispatches exactly one on-chain send and debits once", async () => {
    await useAutoMode();
    sendMock.mockImplementation(async () => ({ success: true, txHash: "0xcreated" }));
    const user = await createUser({ withdrawBalance: "200" });
    const token = signToken(user.id);

    const res = await request(app)
      .post("/api/withdrawals")
      .set(auth(token))
      .send({ amount: 100, walletAddress: "0xRecipient" });
    expect(res.status).toBe(201);

    const status = await waitForStatus(res.body.id, ["approved"]);
    expect(status).toBe("approved");
    expect(sendMock.mock.calls.length).toBe(1); // claimed and sent exactly once
    expect(await getWithdrawBalance(user.id)).toBe(100); // debited once
  });

  describe("approve only ever acts on a pending row", () => {
    it("rejects a second approve once the row is no longer pending", async () => {
      await useManualMode();
      const user = await createUser({ withdrawBalance: "0" });
      const admin = await createUser({ isAdmin: true });
      const adminToken = signToken(admin.id);
      const w = await insertPendingWithdrawal(user.id, user.name, "50");

      const first = await request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(auth(adminToken)).send({});
      expect(first.status).toBe(200);
      expect((await getWithdrawal(w.id)).status).toBe("approved");

      const second = await request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(auth(adminToken)).send({});
      expect(second.status).toBe(409);
    });

    it("cannot approve an already-rejected row", async () => {
      await useManualMode();
      const user = await createUser({ withdrawBalance: "0" });
      const admin = await createUser({ isAdmin: true });
      const adminToken = signToken(admin.id);
      const w = await insertPendingWithdrawal(user.id, user.name, "50", "rejected");

      const res = await request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(auth(adminToken)).send({});
      expect(res.status).toBe(409);
      expect((await getWithdrawal(w.id)).status).toBe("rejected");
    });

    it("cannot approve a row already being processed", async () => {
      await useManualMode();
      const user = await createUser({ withdrawBalance: "0" });
      const admin = await createUser({ isAdmin: true });
      const adminToken = signToken(admin.id);
      const w = await insertPendingWithdrawal(user.id, user.name, "50", "processing");

      const res = await request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(auth(adminToken)).send({});
      expect(res.status).toBe(409);
    });

    it("two simultaneous approves only approve once", async () => {
      await useManualMode();
      const user = await createUser({ withdrawBalance: "0" });
      const admin = await createUser({ isAdmin: true });
      const adminToken = signToken(admin.id);
      const w = await insertPendingWithdrawal(user.id, user.name, "50");

      const [r1, r2] = await Promise.all([
        request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(auth(adminToken)).send({}),
        request(app).post(`/api/admin/withdrawals/${w.id}/approve`).set(auth(adminToken)).send({}),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect((await getWithdrawal(w.id)).status).toBe("approved");
    });
  });
});
