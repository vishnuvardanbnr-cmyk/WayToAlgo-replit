import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const depositsTable = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  txHash: text("tx_hash"),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  status: text("status").notNull().default("pending"), // pending | sweeping | credited | failed
  sweepTxHash: text("sweep_tx_hash"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  creditedAt: timestamp("credited_at"),
});

export type Deposit = typeof depositsTable.$inferSelect;
