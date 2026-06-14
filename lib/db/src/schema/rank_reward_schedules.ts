import { pgTable, serial, integer, numeric, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// One per (user, achieved rank). Tracks the monthly reward payout schedule.
// status: 'active' (paying), 'completed' (all months paid), 'superseded' (user
// promoted to a higher rank — remaining months forfeited).
export const rankRewardSchedulesTable = pgTable(
  "rank_reward_schedules",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    rankId: integer("rank_id").notNull(),
    monthlyAmount: numeric("monthly_amount", { precision: 20, scale: 6 }).notNull(),
    totalMonths: integer("total_months").notNull(),
    monthsPaid: integer("months_paid").notNull().default(0),
    nextPayoutAt: timestamp("next_payout_at").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    status: text("status").notNull().default("active"),
  },
  (t) => ({
    // Guarantees at most one ACTIVE schedule per user, so concurrent engine runs
    // (cron + startup + manual trigger) can never create duplicate live schedules
    // that would each pay out (double-pay protection at the DB level).
    oneActivePerUser: uniqueIndex("rank_reward_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  }),
);

export type RankRewardSchedule = typeof rankRewardSchedulesTable.$inferSelect;
export type InsertRankRewardSchedule = typeof rankRewardSchedulesTable.$inferInsert;
