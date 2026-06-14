import { Router } from "express";
import { db, usersTable, otpCodesTable, walletAddressChangesTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import { signToken, requireAuth } from "../middlewares/auth";
import { RegisterBody, LoginBody, SetupProfileBody } from "@workspace/api-zod";
import { sendOtpEmail, sendWelcomeEmail, isOtpRegistrationEnabled } from "../lib/email";
import { trackOtpFailure } from "../lib/alerts";
import { generateDepositWallet } from "../lib/blockchain";
import { encryptKey } from "../lib/keyEncryption.js";

// In-memory nonce store: address (lowercase) → { nonce, expiresAt }
const walletNonces = new Map<string, { nonce: string; expiresAt: number }>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const router = Router();

const BCRYPT_ROUNDS = 12;

// Legacy SHA-256 hash — kept only for migration verification on login
function legacyHash(password: string): string {
  return createHash("sha256").update(password + "uranaz-salt").digest("hex");
}

// New bcrypt hash — used for all new registrations
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Verify a password against either bcrypt or legacy SHA-256 hash.
// Returns true if the password matches, false otherwise.
// Also returns whether the stored hash is legacy so the caller can migrate it.
async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; isLegacy: boolean }> {
  const isLegacy = !storedHash.startsWith("$2");
  if (isLegacy) {
    return { valid: storedHash === legacyHash(password), isLegacy: true };
  }
  return { valid: await bcrypt.compare(password, storedHash), isLegacy: false };
}

async function generateUniqueReferralCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  while (true) {
    let code = "URN";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
    if (!existing) return code;
  }
}

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
    profileComplete: user.profileComplete,
    totalEarnings: parseFloat(user.totalEarnings),
    totalInvested: parseFloat(user.totalInvested),
    walletBalance: parseFloat(user.walletBalance ?? "0"),
    withdrawBalance: parseFloat(user.withdrawBalance ?? "0"),
    hyperCoinBalance: parseFloat(user.hyperCoinBalance ?? "0"),
    roiTokenBalance: user.roiTokenBalance ?? "0",
    tradingProfitBalance: user.tradingProfitBalance ?? "0",
    teamBenefitBalance: user.teamBenefitBalance ?? "0",
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /api/auth/otp-required
router.get("/auth/otp-required", async (_req, res) => {
  const { isOtpWithdrawalEnabled, isOtpWalletUpdateEnabled } = await import("../lib/email");
  const registrationOtp = await isOtpRegistrationEnabled();
  const withdrawalOtp = await isOtpWithdrawalEnabled();
  const walletUpdateOtp = await isOtpWalletUpdateEnabled();
  res.json({ registrationOtp, withdrawalOtp, walletUpdateOtp });
});

// GET /api/auth/registration-info
// Public endpoint used by the Register page to know whether this signup is the
// first one on the platform (which auto-promotes the user to admin and skips
// the referral requirement) or a regular signup (where a referral code is
// mandatory).
router.get("/auth/registration-info", async (_req, res) => {
  const [{ value }] = await db.select({ value: count() }).from(usersTable);
  const userCount = Number(value ?? 0);
  res.json({
    userCount,
    isFirstUser: userCount === 0,
    requiresReferral: userCount > 0,
  });
});

// POST /api/auth/send-otp
router.post("/auth/send-otp", async (req, res) => {
  const { email, purpose } = req.body;
  if (!email || !["registration", "withdrawal", "wallet_update", "password_reset"].includes(purpose)) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }

  // For registration OTPs: block immediately if email is already taken.
  // This avoids sending a useless email and leaks no additional information
  // beyond what the registration endpoint itself already returns.
  if (purpose === "registration") {
    const [existing] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (existing) {
      res.status(409).json({ message: "This email is already registered. Please sign in instead." });
      return;
    }
  }

  // For password reset OTPs: only send if email exists.
  // If the email is not registered we silently return success to prevent
  // leaking whether an account exists (email enumeration protection).
  if (purpose === "password_reset") {
    const [user] = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (!user) {
      res.json({ message: "OTP sent" });
      return;
    }
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.update(otpCodesTable)
    .set({ used: true })
    .where(and(eq(otpCodesTable.email, email), eq(otpCodesTable.purpose, purpose)));

  await db.insert(otpCodesTable).values({ email, code, purpose, expiresAt });

  try {
    await sendOtpEmail(email, code, purpose);
    res.json({ message: "OTP sent" });
  } catch (err: any) {
    req.log?.error?.(err);
    res.status(500).json({ message: "Failed to send OTP email. Check SMTP settings." });
  }
});

// POST /api/auth/register
router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
    return;
  }
  const { name, email, phone, password, referralCode, country } = parsed.data;

  // Defensive: api-zod only enforces `country` as a string. Make sure it is
  // non-empty after trim so a tampered client cannot register without a country.
  if (!country || !country.trim()) {
    res.status(400).json({ message: "Country is required." });
    return;
  }

  const otpRequired = await isOtpRegistrationEnabled();
  if (otpRequired) {
    const otp = req.body.otp as string | undefined;
    if (!otp) {
      res.status(400).json({ message: "OTP required for registration" });
      return;
    }
    const now = new Date();
    const [otpRecord] = await db.select().from(otpCodesTable)
      .where(and(
        eq(otpCodesTable.email, email),
        eq(otpCodesTable.purpose, "registration"),
        eq(otpCodesTable.used, false),
      ))
      .orderBy(desc(otpCodesTable.createdAt))
      .limit(1);
    if (!otpRecord || otpRecord.code !== otp || otpRecord.expiresAt < now) {
      res.status(400).json({ message: "Invalid or expired OTP" });
      return;
    }
    await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otpRecord.id));
  }

  // Generate the referral code and deposit wallet OUTSIDE the transaction.
  // Doing it here keeps the locked critical section short and avoids holding
  // the advisory lock while doing extra work.
  const referralCodeGenerated = await generateUniqueReferralCode();

  // Pre-generate a unique deposit wallet so it's ready immediately after registration.
  // encryptKey uses PRIVATE_KEY_SECRET so the raw private key never touches the DB in plaintext.
  let newDepositAddress: string | null = null;
  let newDepositPrivateKey: string | null = null;
  try {
    const { address, privateKey } = generateDepositWallet();
    newDepositAddress = address;
    newDepositPrivateKey = encryptKey(privateKey);
  } catch (err) {
    req.log?.warn?.({ err }, "Could not pre-generate deposit wallet at registration — will be created lazily on first deposit page visit");
  }

  // Atomic registration:
  // - Acquire a transaction-scoped Postgres advisory lock keyed to a fixed
  //   value so only one /auth/register can execute the count+insert critical
  //   section at a time. This eliminates the TOCTOU race where two concurrent
  //   requests could both observe userCount === 0 and both be promoted to
  //   admin.
  // - Inside the lock we re-check email uniqueness, re-count users (to
  //   determine first-user status), validate the referral code, and insert
  //   the new user — all in one transaction.
  const REGISTRATION_LOCK_KEY = 77888899; // arbitrary, app-wide constant
  let result: { user: typeof usersTable.$inferSelect; isFirstUser: boolean } | null = null;
  let conflictMessage: { status: number; message: string } | null = null;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`);

      const [existing] = await tx.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (existing) {
        conflictMessage = { status: 409, message: "Email already registered" };
        return;
      }

      const [{ value: existingCountValue }] = await tx.select({ value: count() }).from(usersTable);
      const existingUserCount = Number(existingCountValue ?? 0);
      const isFirstUser = existingUserCount === 0;

      let sponsorId: number | undefined;
      if (!isFirstUser) {
        const trimmed = (referralCode ?? "").trim();
        if (!trimmed) {
          conflictMessage = { status: 400, message: "Referral code is required to register." };
          return;
        }
        const [sponsor] = await tx.select().from(usersTable).where(eq(usersTable.referralCode, trimmed)).limit(1);
        if (!sponsor) {
          conflictMessage = { status: 400, message: "Invalid referral code. Please check with your sponsor." };
          return;
        }
        sponsorId = sponsor.id;
      }

      // Optional wallet address submitted during registration
      const regWallet = ((req.body.walletAddress as string | undefined) ?? "").trim();
      const regWalletAddress = regWallet && BEP20_REGEX.test(regWallet) ? regWallet : null;

      const [user] = await tx.insert(usersTable).values({
        name,
        email,
        phone,
        country: country?.trim() || null,
        passwordHash: await hashPassword(password),
        referralCode: referralCodeGenerated,
        sponsorId: sponsorId ?? null,
        isAdmin: isFirstUser,
        isActive: false,
        ...(regWalletAddress ? { walletAddress: regWalletAddress } : {}),
        ...(newDepositAddress && newDepositPrivateKey
          ? { depositAddress: newDepositAddress, depositPrivateKey: newDepositPrivateKey }
          : {}),
      }).returning();

      result = { user, isFirstUser };
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Registration transaction failed");
    res.status(500).json({ message: "Registration failed. Please try again." });
    return;
  }

  if (conflictMessage) {
    res.status(conflictMessage.status).json({ message: conflictMessage.message });
    return;
  }
  if (!result) {
    res.status(500).json({ message: "Registration failed. Please try again." });
    return;
  }

  // Send welcome email (fire-and-forget)
  sendWelcomeEmail(result.user.email, result.user.name ?? "").catch(() => {});

  const token = signToken(result.user.id);
  res.status(201).json({ user: userToResponse(result.user), token });
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  const { valid, isLegacy } = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ message: "Your account has been blocked. Please contact support." });
    return;
  }

  // Silently migrate legacy SHA-256 hash to bcrypt on successful login
  if (isLegacy) {
    const newHash = await hashPassword(password);
    db.update(usersTable)
      .set({ passwordHash: newHash })
      .where(eq(usersTable.id, user.id))
      .catch(() => {}); // fire-and-forget; login still succeeds even if this fails
  }

  const token = signToken(user.id);
  res.json({ user: userToResponse(user), token });
});

// POST /api/auth/reset-password
router.post("/auth/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ message: "Email, OTP, and a new password (min 6 characters) are required." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(400).json({ message: "Invalid or expired OTP." });
    return;
  }

  const now = new Date();
  const [otpRecord] = await db.select().from(otpCodesTable)
    .where(and(
      eq(otpCodesTable.email, email),
      eq(otpCodesTable.purpose, "password_reset"),
      eq(otpCodesTable.used, false),
    ))
    .orderBy(desc(otpCodesTable.createdAt))
    .limit(1);

  if (!otpRecord || otpRecord.code !== otp || otpRecord.expiresAt < now) {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
            || req.socket?.remoteAddress
            || "unknown";
    trackOtpFailure(email, ip);
    res.status(400).json({ message: "Invalid or expired OTP." });
    return;
  }

  await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otpRecord.id));
  const newHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));

  res.json({ message: "Password reset successfully. You can now sign in." });
});

// GET /api/auth/wallet-check?address=0x...
// Public check — returns { exists: true/false } so the UI can warn before signing
router.get("/auth/wallet-check", async (req, res) => {
  const raw = (req.query.address as string | undefined) ?? "";
  const address = raw.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ message: "Invalid wallet address" });
    return;
  }
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.walletAddress, address))
    .limit(1);
  res.json({ exists: !!user });
});

// GET /api/auth/wallet-nonce?address=0x...
// Returns a one-time nonce the client must sign with personal_sign.
router.get("/auth/wallet-nonce", (req, res) => {
  const raw = (req.query.address as string | undefined) ?? "";
  const address = raw.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    res.status(400).json({ message: "Invalid wallet address" });
    return;
  }
  const nonce = randomBytes(16).toString("hex");
  walletNonces.set(address, { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
  const message = `Sign in to WaytoAlgo\nNonce: ${nonce}`;
  res.json({ nonce, message });
});

// POST /api/auth/wallet-login
// Body: { address, signature }
router.post("/auth/wallet-login", async (req, res) => {
  const raw = (req.body.address as string | undefined) ?? "";
  const signature = (req.body.signature as string | undefined) ?? "";
  const address = raw.trim().toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address) || !signature) {
    res.status(400).json({ message: "address and signature are required" });
    return;
  }

  const stored = walletNonces.get(address);
  if (!stored || Date.now() > stored.expiresAt) {
    walletNonces.delete(address);
    res.status(400).json({ message: "Nonce expired or not found. Please try again." });
    return;
  }

  // Verify signature
  const message = `Sign in to WaytoAlgo\nNonce: ${stored.nonce}`;
  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    res.status(400).json({ message: "Invalid signature" });
    return;
  }

  walletNonces.delete(address); // consume nonce

  if (recovered !== address) {
    res.status(401).json({ message: "Signature does not match the wallet address" });
    return;
  }

  // Find user by wallet_address
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.walletAddress, raw.trim()))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "No account linked to this wallet. Please register first." });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ message: "Your account has been blocked. Please contact support." });
    return;
  }

  const token = signToken(user.id);
  res.json({ user: userToResponse(user), token });
});

// POST /api/auth/logout
router.post("/auth/logout", async (_req, res) => {
  res.json({ message: "Logged out" });
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  res.json(userToResponse(user));
});

// POST /api/auth/profile-setup
const BEP20_REGEX = /^0x[a-fA-F0-9]{40}$/;
router.post("/auth/profile-setup", requireAuth, async (req, res) => {
  const parsed = SetupProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
    return;
  }
  const user = (req as any).user;

  const newWallet = (parsed.data.walletAddress ?? "").trim();
  // Allow empty wallet on initial setup (user chose to skip).
  // Only validate format when a non-empty value is provided.
  if (newWallet && !BEP20_REGEX.test(newWallet)) {
    res.status(400).json({
      message: "Invalid wallet address. Must be a valid BEP20 address (0x followed by 40 hex characters).",
    });
    return;
  }

  // OTP gate: only when changing an EXISTING wallet address (not initial setup),
  // and only if admin has enabled OTP for wallet updates AND SMTP is configured.
  const oldWallet = (user.walletAddress ?? "").trim();
  const walletChanged = !!oldWallet && oldWallet !== newWallet;
  // Tracks whether an OTP was actually presented AND validated for THIS request.
  // Used by the audit log so admins can distinguish gated vs ungated changes.
  let otpVerifiedThisRequest = false;

  if (walletChanged) {
    const { isOtpWalletUpdateEnabled } = await import("../lib/email");
    const otpRequired = await isOtpWalletUpdateEnabled();
    if (otpRequired) {
      const otp = req.body.otp as string | undefined;
      if (!otp) {
        res.status(400).json({ message: "OTP required to change your withdrawal wallet address", otpRequired: true });
        return;
      }
      const now = new Date();
      const [otpRecord] = await db.select().from(otpCodesTable)
        .where(and(
          eq(otpCodesTable.email, user.email),
          eq(otpCodesTable.purpose, "wallet_update"),
          eq(otpCodesTable.used, false),
        ))
        .orderBy(desc(otpCodesTable.createdAt))
        .limit(1);
      if (!otpRecord || otpRecord.code !== otp || otpRecord.expiresAt < now) {
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
                || req.socket?.remoteAddress
                || "unknown";
        trackOtpFailure(user.email, ip);
        res.status(400).json({ message: "Invalid or expired OTP" });
        return;
      }
      await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otpRecord.id));
      otpVerifiedThisRequest = true;
    }
  }

  const [updated] = await db.update(usersTable)
    .set({
      walletAddress: newWallet,
      country: parsed.data.country,
      idNumber: parsed.data.idNumber,
      profileImage: parsed.data.profileImage,
      profileComplete: true,
    })
    .where(eq(usersTable.id, user.id))
    .returning();

  // Audit log: record any change to the withdrawal wallet (initial setup or update).
  if (oldWallet !== newWallet) {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
              || req.socket?.remoteAddress
              || null;
      const ua = (req.headers["user-agent"] as string) || null;
      await db.insert(walletAddressChangesTable).values({
        userId: user.id,
        oldAddress: oldWallet || null,
        newAddress: newWallet,
        otpVerified: otpVerifiedThisRequest,
        ipAddress: ip,
        userAgent: ua,
      });
    } catch (err: any) {
      req.log?.error?.({ err }, "Failed to record wallet address change");
    }
  }

  res.json(userToResponse(updated));
});

export default router;
