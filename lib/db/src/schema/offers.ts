import { pgTable, serial, boolean, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export type OfferCriterion =
  | { type: "self_invest"; label: string; target: number }
  | { type: "team_business"; label: string; target: number }
  | { type: "leg"; legIndex: number; label: string; target: number };

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  emoji: text("emoji").notNull().default("🎁"),
  reward: text("reward").notNull().default(""),
  endDate: timestamp("end_date"),
  active: boolean("active").notNull().default(true),
  criteria: jsonb("criteria").notNull().$type<OfferCriterion[]>().default([]),
  sortOrder: serial("sort_order"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Offer = typeof offersTable.$inferSelect;
export type InsertOffer = typeof offersTable.$inferInsert;
