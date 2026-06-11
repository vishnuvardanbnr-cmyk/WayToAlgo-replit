import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incomeTable = pgTable("income", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // daily_return, spot_referral, level_commission, rank_bonus
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  description: text("description").notNull(),
  fromUserId: integer("from_user_id"),
  fromUserName: text("from_user_name"),
  level: integer("level"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIncomeSchema = createInsertSchema(incomeTable).omit({ id: true, createdAt: true });
export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type Income = typeof incomeTable.$inferSelect;
