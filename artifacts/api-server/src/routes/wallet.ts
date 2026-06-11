import { Router } from "express";
import { db, usersTable, platformSettingsTable, offersTable, noticesTable, noticeViewsTable, p2pTransfersTable } from "@workspace/db";
import { eq, or, isNull, lte, gte, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

async function getSettings() {
  const [s] = await db.select().from(platformSettingsTable).limit(1);
  return s ?? null;
}

// GET /api/settings/public — no auth required
router.get("/settings/public", async (_req, res) => {
  const settings = await getSettings();
  res.json({
    hyperCoinMinPercent: parseFloat(settings?.hyperCoinMinPercent ?? "50"),
    hyperCoinPrice: parseFloat(settings?.hyperCoinPrice ?? "1.0000"),
    launchOfferActive: settings?.launchOfferActive ?? true,
    launchOfferEndDate: settings?.launchOfferEndDate ? settings.launchOfferEndDate.toISOString() : null,
    maxTotalInvestment: parseFloat(settings?.maxTotalInvestment ?? "2000"),
    plans: {
      tier1: { dailyRate: parseFloat(settings?.tier1DailyRate ?? "0.006"), days: settings?.tier1Days ?? 300, min: 100, max: 400 },
      tier2: { dailyRate: parseFloat(settings?.tier2DailyRate ?? "0.007"), days: settings?.tier2Days ?? 260, min: 500, max: 900 },
      tier3: { dailyRate: parseFloat(settings?.tier3DailyRate ?? "0.008"), days: settings?.tier3Days ?? 225, min: 1000, max: parseFloat(settings?.maxTotalInvestment ?? "2000") },
    },
    hcDepositUsername: settings?.hcDepositUsername ?? "",
    coolingHours: settings?.withdrawalCoolingHours ?? 24,
  });
});

// GET /api/legal/terms — public
router.get("/legal/terms", async (_req, res) => {
  const settings = await getSettings();
  res.json({ content: settings?.termsContent ?? "" });
});

// GET /api/legal/privacy — public
router.get("/legal/privacy", async (_req, res) => {
  const settings = await getSettings();
  res.json({ content: settings?.privacyContent ?? "" });
});

// GET /api/notices/active — returns currently-visible notices for the signed-in user
router.get("/notices/active", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const now = new Date();
  const rows = await db.select().from(noticesTable).where(
    and(
      eq(noticesTable.active, true),
      or(isNull(noticesTable.startsAt), lte(noticesTable.startsAt, now)),
      or(isNull(noticesTable.endsAt),   gte(noticesTable.endsAt, now)),
    )
  );

  const visible = rows.filter(n => {
    if (n.audience === "all") return true;
    if (n.audience === "active")   return !!user.isActive;
    if (n.audience === "inactive") return !user.isActive;
    if (n.audience === "admin")    return !!user.isAdmin;
    return true;
  });

  const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  visible.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const pa = priorityRank[a.priority] ?? 2;
    const pb = priorityRank[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  // Mark which notices the user has already viewed (server-side read state)
  let viewedIds = new Set<number>();
  if (visible.length > 0) {
    const viewedRows = await db.select({ noticeId: noticeViewsTable.noticeId })
      .from(noticeViewsTable)
      .where(and(
        eq(noticeViewsTable.userId, user.id),
        inArray(noticeViewsTable.noticeId, visible.map(n => n.id)),
      ));
    viewedIds = new Set(viewedRows.map(r => r.noticeId));
  }

  res.json(visible.map(n => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    priority: n.priority,
    icon: n.icon,
    ctaLabel: n.ctaLabel,
    ctaUrl: n.ctaUrl,
    pinned: n.pinned,
    dismissible: n.dismissible,
    createdAt: n.createdAt.toISOString(),
    viewed: viewedIds.has(n.id),
  })));
});

// POST /api/notices/view-all — record views for every notice currently visible to the signed-in user
router.post("/notices/view-all", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const now = new Date();

  const all = await db.select().from(noticesTable);
  const visible = all.filter(n => {
    if (!n.active) return false;
    if (n.startsAt && n.startsAt > now) return false;
    if (n.endsAt && n.endsAt < now) return false;
    if (n.audience === "active"   && !user.isActive) return false;
    if (n.audience === "inactive" &&  user.isActive) return false;
    if (n.audience === "admin"    && !user.isAdmin)  return false;
    return true;
  });

  if (visible.length === 0) { res.json({ success: true, marked: 0 }); return; }

  try {
    await db.insert(noticeViewsTable)
      .values(visible.map(n => ({ noticeId: n.id, userId: user.id })))
      .onConflictDoNothing();
  } catch (err) {
    req.log.error({ err }, "Failed to bulk-record notice views");
  }
  res.json({ success: true, marked: visible.length });
});

// POST /api/notices/:id/view — record that the signed-in user has opened this notice
router.post("/notices/:id/view", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
  // Confirm the notice exists & is currently active+visible to this user
  const [n] = await db.select().from(noticesTable).where(eq(noticesTable.id, id));
  if (!n) { res.status(404).json({ message: "Notice not found" }); return; }
  try {
    await db.insert(noticeViewsTable).values({ noticeId: id, userId: user.id }).onConflictDoNothing();
  } catch (err) {
    req.log.error({ err }, "Failed to record notice view");
  }
  res.json({ success: true });
});

// GET /api/offers/active — public, returns active offers for user dashboard
router.get("/offers/active", async (_req, res) => {
  const offers = await db.select().from(offersTable).orderBy(offersTable.createdAt);
  const active = offers.filter(o => o.active);
  res.json(active.map(o => ({
    id: o.id,
    title: o.title,
    subtitle: o.subtitle,
    emoji: o.emoji,
    reward: o.reward,
    endDate: o.endDate ? o.endDate.toISOString() : null,
    criteria: o.criteria,
  })));
});

// POST /api/wallet/internal-transfer
router.post("/wallet/internal-transfer", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { direction, amount } = req.body;

  if (!direction || !["usdt_to_hypercoin", "hypercoin_to_usdt"].includes(direction)) {
    res.status(400).json({ message: "Invalid direction" });
    return;
  }
  const transferAmount = parseFloat(amount);
  if (!transferAmount || transferAmount <= 0) {
    res.status(400).json({ message: "Amount must be greater than 0" });
    return;
  }

  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!freshUser) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  const settings = await getSettings();
  const hcPrice = parseFloat(settings?.hyperCoinPrice ?? "1.0000");

  const currentUsdt = parseFloat(freshUser.walletBalance ?? "0");
  const currentHyper = parseFloat(freshUser.hyperCoinBalance ?? "0");

  if (direction === "usdt_to_hypercoin") {
    if (transferAmount > currentUsdt) {
      res.status(400).json({ message: `Insufficient USDT balance. Available: $${currentUsdt.toFixed(2)}` });
      return;
    }
    const hcReceived = transferAmount / hcPrice;
    await db.update(usersTable)
      .set({
        walletBalance: (currentUsdt - transferAmount).toString(),
        hyperCoinBalance: (currentHyper + hcReceived).toString(),
      })
      .where(eq(usersTable.id, user.id));
  } else {
    if (transferAmount > currentHyper) {
      res.status(400).json({ message: `Insufficient HYPERCOIN balance. Available: HC ${currentHyper.toFixed(4)}` });
      return;
    }
    const usdtReceived = transferAmount * hcPrice;
    await db.update(usersTable)
      .set({
        walletBalance: (currentUsdt + usdtReceived).toString(),
        hyperCoinBalance: (currentHyper - transferAmount).toString(),
      })
      .where(eq(usersTable.id, user.id));
  }

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  res.json({
    walletBalance: parseFloat(updated.walletBalance ?? "0"),
    hyperCoinBalance: parseFloat(updated.hyperCoinBalance ?? "0"),
  });
});

// GET /api/wallet/p2p/lookup?query=X — verify recipient by referral code or numeric user ID
router.get("/wallet/p2p/lookup", requireAuth, async (req, res) => {
  const sender = (req as any).user;
  const query = (req.query.query as string ?? req.query.userId as string ?? "").trim();

  if (!query) {
    res.status(400).json({ message: "Enter a referral code or user ID" });
    return;
  }

  let recipient: { id: number; name: string | null; email: string } | undefined;

  const numericId = parseInt(query, 10);
  if (!isNaN(numericId) && String(numericId) === query) {
    const [row] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, numericId)).limit(1);
    recipient = row;
  } else {
    const [row] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.referralCode, query.toUpperCase())).limit(1);
    recipient = row;
  }

  if (!recipient) {
    res.status(404).json({ message: "User not found. Check the referral code or ID." });
    return;
  }
  if (recipient.id === sender.id) {
    res.status(400).json({ message: "You cannot transfer to yourself" });
    return;
  }

  res.json({ id: recipient.id, name: recipient.name, email: recipient.email });
});

// POST /api/wallet/p2p/transfer — send USDT or HYPERCOIN to another user
router.post("/wallet/p2p/transfer", requireAuth, async (req, res) => {
  const sender = (req as any).user;
  const { recipientId, amount, currency } = req.body;

  const transferAmount = parseFloat(amount);
  const coin: "usdt" | "hypercoin" = currency === "hypercoin" ? "hypercoin" : "usdt";

  if (!recipientId || !transferAmount || transferAmount <= 0) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  if (recipientId === sender.id) {
    res.status(400).json({ message: "You cannot transfer to yourself" });
    return;
  }

  if (sender.p2pBlocked) {
    const reason = sender.p2pBlockReason || sender.blockReason;
    res.status(403).json({
      message: reason
        ? `P2P transfers are blocked: ${reason}`
        : "P2P transfers have been blocked on your account. Please contact support.",
    });
    return;
  }

  // Wrap entire transfer in a transaction to prevent race conditions / double-spend
  let updatedSender: typeof usersTable.$inferSelect | undefined;
  let recipientName = "";
  try {
    await db.transaction(async (tx) => {
      const [freshSender] = await tx.select().from(usersTable).where(eq(usersTable.id, sender.id)).limit(1);
      const [recipient] = await tx.select().from(usersTable).where(eq(usersTable.id, recipientId)).limit(1);

      if (!freshSender || !recipient) throw Object.assign(new Error("User not found"), { status: 404 });

      recipientName = recipient.name ?? "";

      if (coin === "usdt") {
        const senderBalance = parseFloat(freshSender.walletBalance ?? "0");
        if (transferAmount > senderBalance) throw Object.assign(new Error(`Insufficient USDT balance. Available: $${senderBalance.toFixed(2)}`), { status: 400 });
        const recipientBalance = parseFloat(recipient.walletBalance ?? "0");
        await tx.update(usersTable).set({ walletBalance: (senderBalance - transferAmount).toString() }).where(eq(usersTable.id, sender.id));
        await tx.update(usersTable).set({ walletBalance: (recipientBalance + transferAmount).toString() }).where(eq(usersTable.id, recipientId));
      } else {
        const senderHyper = parseFloat(freshSender.hyperCoinBalance ?? "0");
        if (transferAmount > senderHyper) throw Object.assign(new Error(`Insufficient HYPERCOIN balance. Available: $${senderHyper.toFixed(2)}`), { status: 400 });
        const recipientHyper = parseFloat(recipient.hyperCoinBalance ?? "0");
        await tx.update(usersTable).set({ hyperCoinBalance: (senderHyper - transferAmount).toString() }).where(eq(usersTable.id, sender.id));
        await tx.update(usersTable).set({ hyperCoinBalance: (recipientHyper + transferAmount).toString() }).where(eq(usersTable.id, recipientId));
      }

      await tx.insert(p2pTransfersTable).values({
        senderId: freshSender.id,
        senderName: freshSender.name ?? "",
        senderEmail: freshSender.email ?? "",
        recipientId: recipient.id,
        recipientName: recipient.name ?? "",
        recipientEmail: recipient.email ?? "",
        amount: transferAmount.toString(),
        currency: coin,
      });

      const [s] = await tx.select().from(usersTable).where(eq(usersTable.id, sender.id)).limit(1);
      updatedSender = s;
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ message: err?.message ?? "Transfer failed" });
    return;
  }

  res.json({
    message: `$${transferAmount.toFixed(2)} ${coin.toUpperCase()} sent to ${recipientName}`,
    walletBalance: parseFloat(updatedSender!.walletBalance ?? "0"),
    hyperCoinBalance: parseFloat(updatedSender!.hyperCoinBalance ?? "0"),
  });
});

export default router;
