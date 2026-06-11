import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ranksTable = pgTable("ranks", {
  id: serial("id").primaryKey(),
  rankNumber: integer("rank_number").notNull().unique(),
  name: text("name").notNull(),
  criteria: text("criteria").notNull(),
  reward: text("reward").notNull(),
  requiresRankId: integer("requires_rank_id"),
  requiresCount: integer("requires_count"),
  requiresLevels: integer("requires_levels"),
});

export const insertRankSchema = createInsertSchema(ranksTable).omit({ id: true });
export type InsertRank = z.infer<typeof insertRankSchema>;
export type Rank = typeof ranksTable.$inferSelect;
