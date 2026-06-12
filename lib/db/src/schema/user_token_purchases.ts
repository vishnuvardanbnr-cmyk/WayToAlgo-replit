import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per confirmed on-chain WTA token purchase by a platform user.
 * Recorded by the frontend after the buy tx is confirmed; tx_hash is unique
 * to prevent double-inserts on retry.
 */
export const userTokenPurchasesTable = pgTable("user_token_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash").notNull().unique(),
  usdtSpent: numeric("usdt_spent", { precision: 20, scale: 6 }).notNull(),
  wtaReceived: numeric("wta_received", { precision: 40, scale: 18 }).notNull(),
  buyPrice: numeric("buy_price", { precision: 40, scale: 18 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UserTokenPurchase = typeof userTokenPurchasesTable.$inferSelect;
export type InsertUserTokenPurchase = typeof userTokenPurchasesTable.$inferInsert;
