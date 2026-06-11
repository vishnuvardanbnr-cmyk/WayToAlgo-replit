import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const adminBalanceAdjustmentsTable = pgTable("admin_balance_adjustments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  adminId: integer("admin_id").notNull(),
  currency: text("currency").notNull(), // 'usdt' | 'hypercoin'
  amount: numeric("amount", { precision: 20, scale: 6 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminBalanceAdjustment = typeof adminBalanceAdjustmentsTable.$inferSelect;
export type InsertAdminBalanceAdjustment = typeof adminBalanceAdjustmentsTable.$inferInsert;
