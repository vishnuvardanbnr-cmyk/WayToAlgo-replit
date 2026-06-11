import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const depositWalletBackupsTable = pgTable("deposit_wallet_backups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  oldAddress: text("old_address").notNull(),
  oldPrivateKey: text("old_private_key").notNull(),
  replacedAt: timestamp("replaced_at").notNull().defaultNow(),
  replacedReason: text("replaced_reason").notNull().default("admin_regenerate"),
});

export type DepositWalletBackup = typeof depositWalletBackupsTable.$inferSelect;
