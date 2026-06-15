import { Router } from "express";
import { db, usersTable, investmentsTable, withdrawalsTable, incomeTable, platformSettingsTable, offersTable, noticesTable, noticeViewsTable, depositsTable, walletAddressChangesTable, p2pTransfersTable, ranksTable, userRewardsTable, adminBalanceAdjustmentsTable, rankRewardSchedulesTable, userTokenPurchasesTable } from "@workspace/db";
import { eq, desc, ilike, or, and, inArray, sql, like } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { UpdateAdminUserBody, UpdateAdminInvestmentBody, UpdateAdminSettingsBody, ListAdminUsersQueryParams, ListAdminInvestmentsQueryParams, ListAdminWithdrawalsQueryParams } from "@workspace/api-zod";
import { withdrawalToResponse } from "./withdrawals";
import { investmentToResponse } from "./investments";
import { z } from "zod";
import { resolveKey, ensureEncrypted } from "../lib/keyEncryption.js";
import bcrypt from "bcryptjs";

const SmtpSettingsBody = z.object({
  smtpEnabled: z.boolean(),
  smtpHost: z.string(),
  smtpPort: z.number().int(),
  smtpUser: z.string(),
  smtpPassword: z.string(),
  smtpFrom: z.string(),
  smtpFromName: z.string(),
  otpRegistrationEnabled: z.boolean(),
  otpWithdrawalEnabled: z.boolean(),
  otpWalletUpdateEnabled: z.boolean().default(false),
  depositConfirmationEnabled: z.boolean(),
  backupEmail: z.string().default(""),
  telegramBotToken: z.string().default(""),
  telegramChatId: z.string().default(""),
});

const router = Router();

function userToResponse(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    referralCode: user.referralCode,
    sponsorId: user.sponsorId,
    walletAddress: user.walletAddress,
    country: user.country,
    profileImage: user.profileImage,
    currentLevel: user.currentLevel,
    currentRankId: user.currentRankId,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    isBlocked: user.isBlocked,
    withdrawalBlocked: user.withdrawalBlocked,
    p2pBlocked: user.p2pBlocked,
    investmentBlocked: user.investmentBlocked,
    roiBlocked: user.roiBlocked,
    blockReason: user.blockReason,
    withdrawalBlockReason: user.withdrawalBlockReason,
    p2pBlockReason: user.p2pBlockReason,
    investmentBlockReason: user.investmentBlockReason,
    roiBlockReason: user.roiBlockReason,
    walletBalance: parseFloat(user.walletBalance ?? "0"),
    hyperCoinBalance: parseFloat(user.hyperCoinBalance ?? "0"),
    profileComplete: user.profileComplete,
    totalEarnings: parseFloat(user.totalEarnings),
    totalInvested: parseFloat(user.totalInvested),
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /api/admin/stats
router.get("/admin/stats", requireAdmin, async (req, res) => {
  const allUsers = await db.select().from(usersTable);
  const allInvestments = await db.select().from(investmentsTable);
  const allWithdrawals = await db.select().from(withdrawalsTable);
  const allIncome = await db.select().from(incomeTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalUsers = allUsers.length;
  // Active users = users who have invested (not just registered)
  const activeUsers = allUsers.filter(u => parseFloat(u.totalInvested) > 0).length;
  const totalInvested = allInvestments.reduce((s, i) => s + parseFloat(i.amount), 0);
  const totalWithdrawn = allWithdrawals.filter(w => w.status === "approved").reduce((s, w) => s + parseFloat(w.amount), 0);
  const pendingWithdrawals = allWithdrawals.filter(w => w.status === "pending").reduce((s, w) => s + parseFloat(w.amount), 0);
  const totalCommissionsPaid = allIncome.filter(i => i.type !== "daily_return").reduce((s, i) => s + parseFloat(i.amount), 0);
  const newUsersToday = allUsers.filter(u => u.createdAt >= today).length;
  const newInvestmentsToday = allInvestments.filter(i => i.createdAt >= today).reduce((s, i) => s + parseFloat(i.amount), 0);
  const activeInvestments = allInvestments.filter(i => i.status === "active").length;
  const completedInvestments = allInvestments.filter(i => i.status === "completed").length;

  res.json({
    totalUsers,
    activeUsers,
    totalInvested,
    totalWithdrawn,
    pendingWithdrawals,
    totalCommissionsPaid,
    newUsersToday,
    newInvestmentsToday,
    activeInvestments,
    completedInvestments,
  });
});

// GET /api/admin/users
router.get("/admin/users", requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string | undefined;
  const offset = (page - 1) * limit;

  let allUsers = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

  if (search) {
    const s = search.toLowerCase();
    allUsers = allUsers.filter(u =>
      u.name.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      u.phone.includes(s)
    );
  }

  const paginated = allUsers.slice(offset, offset + limit);
  res.json({
    users: paginated.map(userToResponse),
    total: allUsers.length,
    page,
    limit,
  });
});

// GET /api/admin/users/:id
router.get("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  const investments = await db.select().from(investmentsTable).where(eq(investmentsTable.userId, id));
  const directReferrals = await db.select().from(usersTable).where(eq(usersTable.sponsorId, id));

  res.json({
    user: userToResponse(user),
    investments: investments.map(investmentToResponse),
    totalTeamSize: directReferrals.length,
    directReferrals: directReferrals.length,
  });
});

// PUT /api/admin/users/:id
router.put("/admin/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const d = parsed.data;
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.email !== undefined) updates.email = d.email;
  if (d.phone !== undefined) updates.phone = d.phone;
  if (d.country !== undefined) updates.country = d.country;
  if (d.walletAddress !== undefined) updates.walletAddress = d.walletAddress;
  if (d.isActive !== undefined) updates.isActive = d.isActive;
  if (d.isBlocked !== undefined) updates.isBlocked = d.isBlocked;
  if (d.isAdmin !== undefined) updates.isAdmin = d.isAdmin;
  if (d.withdrawalBlocked !== undefined) updates.withdrawalBlocked = d.withdrawalBlocked;
  if (d.p2pBlocked !== undefined) updates.p2pBlocked = d.p2pBlocked;
  if (d.investmentBlocked !== undefined) updates.investmentBlocked = d.investmentBlocked;
  if (d.roiBlocked !== undefined) updates.roiBlocked = d.roiBlocked;
  if (d.blockReason !== undefined) updates.blockReason = d.blockReason;
  if (d.withdrawalBlockReason !== undefined) updates.withdrawalBlockReason = d.withdrawalBlockReason;
  if (d.p2pBlockReason !== undefined) updates.p2pBlockReason = d.p2pBlockReason;
  if (d.investmentBlockReason !== undefined) updates.investmentBlockReason = d.investmentBlockReason;
  if (d.roiBlockReason !== undefined) updates.roiBlockReason = d.roiBlockReason;
  if (d.currentLevel !== undefined) updates.currentLevel = d.currentLevel;
  if (d.walletBalance !== undefined) updates.walletBalance = d.walletBalance.toString();
  if (d.hyperCoinBalance !== undefined) updates.hyperCoinBalance = d.hyperCoinBalance.toString();
  if (d.totalEarnings !== undefined) updates.totalEarnings = d.totalEarnings.toString();

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "No fields to update" });
    return;
  }

  try {
    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json(userToResponse(updated));
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ message: "Email already in use" });
      return;
    }
    throw err;
  }
});

// GET /api/admin/investments
router.get("/admin/investments", requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string | undefined;
  const offset = (page - 1) * limit;

  let allInvestments = await db.select().from(investmentsTable).orderBy(desc(investmentsTable.createdAt));
  if (status) {
    allInvestments = allInvestments.filter(i => i.status === status);
  }

  const userIds = Array.from(new Set(allInvestments.map(i => i.userId)));
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map(u => [u.id, u.name]));

  const paginated = allInvestments.slice(offset, offset + limit);
  res.json({
    investments: paginated.map(i => ({
      ...investmentToResponse(i),
      userName: uMap.get(i.userId) ?? `User #${i.userId}`,
    })),
    total: allInvestments.length,
    page,
    limit,
  });
});

// PUT /api/admin/investments/:id
router.put("/admin/investments/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = UpdateAdminInvestmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [updated] = await db.update(investmentsTable)
    .set({ status: parsed.data.status })
    .where(eq(investmentsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Investment not found" });
    return;
  }
  res.json(investmentToResponse(updated));
});

// GET /api/admin/withdrawals
router.get("/admin/withdrawals", requireAdmin, async (req, res) => {
  const status = req.query.status as string | undefined;
  let withdrawals = await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt));
  if (status) {
    withdrawals = withdrawals.filter(w => w.status === status);
  }
  res.json(withdrawals.map(withdrawalToResponse));
});

// POST /api/admin/withdrawals/:id/approve
router.post("/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [withdrawal] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id)).limit(1);
  if (!withdrawal) {
    res.status(404).json({ message: "Withdrawal not found" });
    return;
  }

  // Try to send on-chain if withdraw wallet is configured
  const settings = await db.select().from(platformSettingsTable).limit(1).then(r => r[0] ?? null);
  const withdrawPlaintextKey = settings ? resolveKey(settings.withdrawWalletPrivateKey) : null;
  const gasPlaintextKey = settings ? resolveKey(settings.gasWalletPrivateKey) : null;
  if (settings && withdrawPlaintextKey && gasPlaintextKey) {
    // Mark processing immediately — guarded so only a pending withdrawal can be approved
    // (a rejected/refunded or already-approved row is never re-sent on-chain).
    const [proc] = await db.update(withdrawalsTable)
      .set({ status: "processing" })
      .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.status, "pending")))
      .returning();
    if (!proc) {
      res.status(409).json({ message: `Cannot approve a withdrawal with status "${withdrawal.status}"` });
      return;
    }
    res.json(withdrawalToResponse({ ...withdrawal, status: "processing" }));

    // Send on-chain async — every transition is guarded on status="processing".
    (async () => {
      try {
        const { sendUsdtToAddress } = await import("../lib/blockchain.js");
        const result = await sendUsdtToAddress(
          withdrawal.walletAddress,
          parseFloat(withdrawal.amount),
          withdrawPlaintextKey,
          gasPlaintextKey,
          settings.bscRpcUrl || "https://bsc-dataseed.binance.org/",
        );
        if (result.success) {
          await db.update(withdrawalsTable)
            .set({ status: "approved", txHash: result.txHash, processedAt: new Date(), processingError: null })
            .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.status, "processing")));
        } else {
          await db.update(withdrawalsTable)
            .set({ status: "pending", processingError: result.error })
            .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.status, "processing")));
        }
      } catch (err: any) {
        await db.update(withdrawalsTable)
          .set({ status: "pending", processingError: err?.message })
          .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.status, "processing")));
      }
    })();
    return;
  }

  // No withdraw wallet configured — approve without on-chain tx (guarded to pending only)
  const [updated] = await db.update(withdrawalsTable)
    .set({ status: "approved", processedAt: new Date() })
    .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.status, "pending")))
    .returning();
  if (!updated) {
    res.status(409).json({ message: `Cannot approve a withdrawal with status "${withdrawal.status}"` });
    return;
  }
  res.json(withdrawalToResponse(updated));
});

// POST /api/admin/withdrawals/:id/reject
router.post("/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

  // Only a PENDING withdrawal can be rejected. The status flip and the refund happen
  // in one transaction, and the flip is guarded on status="pending" so two concurrent
  // rejects (or a reject racing an approve) can never both refund the same request.
  // Rows that are "processing" must resolve (approve/auto) before they can be rejected.
  let rejected: typeof withdrawalsTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    const [w] = await tx.update(withdrawalsTable)
      .set({ status: "rejected", processedAt: new Date(), note: note || null })
      .where(and(eq(withdrawalsTable.id, id), eq(withdrawalsTable.status, "pending")))
      .returning();
    if (w) {
      await tx.update(usersTable)
        .set({ withdrawBalance: sql`${usersTable.withdrawBalance} + ${w.amount}::numeric` })
        .where(eq(usersTable.id, w.userId));
      rejected = w;
    }
  });

  if (rejected) {
    res.json(withdrawalToResponse(rejected));
    return;
  }

  const [existing] = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ message: "Withdrawal not found" });
    return;
  }
  res.status(409).json({ message: `Cannot reject a withdrawal with status "${existing.status}"` });
});

// GET /api/admin/settings
router.get("/admin/settings", requireAdmin, async (req, res) => {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) {
    const [created] = await db.insert(platformSettingsTable).values({}).returning();
    res.json({
      maintenanceMode: created.maintenanceMode,
      minDeposit: parseFloat(created.minDeposit),
      maxDeposit: parseFloat(created.maxDeposit),
      maxTotalInvestment: parseFloat(created.maxTotalInvestment),
      hyperCoinMinPercent: parseFloat(created.hyperCoinMinPercent),
      hyperCoinPrice: parseFloat(created.hyperCoinPrice),
      spotReferralRate: parseFloat(created.spotReferralRate),
      launchOfferActive: created.launchOfferActive,
      withdrawalEnabled: created.withdrawalEnabled,
      autoRoiEnabled: created.autoRoiEnabled,
      launchOfferEndDate: created.launchOfferEndDate ? created.launchOfferEndDate.toISOString().slice(0, 16) : "",
      hcDepositUsername: created.hcDepositUsername,
      withdrawalCoolingHours: created.withdrawalCoolingHours,
    });
    return;
  }
  res.json({
    maintenanceMode: settings.maintenanceMode,
    minDeposit: parseFloat(settings.minDeposit),
    maxDeposit: parseFloat(settings.maxDeposit),
    maxTotalInvestment: parseFloat(settings.maxTotalInvestment),
    hyperCoinMinPercent: parseFloat(settings.hyperCoinMinPercent),
    hyperCoinPrice: parseFloat(settings.hyperCoinPrice),
    spotReferralRate: parseFloat(settings.spotReferralRate),
    launchOfferActive: settings.launchOfferActive,
    withdrawalEnabled: settings.withdrawalEnabled,
    autoRoiEnabled: settings.autoRoiEnabled,
    launchOfferEndDate: settings.launchOfferEndDate ? settings.launchOfferEndDate.toISOString().slice(0, 16) : "",
    hcDepositUsername: settings.hcDepositUsername,
    withdrawalCoolingHours: settings.withdrawalCoolingHours,
  });
});

// PUT /api/admin/settings
router.put("/admin/settings", requireAdmin, async (req, res) => {
  const parsed = UpdateAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [existing] = await db.select().from(platformSettingsTable).limit(1);
  let updated;
  if (existing) {
    const updates: Partial<typeof platformSettingsTable.$inferInsert> = {};
    if (parsed.data.maintenanceMode !== undefined) updates.maintenanceMode = parsed.data.maintenanceMode;
    if (parsed.data.launchOfferActive !== undefined) updates.launchOfferActive = parsed.data.launchOfferActive;
    if (parsed.data.withdrawalEnabled !== undefined) updates.withdrawalEnabled = parsed.data.withdrawalEnabled;
    if (parsed.data.minDeposit !== undefined) updates.minDeposit = parsed.data.minDeposit.toString();
    if (parsed.data.maxDeposit !== undefined) updates.maxDeposit = parsed.data.maxDeposit.toString();
    if (parsed.data.maxTotalInvestment !== undefined) updates.maxTotalInvestment = parsed.data.maxTotalInvestment.toString();
    if (parsed.data.hyperCoinMinPercent !== undefined) updates.hyperCoinMinPercent = parsed.data.hyperCoinMinPercent.toString();
    if (parsed.data.hyperCoinPrice !== undefined) updates.hyperCoinPrice = parsed.data.hyperCoinPrice.toString();
    if (parsed.data.spotReferralRate !== undefined) updates.spotReferralRate = parsed.data.spotReferralRate.toString();
    if (parsed.data.launchOfferEndDate !== undefined) {
      updates.launchOfferEndDate = parsed.data.launchOfferEndDate ? new Date(parsed.data.launchOfferEndDate) : null;
    }
    if (parsed.data.hcDepositUsername !== undefined) updates.hcDepositUsername = parsed.data.hcDepositUsername;
    if (parsed.data.autoRoiEnabled !== undefined) updates.autoRoiEnabled = parsed.data.autoRoiEnabled;
    if (parsed.data.withdrawalCoolingHours !== undefined) updates.withdrawalCoolingHours = parsed.data.withdrawalCoolingHours;
    [updated] = await db.update(platformSettingsTable).set(updates).where(eq(platformSettingsTable.id, existing.id)).returning();
  } else {
    [updated] = await db.insert(platformSettingsTable).values({}).returning();
  }
  res.json({
    maintenanceMode: updated.maintenanceMode,
    minDeposit: parseFloat(updated.minDeposit),
    maxDeposit: parseFloat(updated.maxDeposit),
    maxTotalInvestment: parseFloat(updated.maxTotalInvestment),
    hyperCoinMinPercent: parseFloat(updated.hyperCoinMinPercent),
    hyperCoinPrice: parseFloat(updated.hyperCoinPrice),
    spotReferralRate: parseFloat(updated.spotReferralRate),
    launchOfferActive: updated.launchOfferActive,
    withdrawalEnabled: updated.withdrawalEnabled,
    autoRoiEnabled: updated.autoRoiEnabled,
    launchOfferEndDate: updated.launchOfferEndDate ? updated.launchOfferEndDate.toISOString().slice(0, 16) : "",
    hcDepositUsername: updated.hcDepositUsername,
    withdrawalCoolingHours: updated.withdrawalCoolingHours,
  });
});

// GET /api/admin/legal
router.get("/admin/legal", requireAdmin, async (_req, res) => {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  res.json({
    termsContent: settings?.termsContent ?? "",
    privacyContent: settings?.privacyContent ?? "",
  });
});

// PUT /api/admin/legal
router.put("/admin/legal", requireAdmin, async (req, res) => {
  const { termsContent, privacyContent } = req.body as { termsContent?: string; privacyContent?: string };
  const [existing] = await db.select().from(platformSettingsTable).limit(1);
  const updates: Partial<typeof platformSettingsTable.$inferInsert> = {};
  if (typeof termsContent === "string") updates.termsContent = termsContent;
  if (typeof privacyContent === "string") updates.privacyContent = privacyContent;
  if (existing) {
    await db.update(platformSettingsTable).set(updates).where(eq(platformSettingsTable.id, existing.id));
  } else {
    await db.insert(platformSettingsTable).values(updates as any);
  }
  const [updated] = await db.select().from(platformSettingsTable).limit(1);
  res.json({ termsContent: updated?.termsContent ?? "", privacyContent: updated?.privacyContent ?? "" });
});

// GET /api/admin/withdrawal-settings
router.get("/admin/withdrawal-settings", requireAdmin, async (req, res) => {
  let [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(platformSettingsTable).values({}).returning();
  }
  res.json({
    withdrawalMode: settings.withdrawalMode,
    withdrawKeySet: !!(settings.withdrawWalletPrivateKey),
    withdrawFeeMode: settings.withdrawFeeMode ?? "deduct_from_amount",
  });
});

// PUT /api/admin/withdrawal-settings
router.put("/admin/withdrawal-settings", requireAdmin, async (req, res) => {
  const body = z.object({
    withdrawalMode: z.enum(["auto", "manual"]),
    withdrawWalletPrivateKey: z.string().optional(),
    withdrawFeeMode: z.enum(["deduct_from_amount", "deduct_from_balance"]).optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [existing] = await db.select().from(platformSettingsTable).limit(1);
  const vals: Record<string, unknown> = { withdrawalMode: body.data.withdrawalMode };
  if (body.data.withdrawWalletPrivateKey && body.data.withdrawWalletPrivateKey.trim()) {
    vals.withdrawWalletPrivateKey = ensureEncrypted(body.data.withdrawWalletPrivateKey.trim());
  }
  if (body.data.withdrawFeeMode !== undefined) vals.withdrawFeeMode = body.data.withdrawFeeMode;
  let updated;
  if (existing) {
    [updated] = await db.update(platformSettingsTable)
      .set(vals)
      .where(eq(platformSettingsTable.id, existing.id))
      .returning();
  } else {
    [updated] = await db.insert(platformSettingsTable).values(vals).returning();
  }
  res.json({
    withdrawalMode: updated.withdrawalMode,
    withdrawKeySet: !!(updated.withdrawWalletPrivateKey),
    withdrawFeeMode: updated.withdrawFeeMode ?? "deduct_from_amount",
  });
});

// GET /api/admin/smtp-settings
router.get("/admin/smtp-settings", requireAdmin, async (req, res) => {
  let [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(platformSettingsTable).values({}).returning();
  }
  res.json({
    smtpEnabled: settings.smtpEnabled,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUser: settings.smtpUser,
    smtpPassword: settings.smtpPassword,
    smtpFrom: settings.smtpFrom,
    smtpFromName: settings.smtpFromName,
    otpRegistrationEnabled: settings.otpRegistrationEnabled,
    otpWithdrawalEnabled: settings.otpWithdrawalEnabled,
    otpWalletUpdateEnabled: settings.otpWalletUpdateEnabled,
    depositConfirmationEnabled: settings.depositConfirmationEnabled,
    backupEmail: settings.backupEmail ?? "",
    telegramBotToken: settings.telegramBotToken ?? "",
    telegramChatId: settings.telegramChatId ?? "",
  });
});

// PUT /api/admin/smtp-settings
router.put("/admin/smtp-settings", requireAdmin, async (req, res) => {
  const parsed = SmtpSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const [existing] = await db.select().from(platformSettingsTable).limit(1);
  let updated;
  if (existing) {
    [updated] = await db.update(platformSettingsTable)
      .set({
        smtpEnabled: parsed.data.smtpEnabled,
        smtpHost: parsed.data.smtpHost,
        smtpPort: parsed.data.smtpPort,
        smtpUser: parsed.data.smtpUser,
        smtpPassword: parsed.data.smtpPassword,
        smtpFrom: parsed.data.smtpFrom,
        smtpFromName: parsed.data.smtpFromName,
        otpRegistrationEnabled: parsed.data.otpRegistrationEnabled,
        otpWithdrawalEnabled: parsed.data.otpWithdrawalEnabled,
        otpWalletUpdateEnabled: parsed.data.otpWalletUpdateEnabled,
        depositConfirmationEnabled: parsed.data.depositConfirmationEnabled,
        backupEmail: parsed.data.backupEmail,
        telegramBotToken: parsed.data.telegramBotToken,
        telegramChatId: parsed.data.telegramChatId,
      })
      .where(eq(platformSettingsTable.id, existing.id))
      .returning();
  } else {
    [updated] = await db.insert(platformSettingsTable).values({
      smtpEnabled: parsed.data.smtpEnabled,
      smtpHost: parsed.data.smtpHost,
      smtpPort: parsed.data.smtpPort,
      smtpUser: parsed.data.smtpUser,
      smtpPassword: parsed.data.smtpPassword,
      smtpFrom: parsed.data.smtpFrom,
      smtpFromName: parsed.data.smtpFromName,
      otpRegistrationEnabled: parsed.data.otpRegistrationEnabled,
      otpWithdrawalEnabled: parsed.data.otpWithdrawalEnabled,
      otpWalletUpdateEnabled: parsed.data.otpWalletUpdateEnabled,
      depositConfirmationEnabled: parsed.data.depositConfirmationEnabled,
      backupEmail: parsed.data.backupEmail,
      telegramBotToken: parsed.data.telegramBotToken,
      telegramChatId: parsed.data.telegramChatId,
    }).returning();
  }
  res.json({
    smtpEnabled: updated.smtpEnabled,
    smtpHost: updated.smtpHost,
    smtpPort: updated.smtpPort,
    smtpUser: updated.smtpUser,
    smtpPassword: updated.smtpPassword,
    smtpFrom: updated.smtpFrom,
    smtpFromName: updated.smtpFromName,
    otpRegistrationEnabled: updated.otpRegistrationEnabled,
    otpWithdrawalEnabled: updated.otpWithdrawalEnabled,
    otpWalletUpdateEnabled: updated.otpWalletUpdateEnabled,
    depositConfirmationEnabled: updated.depositConfirmationEnabled,
    backupEmail: updated.backupEmail ?? "",
    telegramBotToken: updated.telegramBotToken ?? "",
    telegramChatId: updated.telegramChatId ?? "",
  });
});

// POST /api/admin/trigger-backup
router.post("/admin/trigger-backup", requireAdmin, async (req, res) => {
  try {
    const { sendDatabaseBackupEmail } = await import("../lib/email.js");
    const result = await sendDatabaseBackupEmail();
    if (result.sent) {
      res.json({ success: true, message: "Backup sent successfully" });
    } else {
      res.status(400).json({ success: false, message: result.error ?? "Backup not sent" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
  }
});

// In-memory lock — prevents two concurrent restores corrupting the DB
let restoreInProgress = false;

// Cleanup stale temp restore files on module load (from previous crashed restores)
import("fs/promises").then(async ({ readdir, unlink }) => {
  const { join } = await import("path");
  try {
    const files = await readdir("/tmp");
    for (const f of files.filter(f => f.startsWith("restore_") && f.endsWith(".sql"))) {
      await unlink(join("/tmp", f)).catch(() => {});
    }
  } catch {}
}).catch(() => {});

// POST /api/admin/db-restore  — multipart/form-data, field "files" (one or many parts)
router.post("/admin/db-restore", requireAdmin, async (req, res) => {
  if (restoreInProgress) {
    res.status(409).json({ success: false, message: "A restore is already in progress — please wait for it to finish before starting another." });
    return;
  }
  restoreInProgress = true;
  try {
    const { default: multer } = await import("multer");
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 600 * 1024 * 1024, files: 50 },
    }).array("files", 50);

    await new Promise<void>((resolve, reject) => {
      upload(req as any, res as any, (err: any) => (err ? reject(err) : resolve()));
    });

    const files = (req as any).files as Express.Multer.File[];
    if (!files || files.length === 0) {
      restoreInProgress = false;
      res.status(400).json({ success: false, message: "No files uploaded" });
      return;
    }

    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const { gunzip } = await import("zlib");
    const execFileAsync = promisify(execFile);
    const gunzipAsync = promisify(gunzip);

    // Sort parts by name so part1, part2 … are in order
    files.sort((a, b) => a.originalname.localeCompare(b.originalname));

    // Join all buffers
    let combined = Buffer.concat(files.map(f => f.buffer));

    // Decompress if gzip
    const isGzip = combined[0] === 0x1f && combined[1] === 0x8b;
    let sqlBuffer: Buffer;
    if (isGzip) {
      try {
        sqlBuffer = await gunzipAsync(combined) as Buffer;
      } catch (err: any) {
        restoreInProgress = false;
        res.status(400).json({ success: false, message: `Decompression failed — make sure all parts are uploaded in order: ${err?.message}` });
        return;
      }
    } else {
      sqlBuffer = combined;
    }

    const dbName = "uranazdb";
    const { writeFile, unlink } = await import("fs/promises");
    const { join } = await import("path");
    const tmpSql = join("/tmp", `restore_${Date.now()}.sql`);

    try {
      // Write SQL to temp file — avoids stdin/maxBuffer limits for large dumps
      await writeFile(tmpSql, sqlBuffer);

      // Step 1: Wipe the entire public schema using the postgres superuser (avoids permission issues)
      await execFileAsync(
        "su",
        ["-c", `psql -d ${dbName} -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO uranaz;"`, "postgres"],
        { maxBuffer: 10 * 1024 * 1024 },
      );
    } catch (err: any) {
      try { await unlink(tmpSql); } catch {}
      restoreInProgress = false;
      res.status(500).json({ success: false, message: `Failed to clean schema before restore: ${err?.message ?? err}` });
      return;
    }

    try {
      // Step 2: Restore from temp file using postgres superuser
      await execFileAsync(
        "su",
        ["-c", `psql -d ${dbName} -q --set ON_ERROR_STOP=1 -f ${tmpSql}`, "postgres"],
        { maxBuffer: 10 * 1024 * 1024 },
      );
    } catch (err: any) {
      try { await unlink(tmpSql); } catch {}
      restoreInProgress = false;
      res.status(500).json({ success: false, message: `Restore failed after schema wipe — database may be in empty state, re-upload backup: ${err?.message ?? err}` });
      return;
    }

    try { await unlink(tmpSql); } catch {}

    // Send response BEFORE restarting PM2 so the client receives confirmation
    res.json({ success: true, message: `Clean restore complete from ${files.length} file${files.length > 1 ? "s" : ""} — all existing data replaced with backup. API is restarting to reconnect…` });

    // Step 3: Restart PM2 after 3s — gives time for the HTTP response to be fully flushed
    // through nginx to the browser before the process is killed and restarted.
    // The lock resets automatically because PM2 restarts the process.
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn("pm2", ["restart", "uranaz-api", "--update-env"], { detached: true, stdio: "ignore" }).unref();
    }, 3000);
  } catch (err: any) {
    restoreInProgress = false;
    res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
  }
});

// GET /api/admin/income-settings
router.get("/admin/income-settings", requireAdmin, async (req, res) => {
  let [s] = await db.select().from(platformSettingsTable).limit(1);
  if (!s) {
    [s] = await db.insert(platformSettingsTable).values({}).returning();
  }
  res.json({
    spotReferralRate: parseFloat(s.spotReferralRate) * 100,
    planDays: s.planDays ?? 300,
    planMinAmount: parseFloat(s.planMinAmount ?? "100"),
    levelCommissionPoolPct: parseFloat(s.levelCommissionPoolPct ?? "0.2") * 100,
    dailyRoiRate: parseFloat(s.dailyRoiRate ?? "0") * 100,
    earningsCapEnabled: s.earningsCapEnabled ?? true,
    earningsCapBase: parseFloat(s.earningsCapBase ?? "2"),
    earningsCapBoosted: parseFloat(s.earningsCapBoosted ?? "3"),
    reserveTokenBalance: parseFloat(s.reserveTokenBalance ?? "0"),
    levelCommL1: parseFloat(s.levelCommL1) * 100,
    levelCommL2: parseFloat(s.levelCommL2) * 100,
    levelCommL3: parseFloat(s.levelCommL3) * 100,
    levelCommL4: parseFloat(s.levelCommL4) * 100,
    levelCommL5: parseFloat(s.levelCommL5) * 100,
    levelCommL6: parseFloat(s.levelCommL6) * 100,
    levelCommL7: parseFloat(s.levelCommL7) * 100,
    levelCommL8: parseFloat(s.levelCommL8) * 100,
    levelCommL9: parseFloat(s.levelCommL9) * 100,
    levelCommL10: parseFloat(s.levelCommL10) * 100,
    levelUnlockL2: parseFloat(s.levelUnlockL2),
    levelUnlockL3: parseFloat(s.levelUnlockL3),
    levelUnlockL4: parseFloat(s.levelUnlockL4),
    levelUnlockL5: parseFloat(s.levelUnlockL5),
    levelUnlockL6: parseFloat(s.levelUnlockL6),
    levelUnlockL7: parseFloat(s.levelUnlockL7),
    levelUnlockL8: parseFloat(s.levelUnlockL8),
    levelUnlockL9: parseFloat(s.levelUnlockL9),
    levelUnlockL10: parseFloat(s.levelUnlockL10),
    levelDaysL1: s.levelDaysL1,
    levelDaysL2: s.levelDaysL2,
    levelDaysL3: s.levelDaysL3,
    levelDaysL4: s.levelDaysL4,
    levelDaysL5: s.levelDaysL5,
    levelDaysL6: s.levelDaysL6,
    levelDaysL7: s.levelDaysL7,
    levelDaysL8: s.levelDaysL8,
    levelDaysL9: s.levelDaysL9,
    levelDaysL10: s.levelDaysL10,
    levelDirectsL1: s.levelDirectsL1,
    levelDirectsL2: s.levelDirectsL2,
    levelDirectsL3: s.levelDirectsL3,
    levelDirectsL4: s.levelDirectsL4,
    levelDirectsL5: s.levelDirectsL5,
    levelDirectsL6: s.levelDirectsL6,
    levelDirectsL7: s.levelDirectsL7,
    levelDirectsL8: s.levelDirectsL8,
    levelDirectsL9: s.levelDirectsL9,
    levelDirectsL10: s.levelDirectsL10,
  });
});

const IncomeSettingsBody = z.object({
  spotReferralRate: z.number().min(0).max(100),
  planDays: z.number().int().min(1).optional(),
  planMinAmount: z.number().min(0).optional(),
  levelCommissionPoolPct: z.number().min(0).max(100).optional(),
  dailyRoiRate: z.number().min(0).max(100).optional(),
  earningsCapEnabled: z.boolean().optional(),
  earningsCapBase: z.number().min(1).max(1000).optional(),
  earningsCapBoosted: z.number().min(1).max(1000).optional(),
  levelCommL1: z.number().min(0).max(100),
  levelCommL2: z.number().min(0).max(100),
  levelCommL3: z.number().min(0).max(100),
  levelCommL4: z.number().min(0).max(100),
  levelCommL5: z.number().min(0).max(100),
  levelCommL6: z.number().min(0).max(100),
  levelCommL7: z.number().min(0).max(100),
  levelCommL8: z.number().min(0).max(100),
  levelCommL9: z.number().min(0).max(100),
  levelCommL10: z.number().min(0).max(100),
  levelUnlockL2: z.number().min(0),
  levelUnlockL3: z.number().min(0),
  levelUnlockL4: z.number().min(0),
  levelUnlockL5: z.number().min(0),
  levelUnlockL6: z.number().min(0),
  levelUnlockL7: z.number().min(0),
  levelUnlockL8: z.number().min(0),
  levelUnlockL9: z.number().min(0),
  levelUnlockL10: z.number().min(0),
  levelDaysL1: z.number().int().min(0),
  levelDaysL2: z.number().int().min(0),
  levelDaysL3: z.number().int().min(0),
  levelDaysL4: z.number().int().min(0),
  levelDaysL5: z.number().int().min(0),
  levelDaysL6: z.number().int().min(0),
  levelDaysL7: z.number().int().min(0),
  levelDaysL8: z.number().int().min(0),
  levelDaysL9: z.number().int().min(0),
  levelDaysL10: z.number().int().min(0),
  levelDirectsL1: z.number().int().min(0).optional(),
  levelDirectsL2: z.number().int().min(0).optional(),
  levelDirectsL3: z.number().int().min(0).optional(),
  levelDirectsL4: z.number().int().min(0).optional(),
  levelDirectsL5: z.number().int().min(0).optional(),
  levelDirectsL6: z.number().int().min(0).optional(),
  levelDirectsL7: z.number().int().min(0).optional(),
  levelDirectsL8: z.number().int().min(0).optional(),
  levelDirectsL9: z.number().int().min(0).optional(),
  levelDirectsL10: z.number().int().min(0).optional(),
});

// PUT /api/admin/income-settings
router.put("/admin/income-settings", requireAdmin, async (req, res) => {
  const parsed = IncomeSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const d = parsed.data;
  const updates: Record<string, unknown> = {
    spotReferralRate: (d.spotReferralRate / 100).toString(),
    ...(d.planDays != null ? { planDays: d.planDays } : {}),
    ...(d.planMinAmount != null ? { planMinAmount: d.planMinAmount.toString() } : {}),
    levelCommissionPoolPct: (((d.levelCommL1 + d.levelCommL2 + d.levelCommL3 + d.levelCommL4 + d.levelCommL5 + d.levelCommL6 + d.levelCommL7 + d.levelCommL8 + d.levelCommL9 + d.levelCommL10)) / 100).toString(),
    ...(d.dailyRoiRate != null ? { dailyRoiRate: (d.dailyRoiRate / 100).toString() } : {}),
    ...(d.earningsCapEnabled != null ? { earningsCapEnabled: d.earningsCapEnabled } : {}),
    ...(d.earningsCapBase != null ? { earningsCapBase: d.earningsCapBase.toString() } : {}),
    ...(d.earningsCapBoosted != null ? { earningsCapBoosted: d.earningsCapBoosted.toString() } : {}),
    levelCommL1: (d.levelCommL1 / 100).toString(),
    levelCommL2: (d.levelCommL2 / 100).toString(),
    levelCommL3: (d.levelCommL3 / 100).toString(),
    levelCommL4: (d.levelCommL4 / 100).toString(),
    levelCommL5: (d.levelCommL5 / 100).toString(),
    levelCommL6: (d.levelCommL6 / 100).toString(),
    levelCommL7: (d.levelCommL7 / 100).toString(),
    levelCommL8: (d.levelCommL8 / 100).toString(),
    levelCommL9: (d.levelCommL9 / 100).toString(),
    levelCommL10: (d.levelCommL10 / 100).toString(),
    levelUnlockL2: d.levelUnlockL2.toString(),
    levelUnlockL3: d.levelUnlockL3.toString(),
    levelUnlockL4: d.levelUnlockL4.toString(),
    levelUnlockL5: d.levelUnlockL5.toString(),
    levelUnlockL6: d.levelUnlockL6.toString(),
    levelUnlockL7: d.levelUnlockL7.toString(),
    levelUnlockL8: d.levelUnlockL8.toString(),
    levelUnlockL9: d.levelUnlockL9.toString(),
    levelUnlockL10: d.levelUnlockL10.toString(),
    levelDaysL1: d.levelDaysL1,
    levelDaysL2: d.levelDaysL2,
    levelDaysL3: d.levelDaysL3,
    levelDaysL4: d.levelDaysL4,
    levelDaysL5: d.levelDaysL5,
    levelDaysL6: d.levelDaysL6,
    levelDaysL7: d.levelDaysL7,
    levelDaysL8: d.levelDaysL8,
    levelDaysL9: d.levelDaysL9,
    levelDaysL10: d.levelDaysL10,
    ...(d.levelDirectsL1 != null ? { levelDirectsL1: d.levelDirectsL1 } : {}),
    ...(d.levelDirectsL2 != null ? { levelDirectsL2: d.levelDirectsL2 } : {}),
    ...(d.levelDirectsL3 != null ? { levelDirectsL3: d.levelDirectsL3 } : {}),
    ...(d.levelDirectsL4 != null ? { levelDirectsL4: d.levelDirectsL4 } : {}),
    ...(d.levelDirectsL5 != null ? { levelDirectsL5: d.levelDirectsL5 } : {}),
    ...(d.levelDirectsL6 != null ? { levelDirectsL6: d.levelDirectsL6 } : {}),
    ...(d.levelDirectsL7 != null ? { levelDirectsL7: d.levelDirectsL7 } : {}),
    ...(d.levelDirectsL8 != null ? { levelDirectsL8: d.levelDirectsL8 } : {}),
    ...(d.levelDirectsL9 != null ? { levelDirectsL9: d.levelDirectsL9 } : {}),
    ...(d.levelDirectsL10 != null ? { levelDirectsL10: d.levelDirectsL10 } : {}),
  };
  const [existing] = await db.select().from(platformSettingsTable).limit(1);
  let s;
  if (existing) {
    [s] = await db.update(platformSettingsTable).set(updates).where(eq(platformSettingsTable.id, existing.id)).returning();
  } else {
    [s] = await db.insert(platformSettingsTable).values(updates).returning();
  }
  res.json({
    spotReferralRate: parseFloat(s.spotReferralRate) * 100,
    planDays: s.planDays ?? 300,
    planMinAmount: parseFloat(s.planMinAmount ?? "100"),
    levelCommissionPoolPct: parseFloat(s.levelCommissionPoolPct ?? "0.2") * 100,
    dailyRoiRate: parseFloat(s.dailyRoiRate ?? "0") * 100,
    earningsCapEnabled: s.earningsCapEnabled ?? true,
    earningsCapBase: parseFloat(s.earningsCapBase ?? "2"),
    earningsCapBoosted: parseFloat(s.earningsCapBoosted ?? "3"),
    reserveTokenBalance: parseFloat(s.reserveTokenBalance ?? "0"),
    levelCommL1: parseFloat(s.levelCommL1) * 100,
    levelCommL2: parseFloat(s.levelCommL2) * 100,
    levelCommL3: parseFloat(s.levelCommL3) * 100,
    levelCommL4: parseFloat(s.levelCommL4) * 100,
    levelCommL5: parseFloat(s.levelCommL5) * 100,
    levelCommL6: parseFloat(s.levelCommL6) * 100,
    levelCommL7: parseFloat(s.levelCommL7) * 100,
    levelCommL8: parseFloat(s.levelCommL8) * 100,
    levelCommL9: parseFloat(s.levelCommL9) * 100,
    levelCommL10: parseFloat(s.levelCommL10) * 100,
    levelUnlockL2: parseFloat(s.levelUnlockL2),
    levelUnlockL3: parseFloat(s.levelUnlockL3),
    levelUnlockL4: parseFloat(s.levelUnlockL4),
    levelUnlockL5: parseFloat(s.levelUnlockL5),
    levelUnlockL6: parseFloat(s.levelUnlockL6),
    levelUnlockL7: parseFloat(s.levelUnlockL7),
    levelUnlockL8: parseFloat(s.levelUnlockL8),
    levelUnlockL9: parseFloat(s.levelUnlockL9),
    levelUnlockL10: parseFloat(s.levelUnlockL10),
    levelDaysL1: s.levelDaysL1,
    levelDaysL2: s.levelDaysL2,
    levelDaysL3: s.levelDaysL3,
    levelDaysL4: s.levelDaysL4,
    levelDaysL5: s.levelDaysL5,
    levelDaysL6: s.levelDaysL6,
    levelDaysL7: s.levelDaysL7,
    levelDaysL8: s.levelDaysL8,
    levelDaysL9: s.levelDaysL9,
    levelDaysL10: s.levelDaysL10,
    levelDirectsL1: s.levelDirectsL1,
    levelDirectsL2: s.levelDirectsL2,
    levelDirectsL3: s.levelDirectsL3,
    levelDirectsL4: s.levelDirectsL4,
    levelDirectsL5: s.levelDirectsL5,
    levelDirectsL6: s.levelDirectsL6,
    levelDirectsL7: s.levelDirectsL7,
    levelDirectsL8: s.levelDirectsL8,
    levelDirectsL9: s.levelDirectsL9,
    levelDirectsL10: s.levelDirectsL10,
  });
});

// ── Offers CRUD ──────────────────────────────────────────────────────────────

const OfferBody = z.object({
  title: z.string().min(1),
  subtitle: z.string().default(""),
  emoji: z.string().default("🎁"),
  reward: z.string().default(""),
  endDate: z.string().nullable().optional(),
  active: z.boolean().default(true),
  criteria: z.array(z.union([
    z.object({ type: z.literal("self_invest"),    label: z.string(), target: z.number() }),
    z.object({ type: z.literal("team_business"),  label: z.string(), target: z.number() }),
    z.object({ type: z.literal("leg"), legIndex: z.number().int(), label: z.string(), target: z.number() }),
  ])).default([]),
});

function offerToResponse(o: typeof offersTable.$inferSelect) {
  return {
    id: o.id,
    title: o.title,
    subtitle: o.subtitle,
    emoji: o.emoji,
    reward: o.reward,
    endDate: o.endDate ? o.endDate.toISOString().slice(0, 16) : null,
    active: o.active,
    criteria: o.criteria,
    createdAt: o.createdAt,
  };
}

// GET /api/admin/offers
router.get("/admin/offers", requireAdmin, async (_req, res) => {
  const offers = await db.select().from(offersTable).orderBy(offersTable.createdAt);
  res.json(offers.map(offerToResponse));
});

// POST /api/admin/offers
router.post("/admin/offers", requireAdmin, async (req, res) => {
  const parsed = OfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }
  const { endDate, ...rest } = parsed.data;
  const [created] = await db.insert(offersTable).values({
    ...rest,
    endDate: endDate ? new Date(endDate) : null,
  }).returning();
  res.json(offerToResponse(created));
});

// PUT /api/admin/offers/:id
router.put("/admin/offers/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
  const parsed = OfferBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }
  const { endDate, ...rest } = parsed.data;
  const updates: any = { ...rest };
  if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;
  const [updated] = await db.update(offersTable).set(updates).where(eq(offersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ message: "Offer not found" }); return; }
  res.json(offerToResponse(updated));
});

// DELETE /api/admin/offers/:id
router.delete("/admin/offers/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
  await db.delete(offersTable).where(eq(offersTable.id, id));
  res.json({ success: true });
});

// ========== Notices ==========
const NoticeBody = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  type: z.enum(["info", "success", "warning", "critical", "announcement", "promo"]).default("info"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  icon: z.string().default(""),
  ctaLabel: z.string().default(""),
  ctaUrl: z.string().default(""),
  audience: z.enum(["all", "active", "inactive", "admin"]).default("all"),
  active: z.boolean().default(true),
  pinned: z.boolean().default(false),
  dismissible: z.boolean().default(true),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
});

function noticeToResponse(n: typeof noticesTable.$inferSelect, viewCount = 0, audienceSize = 0) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    priority: n.priority,
    icon: n.icon,
    ctaLabel: n.ctaLabel,
    ctaUrl: n.ctaUrl,
    audience: n.audience,
    active: n.active,
    pinned: n.pinned,
    dismissible: n.dismissible,
    startsAt: n.startsAt ? n.startsAt.toISOString().slice(0, 16) : null,
    endsAt: n.endsAt ? n.endsAt.toISOString().slice(0, 16) : null,
    createdAt: n.createdAt.toISOString(),
    viewCount,
    audienceSize,
    unreadCount: Math.max(0, audienceSize - viewCount),
  };
}

async function computeAudienceSize(audience: string): Promise<number> {
  const all = await db.select({ id: usersTable.id, isActive: usersTable.isActive, isAdmin: usersTable.isAdmin }).from(usersTable);
  if (audience === "all")      return all.length;
  if (audience === "active")   return all.filter(u => u.isActive).length;
  if (audience === "inactive") return all.filter(u => !u.isActive).length;
  if (audience === "admin")    return all.filter(u => u.isAdmin).length;
  return all.length;
}

router.get("/admin/notices", requireAdmin, async (_req, res) => {
  const notices = await db.select().from(noticesTable).orderBy(desc(noticesTable.createdAt));

  // Aggregate view counts per notice in one query
  const viewCounts = notices.length > 0
    ? await db.select({
        noticeId: noticeViewsTable.noticeId,
        cnt: sql<number>`count(*)::int`,
      }).from(noticeViewsTable)
        .where(inArray(noticeViewsTable.noticeId, notices.map(n => n.id)))
        .groupBy(noticeViewsTable.noticeId)
    : [];
  const viewCountMap = new Map(viewCounts.map(v => [v.noticeId, Number(v.cnt)]));

  // Compute audience sizes (cache by audience type)
  const audienceCache = new Map<string, number>();
  for (const n of notices) {
    if (!audienceCache.has(n.audience)) {
      audienceCache.set(n.audience, await computeAudienceSize(n.audience));
    }
  }

  res.json(notices.map(n =>
    noticeToResponse(n, viewCountMap.get(n.id) ?? 0, audienceCache.get(n.audience) ?? 0)
  ));
});

router.post("/admin/notices", requireAdmin, async (req, res) => {
  const parsed = NoticeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input", issues: parsed.error.issues }); return; }
  const { startsAt, endsAt, ...rest } = parsed.data;
  const [created] = await db.insert(noticesTable).values({
    ...rest,
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null,
  }).returning();
  res.json(noticeToResponse(created));
});

router.put("/admin/notices/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
  const parsed = NoticeBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }
  const { startsAt, endsAt, ...rest } = parsed.data;
  const updates: any = { ...rest };
  if (startsAt !== undefined) updates.startsAt = startsAt ? new Date(startsAt) : null;
  if (endsAt !== undefined)   updates.endsAt   = endsAt ? new Date(endsAt) : null;
  const [updated] = await db.update(noticesTable).set(updates).where(eq(noticesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ message: "Notice not found" }); return; }
  res.json(noticeToResponse(updated));
});

router.delete("/admin/notices/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID" }); return; }
  await db.delete(noticesTable).where(eq(noticesTable.id, id));
  res.json({ success: true });
});

// ============================================================
// REPORTS — Detailed listings for deposits, withdrawals, and
// withdrawal-wallet-address change history.
// ============================================================

function paginate<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const start = (page - 1) * limit;
  return { rows: items.slice(start, start + limit), total };
}

function startOfDay(d: Date) { d.setHours(0, 0, 0, 0); return d; }
function dateRange(query: any) {
  const from = query.from ? new Date(String(query.from)) : null;
  const toRaw = query.to ? new Date(String(query.to)) : null;
  const to = toRaw ? new Date(toRaw.getTime() + 24 * 60 * 60 * 1000 - 1) : null; // inclusive end-of-day
  return { from, to };
}

// GET /api/admin/reports/deposits
router.get("/admin/reports/deposits", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20")) || 20));
  const status = req.query.status ? String(req.query.status) : "";
  const search = (req.query.search ? String(req.query.search) : "").trim().toLowerCase();
  const { from, to } = dateRange(req.query);

  let rows = await db.select().from(depositsTable).orderBy(desc(depositsTable.createdAt));
  if (status) rows = rows.filter(d => d.status === status);
  if (from) rows = rows.filter(d => d.createdAt >= from);
  if (to)   rows = rows.filter(d => d.createdAt <= to);

  // Enrich with user info (single query for distinct users in range).
  const userIds = Array.from(new Set(rows.map(r => r.userId)));
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map(u => [u.id, u]));
  let enriched = rows.map(r => {
    const u = uMap.get(r.userId);
    return {
      id: r.id,
      userId: r.userId,
      userName: u?.name ?? "—",
      userEmail: u?.email ?? "—",
      amount: parseFloat(r.amount),
      status: r.status,
      txHash: r.txHash,
      sweepTxHash: r.sweepTxHash,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      creditedAt: r.creditedAt?.toISOString() ?? null,
    };
  });

  if (search) {
    enriched = enriched.filter(d =>
      d.userName.toLowerCase().includes(search) ||
      d.userEmail.toLowerCase().includes(search) ||
      (d.txHash ?? "").toLowerCase().includes(search) ||
      String(d.userId) === search,
    );
  }

  // Summary across the full filtered set (not just the page).
  const summary = {
    totalCount: enriched.length,
    totalAmount: enriched.reduce((s, d) => s + d.amount, 0),
    creditedCount: enriched.filter(d => d.status === "credited").length,
    creditedAmount: enriched.filter(d => d.status === "credited").reduce((s, d) => s + d.amount, 0),
    pendingCount: enriched.filter(d => d.status === "pending" || d.status === "sweeping").length,
    failedCount: enriched.filter(d => d.status === "failed").length,
  };

  const { rows: pageRows, total } = paginate(enriched, page, limit);
  res.json({ rows: pageRows, total, page, limit, summary });
});

// GET /api/admin/reports/withdrawals
router.get("/admin/reports/withdrawals", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20")) || 20));
  const status = req.query.status ? String(req.query.status) : "";
  const search = (req.query.search ? String(req.query.search) : "").trim().toLowerCase();
  const { from, to } = dateRange(req.query);

  let rows = await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt));
  if (status) rows = rows.filter(w => w.status === status);
  if (from) rows = rows.filter(w => w.createdAt >= from);
  if (to)   rows = rows.filter(w => w.createdAt <= to);

  const userIds = Array.from(new Set(rows.map(r => r.userId)));
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map(u => [u.id, u]));

  let enriched = rows.map(w => {
    const u = uMap.get(w.userId);
    return {
      id: w.id,
      userId: w.userId,
      userName: w.userName || u?.name || "—",
      userEmail: u?.email ?? "—",
      amount: parseFloat(w.amount),
      walletAddress: w.walletAddress,
      status: w.status,
      txHash: w.txHash,
      note: w.note,
      processingError: w.processingError,
      createdAt: w.createdAt.toISOString(),
      processedAt: w.processedAt?.toISOString() ?? null,
    };
  });

  if (search) {
    enriched = enriched.filter(w =>
      w.userName.toLowerCase().includes(search) ||
      w.userEmail.toLowerCase().includes(search) ||
      w.walletAddress.toLowerCase().includes(search) ||
      (w.txHash ?? "").toLowerCase().includes(search) ||
      String(w.userId) === search,
    );
  }

  const summary = {
    totalCount: enriched.length,
    totalRequested: enriched.reduce((s, w) => s + w.amount, 0),
    approvedCount: enriched.filter(w => w.status === "approved").length,
    approvedAmount: enriched.filter(w => w.status === "approved").reduce((s, w) => s + w.amount, 0),
    pendingCount: enriched.filter(w => w.status === "pending").length,
    pendingAmount: enriched.filter(w => w.status === "pending").reduce((s, w) => s + w.amount, 0),
    processingCount: enriched.filter(w => w.status === "processing").length,
    rejectedCount: enriched.filter(w => w.status === "rejected").length,
  };

  const { rows: pageRows, total } = paginate(enriched, page, limit);
  res.json({ rows: pageRows, total, page, limit, summary });
});

// GET /api/admin/reports/wallet-changes
router.get("/admin/reports/wallet-changes", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20")) || 20));
  const search = (req.query.search ? String(req.query.search) : "").trim().toLowerCase();
  const { from, to } = dateRange(req.query);
  const onlyOtp = req.query.otpOnly === "true";

  let rows = await db.select().from(walletAddressChangesTable).orderBy(desc(walletAddressChangesTable.createdAt));
  if (from) rows = rows.filter(r => r.createdAt >= from);
  if (to)   rows = rows.filter(r => r.createdAt <= to);
  if (onlyOtp) rows = rows.filter(r => r.otpVerified);

  const userIds = Array.from(new Set(rows.map(r => r.userId)));
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map(u => [u.id, u]));

  let enriched = rows.map(r => {
    const u = uMap.get(r.userId);
    return {
      id: r.id,
      userId: r.userId,
      userName: u?.name ?? "—",
      userEmail: u?.email ?? "—",
      oldAddress: r.oldAddress,
      newAddress: r.newAddress,
      otpVerified: r.otpVerified,
      ipAddress: r.ipAddress,
      isInitialSetup: !r.oldAddress,
      createdAt: r.createdAt.toISOString(),
    };
  });

  if (search) {
    enriched = enriched.filter(r =>
      r.userName.toLowerCase().includes(search) ||
      r.userEmail.toLowerCase().includes(search) ||
      (r.oldAddress ?? "").toLowerCase().includes(search) ||
      r.newAddress.toLowerCase().includes(search) ||
      String(r.userId) === search,
    );
  }

  // "Distinct users who changed wallet" — counts users with at least one
  // non-initial-setup row in the filtered window.
  const usersWhoChanged = new Set(
    enriched.filter(r => !r.isInitialSetup).map(r => r.userId),
  );

  const summary = {
    totalCount: enriched.length,
    initialSetupCount: enriched.filter(r => r.isInitialSetup).length,
    updateCount: enriched.filter(r => !r.isInitialSetup).length,
    otpVerifiedCount: enriched.filter(r => r.otpVerified).length,
    distinctUsers: usersWhoChanged.size,
  };

  const { rows: pageRows, total } = paginate(enriched, page, limit);
  res.json({ rows: pageRows, total, page, limit, summary });
});

// GET /api/admin/reports/p2p
router.get("/admin/reports/p2p", requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = (req.query.search as string || "").toLowerCase().trim();
  const { from, to } = dateRange(req.query);
  const currency = req.query.currency as string | undefined;

  let rows = await db.select().from(p2pTransfersTable).orderBy(desc(p2pTransfersTable.createdAt));
  if (from) rows = rows.filter(r => r.createdAt >= from);
  if (to)   rows = rows.filter(r => r.createdAt <= to);
  if (currency) rows = rows.filter(r => r.currency === currency);
  if (search) {
    rows = rows.filter(r =>
      r.senderName.toLowerCase().includes(search) ||
      r.senderEmail.toLowerCase().includes(search) ||
      r.recipientName.toLowerCase().includes(search) ||
      r.recipientEmail.toLowerCase().includes(search) ||
      String(r.senderId) === search ||
      String(r.recipientId) === search,
    );
  }

  const totalAmount = rows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
  const usdtCount = rows.filter(r => r.currency === "usdt").length;
  const hyperCount = rows.filter(r => r.currency === "hypercoin").length;

  const summary = {
    totalCount: rows.length,
    totalAmount,
    usdtCount,
    hyperCount,
  };

  const { rows: pageRows, total } = paginate(rows, page, limit);
  res.json({ rows: pageRows, total, page, limit, summary });
});

// ──────────── RANKS CRUD ────────────

const RankBody = z.object({
  rankNumber: z.number().int().min(1),
  name: z.string().min(1),
  selfInvestmentMin: z.number().min(0).optional(),
  directBusinessMin: z.number().min(0).optional(),
  teamBusinessMin: z.number().min(0).optional(),
  legTopPct: z.number().int().min(0).max(100).optional(),
  legSecondPct: z.number().int().min(0).max(100).optional(),
  legRestPct: z.number().int().min(0).max(100).optional(),
  rewardMonthlyAmount: z.number().min(0).optional(),
  rewardMonths: z.number().int().min(0).optional(),
  // Optional display overrides — auto-generated from the structured fields when omitted.
  criteria: z.string().optional(),
  reward: z.string().optional(),
});

function fmtUsd(n: number): string {
  return n % 1 === 0 ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Build the human-readable criteria/reward strings from the structured fields.
function deriveRankDisplay(b: {
  selfInvestmentMin?: number; directBusinessMin?: number; teamBusinessMin?: number;
  rewardMonthlyAmount?: number; rewardMonths?: number;
}) {
  const self = b.selfInvestmentMin ?? 0;
  const direct = b.directBusinessMin ?? 0;
  const team = b.teamBusinessMin ?? 0;
  const monthly = b.rewardMonthlyAmount ?? 0;
  const months = b.rewardMonths ?? 0;
  const criteria = `Self invest ≥ ${fmtUsd(self)} · Direct business ≥ ${fmtUsd(direct)} · Team business ≥ ${fmtUsd(team)}`;
  const reward = months > 0 && monthly > 0
    ? `${fmtUsd(monthly)}/month × ${months} months (${fmtUsd(monthly * months)} total)`
    : "—";
  return { criteria, reward };
}

// Convert numeric fields to the string form drizzle expects for numeric columns.
function rankValuesFrom(data: z.infer<typeof RankBody> | Partial<z.infer<typeof RankBody>>) {
  const v: Record<string, unknown> = {};
  if (data.rankNumber !== undefined) v["rankNumber"] = data.rankNumber;
  if (data.name !== undefined) v["name"] = data.name;
  if (data.selfInvestmentMin !== undefined) v["selfInvestmentMin"] = data.selfInvestmentMin.toFixed(6);
  if (data.directBusinessMin !== undefined) v["directBusinessMin"] = data.directBusinessMin.toFixed(6);
  if (data.teamBusinessMin !== undefined) v["teamBusinessMin"] = data.teamBusinessMin.toFixed(6);
  if (data.legTopPct !== undefined) v["legTopPct"] = data.legTopPct;
  if (data.legSecondPct !== undefined) v["legSecondPct"] = data.legSecondPct;
  if (data.legRestPct !== undefined) v["legRestPct"] = data.legRestPct;
  if (data.rewardMonthlyAmount !== undefined) v["rewardMonthlyAmount"] = data.rewardMonthlyAmount.toFixed(6);
  if (data.rewardMonths !== undefined) v["rewardMonths"] = data.rewardMonths;
  return v;
}

// GET /api/admin/ranks
router.get("/admin/ranks", requireAdmin, async (_req, res) => {
  const ranks = await db.select().from(ranksTable).orderBy(ranksTable.rankNumber);
  res.json(ranks);
});

// POST /api/admin/ranks
router.post("/admin/ranks", requireAdmin, async (req, res) => {
  const parsed = RankBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }
  const display = deriveRankDisplay(parsed.data);
  const values = {
    ...rankValuesFrom(parsed.data),
    criteria: parsed.data.criteria ?? display.criteria,
    reward: parsed.data.reward ?? display.reward,
  } as typeof ranksTable.$inferInsert;
  const [rank] = await db.insert(ranksTable).values(values).returning();
  res.status(201).json(rank);
});

// PUT /api/admin/ranks/:id
router.put("/admin/ranks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  const parsed = RankBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }
  // Recompute display strings from the merged record so they stay in sync.
  const [existing] = await db.select().from(ranksTable).where(eq(ranksTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ message: "Not found" }); return; }
  const merged = {
    selfInvestmentMin: parsed.data.selfInvestmentMin ?? parseFloat(existing.selfInvestmentMin),
    directBusinessMin: parsed.data.directBusinessMin ?? parseFloat(existing.directBusinessMin),
    teamBusinessMin: parsed.data.teamBusinessMin ?? parseFloat(existing.teamBusinessMin),
    rewardMonthlyAmount: parsed.data.rewardMonthlyAmount ?? parseFloat(existing.rewardMonthlyAmount),
    rewardMonths: parsed.data.rewardMonths ?? existing.rewardMonths,
  };
  const display = deriveRankDisplay(merged);
  const values = {
    ...rankValuesFrom(parsed.data),
    criteria: parsed.data.criteria ?? display.criteria,
    reward: parsed.data.reward ?? display.reward,
  };
  const [rank] = await db.update(ranksTable).set(values).where(eq(ranksTable.id, id)).returning();
  if (!rank) { res.status(404).json({ message: "Not found" }); return; }
  res.json(rank);
});

// POST /api/admin/ranks/run-engine — manually trigger auto-promotion + payouts
router.post("/admin/ranks/run-engine", requireAdmin, async (_req, res) => {
  try {
    const { runRankEngine } = await import("../lib/rankEngine");
    const result = await runRankEngine();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ message: err?.message ?? "Rank engine failed" });
  }
});

// DELETE /api/admin/ranks/:id
router.delete("/admin/ranks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  await db.delete(ranksTable).where(eq(ranksTable.id, id));
  res.json({ ok: true });
});

// GET /api/admin/server-status
router.get("/admin/server-status", requireAdmin, (_req, res) => {
  const os = require("os");
  const { execSync } = require("child_process");

  const mem = process.memoryUsage();

  // Real server RAM
  const ramTotalMB  = Math.round(os.totalmem() / 1024 / 1024);
  const ramFreeMB   = Math.round(os.freemem()  / 1024 / 1024);
  const ramUsedMB   = ramTotalMB - ramFreeMB;

  // CPU
  const cpuCores = os.cpus().length;
  const loadAvg  = os.loadavg(); // [1m, 5m, 15m]

  // Disk — parse `df -m /`
  let diskUsedMB = 0, diskTotalMB = 0;
  try {
    const dfLine = execSync("df -m / | tail -1", { timeout: 3000 }).toString().trim();
    const parts  = dfLine.split(/\s+/);
    diskTotalMB  = parseInt(parts[1], 10);
    diskUsedMB   = parseInt(parts[2], 10);
  } catch { /* ignore */ }

  // System uptime
  const sysUptimeSeconds = Math.floor(os.uptime());

  res.json({
    // Server RAM
    ramTotalMB,
    ramUsedMB,
    ramFreeMB,
    // API process memory
    heapUsed:  Math.round(mem.heapUsed  / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss:       Math.round(mem.rss       / 1024 / 1024),
    // CPU
    cpuCores,
    loadAvg1m:  Math.round(loadAvg[0] * 100) / 100,
    loadAvg5m:  Math.round(loadAvg[1] * 100) / 100,
    loadAvg15m: Math.round(loadAvg[2] * 100) / 100,
    // Disk
    diskTotalMB,
    diskUsedMB,
    // Uptime
    processUptimeSeconds: Math.floor(process.uptime()),
    sysUptimeSeconds,
  });
});

// POST /api/admin/server-restart — graceful restart via PM2 (process.exit triggers PM2 restart)
router.post("/admin/server-restart", requireAdmin, (_req, res) => {
  res.json({ ok: true, message: "Server is restarting…" });
  setTimeout(() => process.exit(0), 400);
});

// POST /api/admin/run-daily-payout — manual trigger for testing
router.post("/admin/run-daily-payout", requireAdmin, async (req, res) => {
  try {
    const { processDailyPayout } = await import("../lib/dailyPayout");
    const stats = await processDailyPayout();
    res.json({ success: true, ...stats });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Payout failed" });
  }
});

// ── Token-based ROI payout ──────────────────────────────────────────────────

// GET /api/admin/token/preview?profitUsdt=&mode=buy|held
// Returns eligibility (count of users + total ROI amount) and, for a given
// amount, the token quantity + split that WOULD be distributed — so the admin
// can confirm exactly who gets paid before acting. No chain/DB writes.
router.get("/admin/token/preview", requireAdmin, async (req, res) => {
  const profitUsdt = parseFloat(String(req.query.profitUsdt ?? "0"));
  const mode = req.query.mode === "held" ? "held" : "buy";
  try {
    const { previewTokenDistribution } = await import("../lib/tokenPayout");
    const result = await previewTokenDistribution(
      Number.isFinite(profitUsdt) ? profitUsdt : 0,
      mode as "buy" | "held",
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Preview failed" });
  }
});

// POST /api/admin/token/distribute  { profitUsdt: number, mode?: "buy" | "held" }
// Admin enters the day's trading profit (USDT). mode "buy" buys that much token
// on-chain (raising the live price); mode "held" distributes tokens already sent
// to the withdraw wallet (no buy). Both distribute the tokens virtually to
// investors proportional to active principal, carving level commissions.
router.post("/admin/token/distribute", requireAdmin, async (req, res) => {
  const profitUsdt = parseFloat(req.body?.profitUsdt);
  const mode = req.body?.mode === "held" ? "held" : "buy";
  if (!Number.isFinite(profitUsdt) || profitUsdt <= 0) {
    res.status(400).json({ success: false, message: "Enter a positive profit amount (USDT)" });
    return;
  }
  try {
    const { runTokenDistribute } = await import("../lib/tokenPayout");
    const result = await runTokenDistribute(profitUsdt, mode as "buy" | "held");
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Distribution failed" });
  }
});

// GET /api/admin/token/batches — buy & distribute history
router.get("/admin/token/batches", requireAdmin, async (_req, res) => {
  const { tokenBuyBatchesTable } = await import("@workspace/db");
  const batches = await db.select().from(tokenBuyBatchesTable).orderBy(desc(tokenBuyBatchesTable.createdAt)).limit(100);
  res.json(batches.map((b) => ({
    id: b.id,
    usdtSpent: parseFloat(b.usdtSpent),
    expectedUsdt: parseFloat(b.expectedUsdt ?? "0"),
    source: b.source,
    tokensBought: b.tokensBought,
    buyPrice: b.buyPrice,
    buyTxHash: b.buyTxHash,
    recipientCount: b.recipientCount,
    roiTokenTotal: b.roiTokenTotal,
    levelTokenTotal: b.levelTokenTotal,
    status: b.status,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
  })));
});

// GET /api/admin/token/status — live contract config + platform wallet balances
router.get("/admin/token/status", requireAdmin, async (_req, res) => {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  const contractAddress = (settings?.tokenContractAddress || "").trim();
  const { isValidAddress, getTokenPrices, getPlatformBalances, TOKEN_DECIMALS } = await import("../lib/tokenChain");
  const { ethers } = await import("ethers");

  if (!settings || !isValidAddress(contractAddress)) {
    res.json({ configured: false, contractAddress });
    return;
  }
  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";
  const withdrawKey = resolveKey(settings.withdrawWalletPrivateKey);

  const out: any = { configured: true, contractAddress, walletConfigured: !!withdrawKey };
  try {
    const prices = await getTokenPrices(contractAddress, rpcUrl);
    out.buyPrice = prices.buyPrice;
    out.sellPrice = prices.sellPrice;
  } catch (err: any) {
    out.priceError = err?.shortMessage || err?.message || "Could not read prices";
  }
  if (withdrawKey) {
    try {
      const bal = await getPlatformBalances(contractAddress, withdrawKey, rpcUrl);
      out.walletAddress = bal.address;
      out.walletTokenBalance = ethers.formatUnits(bal.tokenWei, TOKEN_DECIMALS);
      out.walletUsdtBalance = ethers.formatUnits(bal.usdtWei, 18);
    } catch (err: any) {
      out.balanceError = err?.shortMessage || err?.message || "Could not read balances";
    }
  }
  res.json(out);
});

// ── Offer Eligible List ─────────────────────────────────────────────────────
// GET /api/admin/offer-eligible
// Returns each active offer with the list of users who meet ALL criteria.
router.get("/admin/offer-eligible", requireAdmin, async (_req, res) => {
  const [offers, users, rewards] = await Promise.all([
    db.select().from(offersTable).orderBy(offersTable.createdAt),
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      referralCode: usersTable.referralCode,
      sponsorId: usersTable.sponsorId,
      totalInvested: usersTable.totalInvested,
    }).from(usersTable),
    db.select().from(userRewardsTable).where(eq(userRewardsTable.type, "offer")),
  ]);

  // Build sponsor → direct referrals map
  const directRefsMap = new Map<number, typeof users>();
  for (const u of users) {
    if (u.sponsorId) {
      if (!directRefsMap.has(u.sponsorId)) directRefsMap.set(u.sponsorId, []);
      directRefsMap.get(u.sponsorId)!.push(u);
    }
  }

  // Build reward lookup: "userId:referenceId" => reward record
  const rewardSet = new Set(rewards.map(r => `${r.userId}:${r.referenceId}`));
  const rewardMap = new Map(rewards.map(r => [`${r.userId}:${r.referenceId}`, r]));

  function teamBusiness(userId: number): number {
    const direct = directRefsMap.get(userId) ?? [];
    return direct.reduce((sum, u) => sum + parseFloat(u.totalInvested ?? "0"), 0);
  }

  const activeOffers = offers.filter(o => o.active);

  const result = activeOffers.map(offer => {
    const criteria = (offer.criteria as any[]) ?? [];
    const eligible = users.filter(user => {
      return criteria.every(c => {
        if (c.type === "self_invest") {
          return parseFloat(user.totalInvested ?? "0") >= c.target;
        }
        if (c.type === "team_business") {
          return teamBusiness(user.id) >= c.target;
        }
        if (c.type === "leg") {
          const legs = (directRefsMap.get(user.id) ?? [])
            .sort((a, b) => parseFloat(b.totalInvested ?? "0") - parseFloat(a.totalInvested ?? "0"));
          const leg = legs[c.legIndex - 1];
          return leg ? parseFloat(leg.totalInvested ?? "0") >= c.target : false;
        }
        return false;
      });
    });

    return {
      offer: { id: offer.id, title: offer.title, emoji: offer.emoji, reward: offer.reward, endDate: offer.endDate },
      eligible: eligible.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        referralCode: u.referralCode,
        totalInvested: parseFloat(u.totalInvested ?? "0"),
        teamBusiness: teamBusiness(u.id),
        rewarded: rewardSet.has(`${u.id}:${offer.id}`),
        rewardedAt: rewardMap.get(`${u.id}:${offer.id}`)?.rewardedAt ?? null,
        rewardNote: rewardMap.get(`${u.id}:${offer.id}`)?.note ?? null,
      })),
    };
  });

  res.json(result);
});

// ── Rank Achievers List ─────────────────────────────────────────────────────
// GET /api/admin/rank-achievers
// Returns each rank with users who have achieved it (currentRankId === rank.id).
router.get("/admin/rank-achievers", requireAdmin, async (_req, res) => {
  const [ranks, holders, schedules, rewards] = await Promise.all([
    db.select().from(ranksTable).orderBy(ranksTable.rankNumber),
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      referralCode: usersTable.referralCode,
      currentRankId: usersTable.currentRankId,
      totalInvested: usersTable.totalInvested,
    }).from(usersTable).where(sql`${usersTable.currentRankId} is not null`),
    // Reward schedules carry the monthly-payout progress. Join the user so we can
    // list reward recipients even after they were promoted off this rank.
    db.select({
      userId: rankRewardSchedulesTable.userId,
      rankId: rankRewardSchedulesTable.rankId,
      status: rankRewardSchedulesTable.status,
      monthsPaid: rankRewardSchedulesTable.monthsPaid,
      totalMonths: rankRewardSchedulesTable.totalMonths,
      monthlyAmount: rankRewardSchedulesTable.monthlyAmount,
      nextPayoutAt: rankRewardSchedulesTable.nextPayoutAt,
      startedAt: rankRewardSchedulesTable.startedAt,
      uName: usersTable.name,
      uEmail: usersTable.email,
      uPhone: usersTable.phone,
      uReferral: usersTable.referralCode,
      uCurrentRankId: usersTable.currentRankId,
      uTotalInvested: usersTable.totalInvested,
    }).from(rankRewardSchedulesTable)
      .leftJoin(usersTable, eq(rankRewardSchedulesTable.userId, usersTable.id)),
    db.select().from(userRewardsTable).where(eq(userRewardsTable.type, "rank")),
  ]);

  const rewardSet = new Set(rewards.map(r => `${r.userId}:${r.referenceId}`));
  const rewardMap = new Map(rewards.map(r => [`${r.userId}:${r.referenceId}`, r]));
  const rankNameById = new Map(ranks.map(r => [r.id, r.name]));

  type Achiever = {
    id: number;
    name: string;
    email: string;
    phone: string;
    referralCode: string;
    totalInvested: number;
    isCurrentRank: boolean;
    promotedToRank: string | null;
    schedule: {
      status: string;
      monthsPaid: number;
      totalMonths: number;
      remaining: number;
      monthlyAmount: number;
      totalPaid: number;
      nextPayoutAt: string | null;
      startedAt: string | null;
    } | null;
    rewarded: boolean;
    rewardedAt: Date | null;
    rewardNote: string | null;
  };

  const result = ranks.map(rank => {
    const byUser = new Map<number, Achiever>();

    // 1. Current holders of this rank (may not have a monthly schedule if the
    //    rank pays no monthly reward).
    for (const u of holders) {
      if (u.currentRankId !== rank.id) continue;
      byUser.set(u.id, {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        referralCode: u.referralCode,
        totalInvested: parseFloat(u.totalInvested ?? "0"),
        isCurrentRank: true,
        promotedToRank: null,
        schedule: null,
        rewarded: false,
        rewardedAt: null,
        rewardNote: null,
      });
    }

    // 2. Everyone who has a reward schedule for this rank (active, completed, or
    //    superseded because they were promoted to a higher rank).
    for (const s of schedules) {
      if (s.rankId !== rank.id) continue;
      const isCurrentRank = s.uCurrentRankId === rank.id;
      const monthly = parseFloat(s.monthlyAmount ?? "0");
      const remaining = Math.max(0, s.totalMonths - s.monthsPaid);
      const sched = {
        status: s.status,
        monthsPaid: s.monthsPaid,
        totalMonths: s.totalMonths,
        remaining,
        monthlyAmount: monthly,
        totalPaid: monthly * s.monthsPaid,
        nextPayoutAt: s.nextPayoutAt ? s.nextPayoutAt.toISOString() : null,
        startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      };
      const promotedToRank =
        s.status === "superseded" && s.uCurrentRankId != null
          ? rankNameById.get(s.uCurrentRankId) ?? null
          : null;
      const existing = byUser.get(s.userId);
      if (existing) {
        existing.schedule = sched;
        existing.isCurrentRank = isCurrentRank;
        existing.promotedToRank = promotedToRank;
      } else {
        byUser.set(s.userId, {
          id: s.userId,
          name: s.uName ?? "",
          email: s.uEmail ?? "",
          phone: s.uPhone ?? "",
          referralCode: s.uReferral ?? "",
          totalInvested: parseFloat(s.uTotalInvested ?? "0"),
          isCurrentRank,
          promotedToRank,
          schedule: sched,
          rewarded: false,
          rewardedAt: null,
          rewardNote: null,
        });
      }
    }

    // 3. Overlay the manual "physical reward given" marks.
    const achievers = Array.from(byUser.values()).map(a => {
      const key = `${a.id}:${rank.id}`;
      a.rewarded = rewardSet.has(key);
      a.rewardedAt = rewardMap.get(key)?.rewardedAt ?? null;
      a.rewardNote = rewardMap.get(key)?.note ?? null;
      return a;
    });

    // Active first, then completed, then promoted/superseded; alphabetical within.
    const statusOrder: Record<string, number> = { active: 0, completed: 1, superseded: 2 };
    achievers.sort((x, y) => {
      const sx = x.schedule ? statusOrder[x.schedule.status] ?? 3 : 3;
      const sy = y.schedule ? statusOrder[y.schedule.status] ?? 3 : 3;
      if (sx !== sy) return sx - sy;
      return x.name.localeCompare(y.name);
    });

    return {
      rank: {
        id: rank.id,
        rankNumber: rank.rankNumber,
        name: rank.name,
        reward: rank.reward,
        rewardMonthlyAmount: parseFloat(rank.rewardMonthlyAmount ?? "0"),
        rewardMonths: rank.rewardMonths ?? 0,
      },
      achievers,
    };
  });

  res.json(result);
});

// ── Mark / Unmark Rewarded ──────────────────────────────────────────────────
// POST /api/admin/mark-rewarded
router.post("/admin/mark-rewarded", requireAdmin, async (req, res) => {
  const parsed = z.object({
    userId: z.number().int(),
    type: z.enum(["offer", "rank"]),
    referenceId: z.number().int(),
    note: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }
  const { userId, type, referenceId, note } = parsed.data;
  await db.insert(userRewardsTable)
    .values({ userId, type, referenceId, note: note ?? null })
    .onConflictDoUpdate({
      target: [userRewardsTable.userId, userRewardsTable.type, userRewardsTable.referenceId],
      set: { rewardedAt: new Date(), note: note ?? null },
    });
  res.json({ success: true });
});

// DELETE /api/admin/mark-rewarded
router.delete("/admin/mark-rewarded", requireAdmin, async (req, res) => {
  const parsed = z.object({
    userId: z.number().int(),
    type: z.enum(["offer", "rank"]),
    referenceId: z.number().int(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }
  const { userId, type, referenceId } = parsed.data;
  await db.delete(userRewardsTable)
    .where(and(
      eq(userRewardsTable.userId, userId),
      eq(userRewardsTable.type, type),
      eq(userRewardsTable.referenceId, referenceId),
    ));
  res.json({ success: true });
});

// ── Admin Balance Adjustments ─────────────────────────────────────────────────

// POST /api/admin/users/:id/add-balance
router.post("/admin/users/:id/add-balance", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ message: "Invalid user ID" }); return; }

  const parsed = z.object({
    currency: z.enum(["usdt", "hypercoin"]),
    amount: z.number().positive(),
    note: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid input" }); return; }

  const { currency, amount, note } = parsed.data;
  const adminId = (req as any).user.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ message: "User not found" }); return; }

  let updatedUser;
  if (currency === "usdt") {
    const newBalance = parseFloat(user.walletBalance ?? "0") + amount;
    [updatedUser] = await db.update(usersTable)
      .set({ walletBalance: newBalance.toString() })
      .where(eq(usersTable.id, userId))
      .returning();
  } else {
    const newBalance = parseFloat(user.hyperCoinBalance ?? "0") + amount;
    [updatedUser] = await db.update(usersTable)
      .set({ hyperCoinBalance: newBalance.toString() })
      .where(eq(usersTable.id, userId))
      .returning();
  }

  await db.insert(adminBalanceAdjustmentsTable).values({
    userId,
    adminId,
    currency,
    amount: amount.toString(),
    note: note ?? null,
  });

  res.json(userToResponse(updatedUser));
});

// GET /api/admin/reports/income
router.get("/admin/reports/income", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20")) || 20));
  const search = (req.query.search ? String(req.query.search) : "").trim().toLowerCase();
  const typeFilter = req.query.type ? String(req.query.type) : "";
  const { from, to } = dateRange(req.query);

  let rows = await db.select().from(incomeTable).orderBy(desc(incomeTable.createdAt));
  if (typeFilter) rows = rows.filter(r => r.type === typeFilter);
  if (from) rows = rows.filter(r => r.createdAt >= from!);
  if (to)   rows = rows.filter(r => r.createdAt <= to!);

  const userIds = Array.from(new Set(rows.map(r => r.userId)));
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map(u => [u.id, u]));

  let enriched = rows.map(r => {
    const u = uMap.get(r.userId);
    return {
      id: r.id,
      userId: r.userId,
      userName: u?.name ?? "—",
      userEmail: u?.email ?? "—",
      type: r.type,
      amount: parseFloat(r.amount),
      description: r.description,
      fromUserId: r.fromUserId,
      fromUserName: r.fromUserName,
      level: r.level,
      createdAt: r.createdAt.toISOString(),
    };
  });

  if (search) {
    enriched = enriched.filter(r =>
      r.userName.toLowerCase().includes(search) ||
      r.userEmail.toLowerCase().includes(search) ||
      r.description.toLowerCase().includes(search) ||
      String(r.userId) === search,
    );
  }

  const summary = {
    totalCount: enriched.length,
    totalAmount: enriched.reduce((s, r) => s + r.amount, 0),
    dailyReturnCount: enriched.filter(r => r.type === "daily_return").length,
    dailyReturnAmount: enriched.filter(r => r.type === "daily_return").reduce((s, r) => s + r.amount, 0),
    levelCommCount: enriched.filter(r => r.type === "level_commission").length,
    levelCommAmount: enriched.filter(r => r.type === "level_commission").reduce((s, r) => s + r.amount, 0),
    spotReferralCount: enriched.filter(r => r.type === "spot_referral").length,
    spotReferralAmount: enriched.filter(r => r.type === "spot_referral").reduce((s, r) => s + r.amount, 0),
    rankBonusCount: enriched.filter(r => r.type === "rank_bonus").length,
    rankBonusAmount: enriched.filter(r => r.type === "rank_bonus").reduce((s, r) => s + r.amount, 0),
  };

  const { rows: pageRows, total } = paginate(enriched, page, limit);
  res.json({ rows: pageRows, total, page, limit, summary });
});

// GET /api/admin/reports/balance-adjustments
router.get("/admin/reports/balance-adjustments", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20")) || 20));
  const search = (req.query.search ? String(req.query.search) : "").trim().toLowerCase();
  const currencyFilter = req.query.currency ? String(req.query.currency) : "";
  const { from, to } = dateRange(req.query);

  let rows = await db.select().from(adminBalanceAdjustmentsTable).orderBy(desc(adminBalanceAdjustmentsTable.createdAt));
  if (currencyFilter) rows = rows.filter(r => r.currency === currencyFilter);
  if (from) rows = rows.filter(r => r.createdAt >= from!);
  if (to)   rows = rows.filter(r => r.createdAt <= to!);

  const userIds = Array.from(new Set([...rows.map(r => r.userId), ...rows.map(r => r.adminId)]));
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map(u => [u.id, u]));

  let enriched = rows.map(r => {
    const u = uMap.get(r.userId);
    const a = uMap.get(r.adminId);
    return {
      id: r.id,
      userId: r.userId,
      userName: u?.name ?? "—",
      userEmail: u?.email ?? "—",
      adminId: r.adminId,
      adminName: a?.name ?? "—",
      currency: r.currency,
      amount: parseFloat(r.amount),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    };
  });

  if (search) {
    enriched = enriched.filter(r =>
      r.userName.toLowerCase().includes(search) ||
      r.userEmail.toLowerCase().includes(search) ||
      (r.note ?? "").toLowerCase().includes(search) ||
      String(r.userId) === search,
    );
  }

  const summary = {
    totalCount: enriched.length,
    totalUsdtAmount: enriched.filter(r => r.currency === "usdt").reduce((s, r) => s + r.amount, 0),
    totalHyperAmount: enriched.filter(r => r.currency === "hypercoin").reduce((s, r) => s + r.amount, 0),
    usdtCount: enriched.filter(r => r.currency === "usdt").length,
    hyperCount: enriched.filter(r => r.currency === "hypercoin").length,
  };

  const { rows: pageRows, total } = paginate(enriched, page, limit);
  res.json({ rows: pageRows, total, page, limit, summary });
});

// ── Safe Invest pending token allocations ──────────────────────────────────
// GET /api/admin/token-allocations/pending
// Lists all Safe Invest token records that have not yet been minted (wtaReceived = 0,
// txHash starts with "virtual:"). Each row includes the user's name, email, wallet
// address, the USDT amount to purchase and the investment date.
router.get("/admin/token-allocations/pending", requireAdmin, async (_req, res) => {
  const pending = await db.select().from(userTokenPurchasesTable)
    .where(like(userTokenPurchasesTable.txHash, "virtual:%"))
    .orderBy(desc(userTokenPurchasesTable.createdAt));

  const enriched = await Promise.all(pending.map(async (row) => {
    const [user] = await db.select({ name: usersTable.name, email: usersTable.email, walletAddress: usersTable.walletAddress })
      .from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
    return {
      id: row.id,
      userId: row.userId,
      userName: user?.name ?? `User #${row.userId}`,
      userEmail: user?.email ?? "",
      walletAddress: user?.walletAddress ?? row.walletAddress,
      usdtSpent: parseFloat(row.usdtSpent),
      createdAt: row.createdAt.toISOString(),
    };
  }));

  res.json({ rows: enriched, total: enriched.length });
});

// GET /api/admin/token-allocations/:id/resolve
// Returns the on-chain parameters needed for MetaMask-based settlement:
// contractAddress, usdtContractAddress, usdtAmount, userWallet, referrers[10].
router.get("/admin/token-allocations/:id/resolve", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) { res.status(400).json({ message: "Invalid id" }); return; }

  const [cfg] = await db.select().from(platformSettingsTable).limit(1);
  const contractAddress = (cfg?.tokenContractAddress ?? "").trim();
  const adminMasterWallet = (cfg?.adminMasterWallet ?? "").trim();

  if (!contractAddress) { res.status(400).json({ message: "Token contract address not configured in Settings" }); return; }

  const [row] = await db.select().from(userTokenPurchasesTable).where(eq(userTokenPurchasesTable.id, id)).limit(1);
  if (!row || !row.txHash.startsWith("virtual:")) {
    res.status(404).json({ message: "Pending allocation not found" }); return;
  }

  const [user] = await db.select({ walletAddress: usersTable.walletAddress }).from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
  const userWallet = (user?.walletAddress ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(userWallet)) {
    res.status(400).json({ message: "User has no valid BSC wallet address" }); return;
  }

  const ADDR_RE_R = /^0x[0-9a-fA-F]{40}$/;
  const fallback = ADDR_RE_R.test(adminMasterWallet) ? adminMasterWallet : "0x0000000000000000000000000000000000000000";
  const SAFE_USER_LEVELS = 5;
  const TOTAL_LEVELS = 10;

  const referrers: string[] = [];
  const [buyer] = await db.select({ sponsorId: usersTable.sponsorId }).from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
  let currentSponsorId: number | null = buyer?.sponsorId ?? null;
  const seen = new Set<number>([row.userId]);

  for (let level = 0; level < SAFE_USER_LEVELS; level++) {
    if (currentSponsorId == null || seen.has(currentSponsorId)) {
      referrers.push(fallback); currentSponsorId = null; continue;
    }
    seen.add(currentSponsorId);
    const [sponsor] = await db.select({ id: usersTable.id, walletAddress: usersTable.walletAddress, sponsorId: usersTable.sponsorId })
      .from(usersTable).where(eq(usersTable.id, currentSponsorId)).limit(1);
    if (!sponsor) { referrers.push(fallback); currentSponsorId = null; continue; }
    const w = (sponsor.walletAddress ?? "").trim();
    referrers.push(ADDR_RE_R.test(w) ? w : fallback);
    currentSponsorId = sponsor.sponsorId ?? null;
  }
  referrers.push(fallback); // slot 5: admin cut
  while (referrers.length < TOTAL_LEVELS) referrers.push(fallback); // slots 6–9

  res.json({
    id: row.id,
    contractAddress,
    usdtContractAddress: "0x55d398326f99059fF775485246999027B3197955",
    usdtAmount: parseFloat(row.usdtSpent),
    userWallet,
    referrers,
  });
});

// POST /api/admin/token-allocations/:id/confirm
// Called by the frontend after MetaMask settle completes. Updates the allocation record
// with the real txHash and tokens received — no on-chain operations.
router.post("/admin/token-allocations/:id/confirm", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = z.object({
    txHash: z.string().min(10),
    wtaReceived: z.string(),
    walletAddress: z.string(),
  }).safeParse(req.body);
  if (!parsed.success || !id) { res.status(400).json({ message: "Invalid input" }); return; }

  const [row] = await db.select().from(userTokenPurchasesTable).where(eq(userTokenPurchasesTable.id, id)).limit(1);
  if (!row || !row.txHash.startsWith("virtual:")) {
    res.status(404).json({ message: "Pending allocation not found" }); return;
  }

  const { txHash, wtaReceived, walletAddress } = parsed.data;
  await db.update(userTokenPurchasesTable)
    .set({ txHash, wtaReceived, walletAddress })
    .where(eq(userTokenPurchasesTable.id, id));

  res.json({ id, txHash, wtaReceived, walletAddress });
});

// POST /api/admin/token-allocations/settle
// Admin triggers on-chain token minting for pending allocations.
// Body: { ids?: number[] } — if ids is provided, only those records are settled;
//   omit ids (or pass empty array) to settle ALL pending records.
// For each record the buyer's 5-level upline + admin master wallet are resolved
// and passed on-chain so the contract distributes referral cuts automatically.
router.post("/admin/token-allocations/settle", requireAdmin, async (req, res) => {
  const { buyAndTransferToUser, TOKEN_DECIMALS } = await import("../lib/tokenChain.js");
  const { ethers } = await import("ethers");

  const bodyParsed = z.object({ ids: z.array(z.number().int().positive()).optional() }).safeParse(req.body);
  const selectedIds: number[] | undefined = bodyParsed.success ? bodyParsed.data.ids : undefined;

  const [cfg] = await db.select().from(platformSettingsTable).limit(1);
  const contractAddress = cfg?.tokenContractAddress ?? "";
  const withdrawKey     = cfg?.withdrawWalletPrivateKey ?? "";
  const gasKey          = cfg?.gasWalletPrivateKey ?? "";
  const rpcUrl          = cfg?.bscRpcUrl ?? "";
  const adminMasterWallet = (cfg?.adminMasterWallet ?? "").trim();

  if (!contractAddress || !withdrawKey || !gasKey || !rpcUrl) {
    res.status(400).json({ message: "Token contract, withdraw wallet, gas wallet, and RPC URL must all be configured in Settings before settling." });
    return;
  }

  const ADDR_RE_LOCAL = /^0x[0-9a-fA-F]{40}$/;
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const SAFE_USER_LEVELS = 5;
  const TOTAL_LEVELS = 10;

  // Build the 10-slot referrers array for a given user (mirrors /token/upline-safe logic).
  async function buildReferrers(userId: number): Promise<string[]> {
    const addresses: string[] = [];
    const [buyer] = await db.select({ sponsorId: usersTable.sponsorId }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    let currentSponsorId: number | null = buyer?.sponsorId ?? null;
    const seen = new Set<number>([userId]);

    // Fallback for any empty/missing slot — admin master wallet receives those commissions
    const fallback = ADDR_RE_LOCAL.test(adminMasterWallet) ? adminMasterWallet : ZERO_ADDR;

    for (let level = 0; level < SAFE_USER_LEVELS; level++) {
      if (currentSponsorId == null || seen.has(currentSponsorId)) {
        addresses.push(fallback);
        currentSponsorId = null;
        continue;
      }
      seen.add(currentSponsorId);
      const [sponsor] = await db.select({ id: usersTable.id, walletAddress: usersTable.walletAddress, sponsorId: usersTable.sponsorId })
        .from(usersTable).where(eq(usersTable.id, currentSponsorId)).limit(1);
      if (!sponsor) { addresses.push(fallback); currentSponsorId = null; continue; }
      const w = (sponsor.walletAddress ?? "").trim();
      // If sponsor has no valid wallet, the commission goes to admin instead of burning
      addresses.push(ADDR_RE_LOCAL.test(w) ? w : fallback);
      currentSponsorId = sponsor.sponsorId ?? null;
    }

    // Slot 5: admin master wallet (the fixed admin cut)
    addresses.push(fallback);

    // Slots 6–9: unused by user levels — route to admin so nothing is burned
    while (addresses.length < TOTAL_LEVELS) addresses.push(fallback);
    return addresses;
  }

  const whereClause = selectedIds && selectedIds.length > 0
    ? and(like(userTokenPurchasesTable.txHash, "virtual:%"), inArray(userTokenPurchasesTable.id, selectedIds))
    : like(userTokenPurchasesTable.txHash, "virtual:%");

  const pending = await db.select().from(userTokenPurchasesTable)
    .where(whereClause!)
    .orderBy(desc(userTokenPurchasesTable.createdAt));

  if (pending.length === 0) {
    res.json({ settled: 0, failed: 0, results: [] });
    return;
  }

  const results: { id: number; userId: number; usdtSpent: number; status: "settled" | "failed"; transferTxHash?: string; wtaReceived?: string; error?: string }[] = [];

  for (const row of pending) {
    const [user] = await db.select({ walletAddress: usersTable.walletAddress })
      .from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
    const userWallet = (user?.walletAddress ?? "").trim();

    if (!ADDR_RE_LOCAL.test(userWallet)) {
      results.push({ id: row.id, userId: row.userId, usdtSpent: parseFloat(row.usdtSpent), status: "failed", error: "User has no valid wallet address" });
      continue;
    }

    const referrers = await buildReferrers(row.userId);

    const result = await buyAndTransferToUser({
      usdtAmount: parseFloat(row.usdtSpent),
      userWallet,
      contractAddress,
      withdrawWalletPrivateKey: withdrawKey,
      gasWalletPrivateKey: gasKey,
      rpcUrl,
      referrers,
    });

    if (result.success && result.transferTxHash && result.tokensBought) {
      const wtaStr = ethers.formatUnits(result.tokensBought, TOKEN_DECIMALS);
      await db.update(userTokenPurchasesTable)
        .set({ txHash: result.transferTxHash, wtaReceived: wtaStr, walletAddress: userWallet })
        .where(eq(userTokenPurchasesTable.id, row.id));
      results.push({ id: row.id, userId: row.userId, usdtSpent: parseFloat(row.usdtSpent), status: "settled", transferTxHash: result.transferTxHash, wtaReceived: wtaStr });
    } else {
      results.push({ id: row.id, userId: row.userId, usdtSpent: parseFloat(row.usdtSpent), status: "failed", error: result.error });
    }
  }

  res.json({
    settled: results.filter(r => r.status === "settled").length,
    failed: results.filter(r => r.status === "failed").length,
    results,
  });
});

// POST /api/admin/reset-for-live
router.post("/admin/reset-for-live", requireAdmin, async (req, res) => {
  const parsed = z.object({
    confirm: z.literal("RESET FOR LIVE"),
    newEmail: z.string().email("Valid email required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Validation failed" });
    return;
  }

  await db.delete(incomeTable);
  await db.delete(investmentsTable);
  await db.delete(withdrawalsTable);
  await db.delete(depositsTable);
  await db.execute(sql`DELETE FROM hc_deposit_requests`);
  await db.execute(sql`DELETE FROM p2p_transfers`);
  await db.execute(sql`DELETE FROM wallet_address_changes`);
  await db.execute(sql`DELETE FROM otp_codes`);
  await db.execute(sql`DELETE FROM notice_views`);
  await db.execute(sql`DELETE FROM support_messages`);
  await db.execute(sql`DELETE FROM support_tickets`);
  await db.delete(userRewardsTable);
  await db.delete(adminBalanceAdjustmentsTable);
  await db.delete(usersTable).where(eq(usersTable.isAdmin, false));

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(usersTable)
    .set({
      email: parsed.data.newEmail,
      passwordHash,
      totalEarnings: "0", walletBalance: "0", totalInvested: "0",
      hyperCoinBalance: "0", currentRankId: null, currentLevel: 0,
    })
    .where(eq(usersTable.isAdmin, true));

  res.json({ success: true, message: "All non-admin data cleared and admin credentials updated" });
});

export default router;
