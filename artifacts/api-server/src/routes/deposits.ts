import { Router } from "express";
import { db, usersTable, depositsTable, platformSettingsTable, depositWalletBackupsTable } from "@workspace/db";
import { eq, desc, isNotNull, isNull, count, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { ensureDepositWallet, sweepUsdtToMaster, getUsdtBalance, USDT_DECIMALS, getSettings, generateDepositWallet } from "../lib/blockchain";
import { ethers } from "ethers";
import { logger } from "../lib/logger";
import { sendDepositCreditedEmail } from "../lib/email";
import { alertLargeDeposit } from "../lib/alerts";
import { resolveKey, isEncrypted, encryptKey, ensureEncrypted } from "../lib/keyEncryption.js";

const router = Router();

function depositToResponse(d: typeof depositsTable.$inferSelect) {
  return {
    id: d.id,
    userId: d.userId,
    txHash: d.txHash,
    amount: parseFloat(d.amount),
    status: d.status,
    sweepTxHash: d.sweepTxHash,
    note: d.note,
    createdAt: d.createdAt.toISOString(),
    creditedAt: d.creditedAt?.toISOString() ?? null,
  };
}

// GET /api/deposits/address  — get or create user's deposit wallet address
router.get("/deposits/address", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { address } = await ensureDepositWallet(user.id);
  res.json({ address });
});

// POST /api/deposits/check  — check BSC for USDT, sweep if found, credit balance
router.post("/deposits/check", requireAuth, async (req, res) => {
  const user = (req as any).user;

  const settings = await getSettings();
  if (!settings) {
    res.status(500).json({ message: "Platform settings not configured" });
    return;
  }
  if (!settings.adminMasterWallet || !settings.gasWalletPrivateKey) {
    res.status(400).json({ message: "Admin wallet not configured. Contact support." });
    return;
  }

  // Ensure user has a deposit wallet
  const { address } = await ensureDepositWallet(user.id);
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!freshUser?.depositPrivateKey) {
    res.status(500).json({ message: "Deposit wallet not ready" });
    return;
  }

  // Resolve the deposit private key (decrypt if encrypted, or use plaintext legacy key)
  const depositPlaintextKey = resolveKey(freshUser.depositPrivateKey);
  if (!depositPlaintextKey) {
    res.status(500).json({ message: "Deposit wallet key could not be resolved" });
    return;
  }
  // Lazy-migrate: if key is still plaintext, encrypt and save it back
  if (!isEncrypted(freshUser.depositPrivateKey)) {
    db.update(usersTable)
      .set({ depositPrivateKey: encryptKey(depositPlaintextKey) })
      .where(eq(usersTable.id, user.id))
      .catch(() => {});
  }

  // Resolve gas wallet private key
  const gasPlaintextKey = resolveKey(settings.gasWalletPrivateKey);
  if (!gasPlaintextKey) {
    res.status(400).json({ message: "Gas wallet not configured. Contact support." });
    return;
  }

  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";

  // Check USDT balance
  let usdtBalance: bigint;
  try {
    usdtBalance = await getUsdtBalance(address, rpcUrl);
  } catch (err: any) {
    logger.error({ err }, "Failed to check USDT balance");
    res.status(500).json({ message: "Failed to connect to BSC. Try again." });
    return;
  }

  if (usdtBalance === 0n) {
    res.json({ status: "not_found", message: "No USDT detected at your deposit address yet." });
    return;
  }

  const amount = parseFloat(ethers.formatUnits(usdtBalance, USDT_DECIMALS));
  const minDeposit = parseFloat(settings.minDepositUsdt ?? "1");

  if (amount < minDeposit) {
    res.json({ status: "too_small", message: `Minimum deposit is $${minDeposit} USDT. Found: $${amount.toFixed(2)}` });
    return;
  }

  // Create pending deposit record
  const [deposit] = await db.insert(depositsTable).values({
    userId: user.id,
    amount: amount.toString(),
    status: "sweeping",
    note: `Check initiated by user`,
  }).returning();

  // Sweep USDT to master wallet
  try {
    const result = await sweepUsdtToMaster(
      depositPlaintextKey,
      gasPlaintextKey,
      settings.adminMasterWallet,
      rpcUrl,
    );

    if (!result.success) {
      await db.update(depositsTable).set({ status: "failed", note: result.error }).where(eq(depositsTable.id, deposit.id));
      res.status(400).json({ status: "failed", message: result.error ?? "Sweep failed" });
      return;
    }

    // Credit user's wallet balance
    const newBalance = parseFloat(freshUser.walletBalance ?? "0") + result.amount;
    await db.update(usersTable).set({ walletBalance: newBalance.toString() }).where(eq(usersTable.id, user.id));

    // Update deposit record
    await db.update(depositsTable).set({
      status: "credited",
      txHash: null,
      sweepTxHash: result.txHash,
      creditedAt: new Date(),
      amount: result.amount.toString(),
    }).where(eq(depositsTable.id, deposit.id));

    // Send deposit credited email (fire-and-forget)
    sendDepositCreditedEmail(freshUser.email, freshUser.name ?? "", result.amount).catch(() => {});

    // Alert admin for large deposits (fire-and-forget)
    alertLargeDeposit(user.id, freshUser.name ?? "", freshUser.email, result.amount).catch(() => {});

    res.json({
      status: "credited",
      amount: result.amount,
      sweepTxHash: result.txHash,
      newBalance,
      message: `$${result.amount.toFixed(2)} USDT credited to your wallet!`,
    });
  } catch (err: any) {
    logger.error({ err }, "Sweep failed");
    await db.update(depositsTable).set({ status: "failed", note: err?.message }).where(eq(depositsTable.id, deposit.id));
    res.status(500).json({ status: "failed", message: "Sweep failed: " + (err?.message ?? "Unknown error") });
  }
});

// GET /api/deposits  — user's deposit history
router.get("/deposits", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const deposits = await db.select().from(depositsTable)
    .where(eq(depositsTable.userId, user.id))
    .orderBy(desc(depositsTable.createdAt));
  res.json(deposits.map(depositToResponse));
});

// GET /api/admin/deposits  — all deposits
router.get("/admin/deposits", requireAdmin, async (req, res) => {
  const deposits = await db.select().from(depositsTable).orderBy(desc(depositsTable.createdAt));
  res.json(deposits.map(depositToResponse));
});

// GET /api/admin/wallet-settings
router.get("/admin/wallet-settings", requireAdmin, async (req, res) => {
  let [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) [settings] = await db.insert(platformSettingsTable).values({}).returning();
  res.json({
    adminMasterWallet: settings.adminMasterWallet,
    // Never return the raw private key — return a boolean so the UI can show "key configured" status
    gasWalletKeySet: !!(settings.gasWalletPrivateKey),
    bscRpcUrl: settings.bscRpcUrl,
    minDepositUsdt: parseFloat(settings.minDepositUsdt ?? "1"),
    tokenContractAddress: settings.tokenContractAddress ?? "",
  });
});

// GET /api/admin/wallet-stats  — backup count + users with addresses
router.get("/admin/wallet-stats", requireAdmin, async (req, res) => {
  const [{ value: totalWithAddress }] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(isNotNull(usersTable.depositAddress));

  const [{ value: backupCount }] = await db
    .select({ value: count() })
    .from(depositWalletBackupsTable);

  res.json({ totalWithAddress, backupCount });
});

// POST /api/admin/wallet-settings/generate-missing  — generate deposit wallets for users who have none
router.post("/admin/wallet-settings/generate-missing", requireAdmin, async (req, res) => {
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(isNull(usersTable.depositAddress));

  let generated = 0;
  for (const user of users) {
    const { address, privateKey } = generateDepositWallet();
    await db.update(usersTable)
      .set({ depositAddress: address, depositPrivateKey: encryptKey(privateKey) })
      .where(eq(usersTable.id, user.id));
    generated++;
  }

  logger.info({ generated }, "Admin generated missing deposit wallets");
  res.json({ generated, message: `${generated} missing deposit wallets created.` });
});

// POST /api/admin/wallet-settings/regenerate-all  — regenerate all user deposit wallets
router.post("/admin/wallet-settings/regenerate-all", requireAdmin, async (req, res) => {
  const users = await db
    .select({ id: usersTable.id, depositAddress: usersTable.depositAddress, depositPrivateKey: usersTable.depositPrivateKey })
    .from(usersTable)
    .where(isNotNull(usersTable.depositAddress));

  let regenerated = 0;
  let backed_up = 0;

  for (const user of users) {
    if (!user.depositAddress || !user.depositPrivateKey) continue;

    // 1. Back up the old wallet — always store the backup encrypted at rest
    await db.insert(depositWalletBackupsTable).values({
      userId: user.id,
      oldAddress: user.depositAddress,
      oldPrivateKey: ensureEncrypted(user.depositPrivateKey),
      replacedReason: "admin_regenerate",
    });
    backed_up++;

    // 2. Generate a fresh independent wallet (not HD derived) and encrypt immediately
    const { address, privateKey } = generateDepositWallet();
    const encryptedKey = encryptKey(privateKey);

    // 3. Assign new wallet with encrypted key
    await db.update(usersTable)
      .set({ depositAddress: address, depositPrivateKey: encryptedKey })
      .where(eq(usersTable.id, user.id));
    regenerated++;
  }

  logger.info({ regenerated, backed_up }, "Admin regenerated all deposit wallets");
  res.json({ regenerated, backed_up, message: `${regenerated} wallets regenerated. ${backed_up} old keys backed up.` });
});

// GET /api/admin/wallet-backups  — list all backed up old wallets
router.get("/admin/wallet-backups", requireAdmin, async (req, res) => {
  const backups = await db
    .select()
    .from(depositWalletBackupsTable)
    .orderBy(desc(depositWalletBackupsTable.replacedAt));

  const userIds = Array.from(new Set(backups.map(b => b.userId)));
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map(u => [u.id, u.name]));

  res.json(backups.map(b => ({
    id: b.id,
    userId: b.userId,
    userName: uMap.get(b.userId) ?? `User #${b.userId}`,
    oldAddress: b.oldAddress,
    // Decrypt for the admin — they need the plaintext key to manually sweep stranded funds
    oldPrivateKey: resolveKey(b.oldPrivateKey) ?? "",
    replacedAt: b.replacedAt.toISOString(),
    replacedReason: b.replacedReason,
  })));
});

// PUT /api/admin/wallet-settings
router.put("/admin/wallet-settings", requireAdmin, async (req, res) => {
  const { adminMasterWallet, gasWalletPrivateKey, bscRpcUrl, minDepositUsdt, tokenContractAddress } = req.body;
  const [existing] = await db.select().from(platformSettingsTable).limit(1);
  let updated;
  const vals: any = {};
  if (adminMasterWallet !== undefined) vals.adminMasterWallet = adminMasterWallet;
  // Only update gas wallet key if a new non-empty value is provided; encrypt it before storing
  if (gasWalletPrivateKey && gasWalletPrivateKey.trim()) {
    vals.gasWalletPrivateKey = ensureEncrypted(gasWalletPrivateKey.trim());
  }
  if (bscRpcUrl !== undefined) vals.bscRpcUrl = bscRpcUrl;
  if (minDepositUsdt !== undefined) vals.minDepositUsdt = String(minDepositUsdt);
  if (tokenContractAddress !== undefined) vals.tokenContractAddress = String(tokenContractAddress).trim();

  if (existing) {
    [updated] = await db.update(platformSettingsTable).set(vals).where(eq(platformSettingsTable.id, existing.id)).returning();
  } else {
    [updated] = await db.insert(platformSettingsTable).values(vals).returning();
  }
  res.json({
    adminMasterWallet: updated.adminMasterWallet,
    gasWalletKeySet: !!(updated.gasWalletPrivateKey),
    bscRpcUrl: updated.bscRpcUrl,
    minDepositUsdt: parseFloat(updated.minDepositUsdt),
    tokenContractAddress: updated.tokenContractAddress ?? "",
  });
});

export default router;
