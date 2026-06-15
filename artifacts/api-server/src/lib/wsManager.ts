/**
 * WebSocket manager — live support chat.
 *
 * Cluster-safe via Redis Pub/Sub:
 *   • When REDIS_URL is set (production cluster mode), every broadcastToTicket()
 *     publishes to a shared Redis channel. All workers subscribe and each
 *     delivers to their locally-connected clients for that ticket. This way a
 *     message sent by an admin whose HTTP request hits worker-2 is received by
 *     a user whose WS connection lives on worker-5.
 *
 *   • When REDIS_URL is absent (local dev / fork mode), the old direct-broadcast
 *     path is used — no Redis dependency required in development.
 */
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { verifyToken } from "../middlewares/auth";
import { db, usersTable, supportMessagesTable, supportTicketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getPublisher, getSubscriber } from "./redis";

const WS_CHANNEL = "wta:ws";

interface AuthedSocket extends WebSocket {
  userId?: number;
  userName?: string;
  isAdmin?: boolean;
  joinedTicketId?: number;
}

const clients = new Set<AuthedSocket>();

/** Deliver payload to every locally-connected client watching this ticket. */
function localBroadcast(ticketId: number, payload: object) {
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && client.joinedTicketId === ticketId) {
      client.send(data);
    }
  }
}

/**
 * Fan out to all workers via Redis, or fall back to local delivery if Redis
 * is not configured. Called from HTTP route handlers (e.g. ticket status change).
 */
export function broadcastToTicket(ticketId: number, payload: object) {
  const pub = getPublisher();
  if (pub) {
    pub.publish(WS_CHANNEL, JSON.stringify({ ticketId, payload })).catch((err) => {
      logger.warn({ err }, "Redis publish failed — falling back to local broadcast");
      localBroadcast(ticketId, payload);
    });
  } else {
    localBroadcast(ticketId, payload);
  }
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  // ── Redis subscriber ─ receives messages published by any worker ─────────
  const sub = getSubscriber();
  if (sub) {
    sub.subscribe(WS_CHANNEL, (err) => {
      if (err) logger.warn({ err }, "Redis WS subscribe failed");
      else logger.info("WebSocket Redis subscriber ready");
    });
    sub.on("message", (_ch: string, message: string) => {
      try {
        const { ticketId, payload } = JSON.parse(message);
        localBroadcast(ticketId, payload);
      } catch (err) {
        logger.warn({ err }, "WS Redis message parse error");
      }
    });
  }

  wss.on("connection", async (ws: AuthedSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, `http://localhost`);
    const token = url.searchParams.get("token");
    if (!token) { ws.close(4001, "No token"); return; }

    const userId = verifyToken(token);
    if (!userId) { ws.close(4001, "Invalid token"); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !user.isActive) { ws.close(4001, "User not found"); return; }

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
          const [ticket] = await db.select().from(supportTicketsTable)
            .where(eq(supportTicketsTable.id, ticketId)).limit(1);
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
            .where(eq(supportTicketsTable.id, ticketId)).limit(1);
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

    ws.on("close", () => { clients.delete(ws); });
    ws.on("error", (err) => { logger.error({ err }, "WS error"); clients.delete(ws); });
  });

  logger.info("WebSocket server ready at /api/ws");
  return wss;
}
