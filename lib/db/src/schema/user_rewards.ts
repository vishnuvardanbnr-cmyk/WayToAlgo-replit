import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";

export const userRewardsTable = pgTable("user_rewards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'offer' | 'rank'
  referenceId: integer("reference_id").notNull(),
  rewardedAt: timestamp("rewarded_at").notNull().defaultNow(),
  note: text("note"),
}, (t) => ({
  uniq: unique().on(t.userId, t.type, t.referenceId),
}));

export type UserReward = typeof userRewardsTable.$inferSelect;
export type InsertUserReward = typeof userRewardsTable.$inferInsert;
