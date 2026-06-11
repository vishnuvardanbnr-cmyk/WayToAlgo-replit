import { pgTable, serial, boolean, text, timestamp } from "drizzle-orm/pg-core";

export type NoticeType = "info" | "success" | "warning" | "critical" | "announcement" | "promo";
export type NoticePriority = "low" | "normal" | "high" | "urgent";
export type NoticeAudience = "all" | "active" | "inactive" | "admin";

export const noticesTable = pgTable("notices", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default(""),
  message: text("message").notNull().default(""),
  type: text("type").notNull().default("info"),
  priority: text("priority").notNull().default("normal"),
  icon: text("icon").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default(""),
  ctaUrl: text("cta_url").notNull().default(""),
  audience: text("audience").notNull().default("all"),
  active: boolean("active").notNull().default(true),
  pinned: boolean("pinned").notNull().default(false),
  dismissible: boolean("dismissible").notNull().default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Notice = typeof noticesTable.$inferSelect;
export type InsertNotice = typeof noticesTable.$inferInsert;
