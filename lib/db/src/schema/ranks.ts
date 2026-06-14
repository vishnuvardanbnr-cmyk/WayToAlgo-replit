import { pgTable, serial, integer, text, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ranksTable = pgTable("ranks", {
  id: serial("id").primaryKey(),
  rankNumber: integer("rank_number").notNull().unique(),
  name: text("name").notNull(),
  criteria: text("criteria").notNull(),
  reward: text("reward").notNull(),
  // ── Structured qualification requirements ──
  selfInvestmentMin: numeric("self_investment_min", { precision: 20, scale: 6 }).notNull().default("0"),
  directBusinessMin: numeric("direct_business_min", { precision: 20, scale: 6 }).notNull().default("0"),
  teamBusinessMin: numeric("team_business_min", { precision: 20, scale: 6 }).notNull().default("0"),
  // Balanced-leg caps (percent of team requirement). Defaults 40/30/30.
  legTopPct: integer("leg_top_pct").notNull().default(40),
  legSecondPct: integer("leg_second_pct").notNull().default(30),
  legRestPct: integer("leg_rest_pct").notNull().default(30),
  // ── Reward schedule ──
  rewardMonthlyAmount: numeric("reward_monthly_amount", { precision: 20, scale: 6 }).notNull().default("0"),
  rewardMonths: integer("reward_months").notNull().default(0),
  // ── Legacy/optional descriptive requirements (kept for backward compat) ──
  requiresRankId: integer("requires_rank_id"),
  requiresCount: integer("requires_count"),
  requiresLevels: integer("requires_levels"),
});

export const insertRankSchema = createInsertSchema(ranksTable).omit({ id: true });
export type InsertRank = z.infer<typeof insertRankSchema>;
export type Rank = typeof ranksTable.$inferSelect;
