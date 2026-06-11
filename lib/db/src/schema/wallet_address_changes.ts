import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const walletAddressChangesTable = pgTable(
  "wallet_address_changes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    oldAddress: text("old_address"),
    newAddress: text("new_address").notNull(),
    otpVerified: boolean("otp_verified").notNull().default(false),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byUser: index("wallet_changes_user_idx").on(t.userId),
    byCreated: index("wallet_changes_created_idx").on(t.createdAt),
  }),
);

export type WalletAddressChange = typeof walletAddressChangesTable.$inferSelect;
