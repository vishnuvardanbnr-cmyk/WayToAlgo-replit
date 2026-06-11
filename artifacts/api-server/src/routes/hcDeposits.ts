import { Router } from "express";
import { db, hcDepositRequestsTable, usersTable, platformSettingsTable } from "@workspace/db";
import { eq, desc, lt, and, ne, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { sendHcDepositApprovedEmail, sendHcDepositRejectedEmail } from "../lib/email";

const router = Router();

// POST /api/hc-deposits — user submits HC deposit request
router.post("/hc-deposits", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { screenshotUrl } = req.body;

  if (!screenshotUrl) {
    res.status(400).json({ error: "Screenshot is required" });
    return;
  }

  const [record] = await db.insert(hcDepositRequestsTable).values({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    referralCode: user.referralCode,
    screenshotUrl,
  }).returning();

  res.json(record);
});

// GET /api/hc-deposits — user's own requests
router.get("/hc-deposits", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const records = await db
    .select()
    .from(hcDepositRequestsTable)
    .where(eq(hcDepositRequestsTable.userId, user.id))
    .orderBy(desc(hcDepositRequestsTable.createdAt));
  res.json(records);
});

// GET /api/admin/hc-deposits/old-images/count — count images older than 10 days
router.get("/admin/hc-deposits/old-images/count", requireAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hcDepositRequestsTable)
    .where(and(
      lt(hcDepositRequestsTable.createdAt, cutoff),
      ne(hcDepositRequestsTable.screenshotUrl, ""),
    ));
  res.json({ count: rows[0]?.count ?? 0 });
});

// DELETE /api/admin/hc-deposits/old-images — clear base64 images older than 10 days
router.delete("/admin/hc-deposits/old-images", requireAdmin, async (_req, res) => {
  const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const result = await db
    .update(hcDepositRequestsTable)
    .set({ screenshotUrl: "" })
    .where(and(
      lt(hcDepositRequestsTable.createdAt, cutoff),
      ne(hcDepositRequestsTable.screenshotUrl, ""),
    ))
    .returning({ id: hcDepositRequestsTable.id });
  res.json({ cleared: result.length });
});

// GET /api/admin/hc-deposits — admin list all
router.get("/admin/hc-deposits", requireAdmin, async (_req, res) => {
  const records = await db
    .select()
    .from(hcDepositRequestsTable)
    .orderBy(desc(hcDepositRequestsTable.createdAt));
  res.json(records);
});

// PUT /api/admin/hc-deposits/:id/approve — admin approves with amount
router.put("/admin/hc-deposits/:id/approve", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { amount } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    res.status(400).json({ error: "Valid positive amount is required" });
    return;
  }

  const [record] = await db
    .select()
    .from(hcDepositRequestsTable)
    .where(eq(hcDepositRequestsTable.id, id))
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (record.status !== "pending") {
    res.status(400).json({ error: "Request already processed" });
    return;
  }

  const [targetUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, record.userId))
    .limit(1);

  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Fetch HC price from platform settings
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const hcPrice = parseFloat(settings?.hyperCoinPrice ?? "1.0000");

  // Convert HC amount → USD value
  const hcAmount = parseFloat(amount);
  const usdValue = (hcAmount * hcPrice).toFixed(6);

  const newBalance = (parseFloat(targetUser.hyperCoinBalance ?? "0") + parseFloat(usdValue)).toFixed(6);

  await db.update(usersTable)
    .set({ hyperCoinBalance: newBalance })
    .where(eq(usersTable.id, targetUser.id));

  await db.update(hcDepositRequestsTable)
    .set({ status: "approved", amount: String(hcAmount), processedAt: new Date() })
    .where(eq(hcDepositRequestsTable.id, id));

  sendHcDepositApprovedEmail(
    targetUser.email,
    targetUser.name ?? "Member",
    hcAmount,
    parseFloat(usdValue),
    hcPrice,
  ).catch(() => {});

  res.json({ success: true, hcAmount, usdValue: parseFloat(usdValue), hcPrice });
});

// PUT /api/admin/hc-deposits/:id/reject — admin rejects
router.put("/admin/hc-deposits/:id/reject", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { note } = req.body;

  const [record] = await db
    .select()
    .from(hcDepositRequestsTable)
    .where(eq(hcDepositRequestsTable.id, id))
    .limit(1);

  if (!record) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  if (record.status !== "pending") {
    res.status(400).json({ error: "Request already processed" });
    return;
  }

  await db.update(hcDepositRequestsTable)
    .set({ status: "rejected", note: note ?? null, processedAt: new Date() })
    .where(eq(hcDepositRequestsTable.id, id));

  const [rejectedUser] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, record.userId))
    .limit(1);

  if (rejectedUser) {
    sendHcDepositRejectedEmail(
      rejectedUser.email,
      rejectedUser.name ?? "Member",
      note ?? null,
    ).catch(() => {});
  }

  res.json({ success: true });
});

export default router;
