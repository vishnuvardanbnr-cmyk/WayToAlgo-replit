import { Router } from "express";
import { db, supportTicketsTable, supportMessagesTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { broadcastToTicket } from "../lib/wsManager";

const router = Router();

function ticketToResponse(t: typeof supportTicketsTable.$inferSelect) {
  return {
    id: t.id,
    userId: t.userId,
    userName: t.userName,
    userEmail: t.userEmail,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function messageToResponse(m: typeof supportMessagesTable.$inferSelect) {
  return {
    id: m.id,
    ticketId: m.ticketId,
    senderId: m.senderId,
    senderName: m.senderName,
    isAdmin: m.isAdmin,
    message: m.message,
    createdAt: m.createdAt.toISOString(),
  };
}

// ─── User routes ────────────────────────────────────────────────────────────

// GET /api/support/tickets
router.get("/support/tickets", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const tickets = await db.select().from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, user.id))
    .orderBy(desc(supportTicketsTable.updatedAt));
  res.json(tickets.map(ticketToResponse));
});

// POST /api/support/tickets
router.post("/support/tickets", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { subject, message } = req.body;
  if (!subject?.trim()) {
    res.status(400).json({ message: "Subject is required" });
    return;
  }
  const [ticket] = await db.insert(supportTicketsTable).values({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    subject: subject.trim(),
  }).returning();

  if (message?.trim()) {
    await db.insert(supportMessagesTable).values({
      ticketId: ticket.id,
      senderId: user.id,
      senderName: user.name,
      isAdmin: false,
      message: message.trim(),
    });
  }

  res.status(201).json(ticketToResponse(ticket));
});

// GET /api/support/tickets/:id
router.get("/support/tickets/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const id = parseInt(req.params.id);
  const [ticket] = await db.select().from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, user.id)))
    .limit(1);
  if (!ticket) {
    res.status(404).json({ message: "Ticket not found" });
    return;
  }
  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.ticketId, id))
    .orderBy(supportMessagesTable.createdAt);
  res.json({ ticket: ticketToResponse(ticket), messages: messages.map(messageToResponse) });
});


// ─── Admin routes ────────────────────────────────────────────────────────────

// GET /api/admin/support/tickets
router.get("/admin/support/tickets", requireAdmin, async (req, res) => {
  const tickets = await db.select().from(supportTicketsTable)
    .orderBy(desc(supportTicketsTable.updatedAt));
  res.json(tickets.map(ticketToResponse));
});

// GET /api/admin/support/tickets/:id
router.get("/admin/support/tickets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [ticket] = await db.select().from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, id))
    .limit(1);
  if (!ticket) {
    res.status(404).json({ message: "Ticket not found" });
    return;
  }
  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.ticketId, id))
    .orderBy(supportMessagesTable.createdAt);
  res.json({ ticket: ticketToResponse(ticket), messages: messages.map(messageToResponse) });
});

// PUT /api/admin/support/tickets/:id/status
router.put("/admin/support/tickets/:id/status", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!["open", "in_progress", "closed"].includes(status)) {
    res.status(400).json({ message: "Invalid status" });
    return;
  }
  const [updated] = await db.update(supportTicketsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Ticket not found" });
    return;
  }
  broadcastToTicket(id, { type: "ticket_update", ticket: ticketToResponse(updated) });
  res.json(ticketToResponse(updated));
});

export default router;
