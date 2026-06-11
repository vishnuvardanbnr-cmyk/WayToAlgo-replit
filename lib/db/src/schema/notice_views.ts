import { pgTable, serial, integer, timestamp, unique, index } from "drizzle-orm/pg-core";

export const noticeViewsTable = pgTable("notice_views", {
  id: serial("id").primaryKey(),
  noticeId: integer("notice_id").notNull(),
  userId: integer("user_id").notNull(),
  viewedAt: timestamp("viewed_at").notNull().defaultNow(),
}, (t) => ({
  uniqNoticeUser: unique("notice_views_notice_user_uniq").on(t.noticeId, t.userId),
  noticeIdx: index("notice_views_notice_idx").on(t.noticeId),
}));

export type NoticeView = typeof noticeViewsTable.$inferSelect;
export type InsertNoticeView = typeof noticeViewsTable.$inferInsert;
