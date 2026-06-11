import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const hcDepositRequestsTable = pgTable("hc_deposit_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  userEmail: text("user_email").notNull(),
  referralCode: text("referral_code").notNull(),
  screenshotUrl: text("screenshot_url").notNull(),
  status: text("status").notNull().default("pending"),
  amount: numeric("amount", { precision: 20, scale: 6 }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});
