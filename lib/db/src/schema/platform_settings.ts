import { pgTable, serial, boolean, numeric, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformSettingsTable = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  minDeposit: numeric("min_deposit", { precision: 10, scale: 2 }).notNull().default("100"),
  maxDeposit: numeric("max_deposit", { precision: 10, scale: 2 }).notNull().default("1500"),
  maxTotalInvestment: numeric("max_total_investment", { precision: 10, scale: 2 }).notNull().default("2000"),
  hyperCoinMinPercent: numeric("hyper_coin_min_percent", { precision: 5, scale: 2 }).notNull().default("50"),
  spotReferralRate: numeric("spot_referral_rate", { precision: 5, scale: 4 }).notNull().default("0.05"),
  launchOfferActive: boolean("launch_offer_active").notNull().default(true),
  withdrawalEnabled: boolean("withdrawal_enabled").notNull().default(true),
  // SMTP
  smtpEnabled: boolean("smtp_enabled").notNull().default(false),
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPassword: text("smtp_password").notNull().default(""),
  smtpFrom: text("smtp_from").notNull().default(""),
  smtpFromName: text("smtp_from_name").notNull().default("WaytoAlgo"),
  // Legal content
  termsContent: text("terms_content").notNull().default(""),
  privacyContent: text("privacy_content").notNull().default(""),
  // Email feature toggles
  otpRegistrationEnabled: boolean("otp_registration_enabled").notNull().default(false),
  otpWithdrawalEnabled: boolean("otp_withdrawal_enabled").notNull().default(false),
  otpWalletUpdateEnabled: boolean("otp_wallet_update_enabled").notNull().default(false),
  depositConfirmationEnabled: boolean("deposit_confirmation_enabled").notNull().default(false),
  // Blockchain / wallet
  adminMasterWallet: text("admin_master_wallet").notNull().default(""),
  gasWalletPrivateKey: text("gas_wallet_private_key").notNull().default(""),
  bscRpcUrl: text("bsc_rpc_url").notNull().default("https://bsc-dataseed.binance.org/"),
  minDepositUsdt: numeric("min_deposit_usdt", { precision: 10, scale: 2 }).notNull().default("1"),
  // Withdrawal wallet
  withdrawalMode: text("withdrawal_mode").notNull().default("manual"),
  withdrawWalletPrivateKey: text("withdraw_wallet_private_key").notNull().default(""),
  // BondingCurveToken contract address used for the ROI-token payout cycle.
  // When empty, the on-chain buy/sell ROI flow is disabled.
  tokenContractAddress: text("token_contract_address").notNull().default(""),
  // HYPERCOIN price (1 HC = X USDT)
  hyperCoinPrice: numeric("hyper_coin_price", { precision: 10, scale: 4 }).notNull().default("1.0000"),
  // Launch offer
  launchOfferEndDate: timestamp("launch_offer_end_date"),
  // Investment tier daily rates (decimal, e.g. 0.006 = 0.6%) — kept for legacy data
  tier1DailyRate: numeric("tier1_daily_rate", { precision: 8, scale: 5 }).notNull().default("0.00600"),
  tier2DailyRate: numeric("tier2_daily_rate", { precision: 8, scale: 5 }).notNull().default("0.00700"),
  tier3DailyRate: numeric("tier3_daily_rate", { precision: 8, scale: 5 }).notNull().default("0.00800"),
  // Investment tier durations (days) — kept for legacy data
  tier1Days: integer("tier1_days").notNull().default(300),
  tier2Days: integer("tier2_days").notNull().default(260),
  tier3Days: integer("tier3_days").notNull().default(225),
  // Single unified plan (replaces the 3-tier system)
  planDailyRate: numeric("plan_daily_rate", { precision: 8, scale: 5 }).notNull().default("0.00800"),
  planDays: integer("plan_days").notNull().default(300),
  planMinAmount: numeric("plan_min_amount", { precision: 10, scale: 2 }).notNull().default("100"),
  // Flat daily ROI rate (decimal, e.g. 0.004 = 0.4%/day). Used to compute the minimum
  // token distribution amount required each day = eligible ROI principal × dailyRoiRate.
  dailyRoiRate: numeric("daily_roi_rate", { precision: 8, scale: 5 }).notNull().default("0.00400"),
  // Earnings cap — a user can earn at most (multiplier × personal investment) from
  // ROI + level commission combined. base applies normally; boosted applies when the
  // user's DIRECT referrals' total invested volume exceeds their own personal investment.
  earningsCapEnabled: boolean("earnings_cap_enabled").notNull().default(true),
  earningsCapBase: numeric("earnings_cap_base", { precision: 6, scale: 2 }).notNull().default("2.00"),
  earningsCapBoosted: numeric("earnings_cap_boosted", { precision: 6, scale: 2 }).notNull().default("3.00"),
  // Wallet conversion fee — user gets this % of their sell proceeds (e.g. 0.81 = 81%)
  walletConvertReturnRate: numeric("wallet_convert_return_rate", { precision: 5, scale: 4 }).notNull().default("0.8100"),
  // Level commission rates (decimal, e.g. 0.20 = 20%)
  levelCommL1: numeric("level_comm_l1", { precision: 6, scale: 4 }).notNull().default("0.2000"),
  levelCommL2: numeric("level_comm_l2", { precision: 6, scale: 4 }).notNull().default("0.1000"),
  levelCommL3: numeric("level_comm_l3", { precision: 6, scale: 4 }).notNull().default("0.1000"),
  levelCommL4: numeric("level_comm_l4", { precision: 6, scale: 4 }).notNull().default("0.0400"),
  levelCommL5: numeric("level_comm_l5", { precision: 6, scale: 4 }).notNull().default("0.0400"),
  levelCommL6: numeric("level_comm_l6", { precision: 6, scale: 4 }).notNull().default("0.0400"),
  levelCommL7: numeric("level_comm_l7", { precision: 6, scale: 4 }).notNull().default("0.0400"),
  levelCommL8: numeric("level_comm_l8", { precision: 6, scale: 4 }).notNull().default("0.0400"),
  levelCommL9: numeric("level_comm_l9", { precision: 6, scale: 4 }).notNull().default("0.0400"),
  levelCommL10: numeric("level_comm_l10", { precision: 6, scale: 4 }).notNull().default("0.0400"),
  // Level unlock thresholds (upline team business volume needed, in USD)
  levelUnlockL2: numeric("level_unlock_l2", { precision: 10, scale: 2 }).notNull().default("1000"),
  levelUnlockL3: numeric("level_unlock_l3", { precision: 10, scale: 2 }).notNull().default("3000"),
  levelUnlockL4: numeric("level_unlock_l4", { precision: 10, scale: 2 }).notNull().default("10000"),
  levelUnlockL5: numeric("level_unlock_l5", { precision: 10, scale: 2 }).notNull().default("10000"),
  levelUnlockL6: numeric("level_unlock_l6", { precision: 10, scale: 2 }).notNull().default("10000"),
  levelUnlockL7: numeric("level_unlock_l7", { precision: 10, scale: 2 }).notNull().default("10000"),
  levelUnlockL8: numeric("level_unlock_l8", { precision: 10, scale: 2 }).notNull().default("10000"),
  levelUnlockL9: numeric("level_unlock_l9", { precision: 10, scale: 2 }).notNull().default("10000"),
  levelUnlockL10: numeric("level_unlock_l10", { precision: 10, scale: 2 }).notNull().default("10000"),
  // Auto ROI cron toggle
  autoRoiEnabled: boolean("auto_roi_enabled").notNull().default(true),
  // HyperCoin deposit recipient username (admin-configured)
  hcDepositUsername: text("hc_deposit_username").notNull().default(""),
  // Withdrawal cooling period (hours before ROI/commission starts)
  withdrawalCoolingHours: integer("withdrawal_cooling_hours").notNull().default(24),
  // DB Backup
  backupEmail: text("backup_email").notNull().default(""),
  telegramBotToken: text("telegram_bot_token").notNull().default(""),
  telegramChatId: text("telegram_chat_id").notNull().default(""),
  // Platform fees — deposit
  depositFeeFlat: numeric("deposit_fee_flat", { precision: 10, scale: 4 }).notNull().default("0.5000"),
  depositFeePercent: numeric("deposit_fee_percent", { precision: 8, scale: 5 }).notNull().default("0.00500"),
  // Platform fees — withdrawal
  withdrawFeeFlat: numeric("withdraw_fee_flat", { precision: 10, scale: 4 }).notNull().default("0.5000"),
  withdrawFeePercent: numeric("withdraw_fee_percent", { precision: 8, scale: 5 }).notNull().default("0.00500"),
  withdrawFeeMode: text("withdraw_fee_mode").notNull().default("deduct_from_amount"),
  // Certificate of Incorporation fields
  certCompanyName: text("cert_company_name").notNull().default("WaytoAlgo INVESTMENT LTD"),
  certCompanyNumber: text("cert_company_number").notNull().default("14309852"),
  certIncorporatedDate: text("cert_incorporated_date").notNull().default("22nd August 2022"),
  // Fixed pool split for token distribution: this % of bought tokens goes to level commissions;
  // the remaining (1 - pct) goes to investors as Trading Profit.
  // Any unclaimed level comm tokens accumulate in reserveTokenBalance.
  levelCommissionPoolPct: numeric("level_commission_pool_pct", { precision: 5, scale: 4 }).notNull().default("0.2000"),
  // Virtual reserve balance (WTA tokens) — accumulates unclaimed level commission tokens
  reserveTokenBalance: numeric("reserve_token_balance", { precision: 24, scale: 8 }).notNull().default("0"),
  // Level commission active days (0 = unlimited)
  levelDaysL1: integer("level_days_l1").notNull().default(0),
  levelDaysL2: integer("level_days_l2").notNull().default(0),
  levelDaysL3: integer("level_days_l3").notNull().default(0),
  levelDaysL4: integer("level_days_l4").notNull().default(0),
  levelDaysL5: integer("level_days_l5").notNull().default(0),
  levelDaysL6: integer("level_days_l6").notNull().default(0),
  levelDaysL7: integer("level_days_l7").notNull().default(0),
  levelDaysL8: integer("level_days_l8").notNull().default(0),
  levelDaysL9: integer("level_days_l9").notNull().default(0),
  levelDaysL10: integer("level_days_l10").notNull().default(0),

  levelDirectsL1: integer("level_directs_l1").notNull().default(0),
  levelDirectsL2: integer("level_directs_l2").notNull().default(0),
  levelDirectsL3: integer("level_directs_l3").notNull().default(0),
  levelDirectsL4: integer("level_directs_l4").notNull().default(0),
  levelDirectsL5: integer("level_directs_l5").notNull().default(0),
  levelDirectsL6: integer("level_directs_l6").notNull().default(0),
  levelDirectsL7: integer("level_directs_l7").notNull().default(0),
  levelDirectsL8: integer("level_directs_l8").notNull().default(0),
  levelDirectsL9: integer("level_directs_l9").notNull().default(0),
  levelDirectsL10: integer("level_directs_l10").notNull().default(0),
});

export const insertPlatformSettingsSchema = createInsertSchema(platformSettingsTable).omit({ id: true });
export type InsertPlatformSettings = z.infer<typeof insertPlatformSettingsSchema>;
export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
