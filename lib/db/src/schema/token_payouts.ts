import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per admin "buy & distribute" run. Records the real on-chain buy
 * (USDT spent → tokens minted to the platform withdraw wallet) and how the
 * bought tokens were split between ROI recipients and level commissions.
 */
export const tokenBuyBatchesTable = pgTable("token_buy_batches", {
  id: serial("id").primaryKey(),
  usdtSpent: numeric("usdt_spent", { precision: 20, scale: 6 }).notNull(),
  // Minimum that should have been distributed at the flat daily ROI rate
  // (eligible ROI principal × dailyRoiRate at the time of this run). Extra distributed = usdtSpent − expectedUsdt.
  expectedUsdt: numeric("expected_usdt", { precision: 20, scale: 6 }).notNull().default("0"),
  tokensBought: numeric("tokens_bought", { precision: 40, scale: 18 }).notNull().default("0"),
  buyPrice: numeric("buy_price", { precision: 40, scale: 18 }).notNull().default("0"),
  buyTxHash: text("buy_tx_hash"),
  // "buy"  = fresh on-chain buy (USDT spent → tokens minted to withdraw wallet)
  // "held" = distribute tokens already held in the withdraw wallet (no buy)
  source: text("source").notNull().default("buy"),
  recipientCount: integer("recipient_count").notNull().default(0),
  roiTokenTotal: numeric("roi_token_total", { precision: 40, scale: 18 }).notNull().default("0"),
  levelTokenTotal: numeric("level_token_total", { precision: 40, scale: 18 }).notNull().default("0"),
  status: text("status").notNull().default("pending"), // pending, completed, failed
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * One row per virtual token credit to a user from a buy batch.
 * type = "roi"   → investor's proportional share (net after carve)
 * type = "level" → upline commission carved from a downline's share
 * These do NOT create income rows — token rewards are not withdrawable until sold.
 */
export const tokenRewardsTable = pgTable("token_rewards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  batchId: integer("batch_id").notNull(),
  type: text("type").notNull(), // roi, level
  tokenAmount: numeric("token_amount", { precision: 40, scale: 18 }).notNull(),
  usdValue: numeric("usd_value", { precision: 20, scale: 6 }).notNull().default("0"),
  level: integer("level"),
  fromUserId: integer("from_user_id"),
  fromUserName: text("from_user_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * One row per user sell of ROI tokens back to the contract. The on-chain sell
 * is executed from the platform withdraw wallet; proceeds are credited to the
 * user as a withdrawable USDT income row (type "token_sale").
 */
export const tokenSalesTable = pgTable("token_sales", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenAmount: numeric("token_amount", { precision: 40, scale: 18 }).notNull(),
  usdtReceived: numeric("usdt_received", { precision: 20, scale: 6 }).notNull().default("0"),
  sellPrice: numeric("sell_price", { precision: 40, scale: 18 }).notNull().default("0"),
  sellTxHash: text("sell_tx_hash"),
  status: text("status").notNull().default("completed"), // completed, failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTokenBuyBatchSchema = createInsertSchema(tokenBuyBatchesTable).omit({ id: true, createdAt: true });
export const insertTokenRewardSchema = createInsertSchema(tokenRewardsTable).omit({ id: true, createdAt: true });
export const insertTokenSaleSchema = createInsertSchema(tokenSalesTable).omit({ id: true, createdAt: true });

export type TokenBuyBatch = typeof tokenBuyBatchesTable.$inferSelect;
export type TokenReward = typeof tokenRewardsTable.$inferSelect;
export type TokenSale = typeof tokenSalesTable.$inferSelect;
export type InsertTokenBuyBatch = z.infer<typeof insertTokenBuyBatchSchema>;
export type InsertTokenReward = z.infer<typeof insertTokenRewardSchema>;
export type InsertTokenSale = z.infer<typeof insertTokenSaleSchema>;
