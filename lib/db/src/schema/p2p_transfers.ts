import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const p2pTransfersTable = pgTable("p2p_transfers", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderEmail: text("sender_email").notNull(),
  recipientId: integer("recipient_id").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("usdt"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
