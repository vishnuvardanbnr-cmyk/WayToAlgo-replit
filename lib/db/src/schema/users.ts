import { pgTable, serial, text, boolean, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  passwordHash: text("password_hash").notNull(),
  referralCode: text("referral_code").notNull().unique(),
  sponsorId: integer("sponsor_id"),
  walletAddress: text("wallet_address"),
  country: text("country"),
  idNumber: text("id_number"),
  profileImage: text("profile_image"),
  currentLevel: integer("current_level").notNull().default(0),
  currentRankId: integer("current_rank_id"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  withdrawalBlocked: boolean("withdrawal_blocked").notNull().default(false),
  p2pBlocked: boolean("p2p_blocked").notNull().default(false),
  investmentBlocked: boolean("investment_blocked").notNull().default(false),
  blockReason: text("block_reason"),
  withdrawalBlockReason: text("withdrawal_block_reason"),
  p2pBlockReason: text("p2p_block_reason"),
  investmentBlockReason: text("investment_block_reason"),
  profileComplete: boolean("profile_complete").notNull().default(false),
  totalEarnings: numeric("total_earnings", { precision: 20, scale: 6 }).notNull().default("0"),
  totalInvested: numeric("total_invested", { precision: 20, scale: 6 }).notNull().default("0"),
  walletBalance: numeric("wallet_balance", { precision: 20, scale: 6 }).notNull().default("0"),
  // Withdraw wallet — collects all earnings + sold-WTA proceeds; the ONLY withdrawable balance.
  // Main walletBalance stays for deposit / invest / P2P only.
  withdrawBalance: numeric("withdraw_balance", { precision: 20, scale: 6 }).notNull().default("0"),
  hyperCoinBalance: numeric("hyper_coin_balance", { precision: 20, scale: 6 }).notNull().default("0"),
  // Virtual ROI-token balance (18-dp token units) credited by on-chain buy distributions.
  // Not withdrawable until sold back to the contract on the Wallet page.
  roiTokenBalance: numeric("roi_token_balance", { precision: 40, scale: 18 }).notNull().default("0"),
  // Separate earning wallets — must be converted to main wallet via token buy/sell
  tradingProfitBalance: numeric("trading_profit_balance", { precision: 20, scale: 6 }).notNull().default("0"),
  teamBenefitBalance: numeric("team_benefit_balance", { precision: 20, scale: 6 }).notNull().default("0"),
  depositAddress: text("deposit_address"),
  depositPrivateKey: text("deposit_private_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
