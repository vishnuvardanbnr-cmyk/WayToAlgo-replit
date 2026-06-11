import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const investmentsTable = pgTable("investments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  planTier: text("plan_tier").notNull(), // tier1, tier2, tier3
  dailyRate: numeric("daily_rate", { precision: 10, scale: 6 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  earnedSoFar: numeric("earned_so_far", { precision: 20, scale: 6 }).notNull().default("0"),
  remainingDays: integer("remaining_days").notNull(),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull().default("active"), // active, completed, cancelled
  hyperCoinAmount: numeric("hyper_coin_amount", { precision: 20, scale: 6 }).notNull(),
  usdtAmount: numeric("usdt_amount", { precision: 20, scale: 6 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvestmentSchema = createInsertSchema(investmentsTable).omit({ id: true, createdAt: true });
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investmentsTable.$inferSelect;
