import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { verifyToken } from "../middlewares/auth";
import { db, usersTable, supportMessagesTable, supportTicketsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

interface AuthedSocket extends WebSocket {
  userId?: number;
  userName?: string;
  isAdmin?: boolean;
  joinedTicketId?: number;
}

const clients = new Set<AuthedSocket>();

export function broadcastToTicket(ticketId: number, payload: object) {
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && client.joinedTicketId === ticketId) {
      client.send(data);
    }
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", async (ws: AuthedSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, `http://localhost`);
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "No token");
      return;
    }
    const userId = verifyToken(token);
    if (!userId) {
      ws.close(4001, "Invalid token");
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !user.isActive) {
      ws.close(4001, "User not found");
      return;
    }
    ws.userId = user.id;
    ws.userName = user.name;
    ws.isAdmin = user.isAdmin;
    clients.add(ws);

    ws.send(JSON.stringify({ type: "connected", userId: user.id, isAdmin: user.isAdmin }));

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "join") {
          const ticketId = Number(msg.ticketId);
          // Verify access
          const [ticket] = await db.select().from(supportTicketsTable)
            .where(eq(supportTicketsTable.id, ticketId))
            .limit(1);
          if (!ticket) return;
          if (!ws.isAdmin && ticket.userId !== ws.userId) return;

          ws.joinedTicketId = ticketId;
          const messages = await db.select().from(supportMessagesTable)
            .where(eq(supportMessagesTable.ticketId, ticketId));
          ws.send(JSON.stringify({ type: "joined", ticketId, messages, ticket }));
        }

        if (msg.type === "message") {
          const ticketId = Number(msg.ticketId);
          const text = String(msg.text || "").trim();
          if (!text || !ticketId) return;

          const [ticket] = await db.select().from(supportTicketsTable)
            .where(eq(supportTicketsTable.id, ticketId))
            .limit(1);
          if (!ticket) return;
          if (!ws.isAdmin && ticket.userId !== ws.userId) return;
          if (ticket.status === "closed") {
            ws.send(JSON.stringify({ type: "error", message: "Ticket is closed" }));
            return;
          }

          const [saved] = await db.insert(supportMessagesTable).values({
            ticketId,
            senderId: ws.userId!,
            senderName: ws.userName!,
            isAdmin: ws.isAdmin ?? false,
            message: text,
          }).returning();

          // Update ticket status when admin replies
          if (ws.isAdmin && ticket.status === "open") {
            await db.update(supportTicketsTable)
              .set({ status: "in_progress", updatedAt: new Date() })
              .where(eq(supportTicketsTable.id, ticketId));
          } else {
            await db.update(supportTicketsTable)
              .set({ updatedAt: new Date() })
              .where(eq(supportTicketsTable.id, ticketId));
          }

          broadcastToTicket(ticketId, { type: "message", message: saved });
        }
      } catch (err) {
        logger.error({ err }, "WS message error");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WS error");
      clients.delete(ws);
    });
  });

  logger.info("WebSocket server ready at /api/ws");
  return wss;
}
