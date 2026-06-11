import nodemailer from "nodemailer";
import { db, platformSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function getSettings() {
  const [s] = await db.select().from(platformSettingsTable).limit(1);
  return s ?? null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function createTransport(s: NonNullable<Awaited<ReturnType<typeof getSettings>>>) {
  const isLocal = s.smtpHost === "localhost" || s.smtpHost === "127.0.0.1";
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    secure: s.smtpPort === 465,
    auth: isLocal ? undefined : { user: s.smtpUser, pass: s.smtpPassword },
    // Only disable TLS verification for local/dev SMTP servers
    tls: { rejectUnauthorized: !isLocal },
  });
}

function makeMessageId(domain: string) {
  return `<${Date.now()}.${crypto.randomBytes(8).toString("hex")}@${domain}>`;
}

function fromDomain(s: NonNullable<Awaited<ReturnType<typeof getSettings>>>) {
  return (s.smtpFrom ?? "noreply@waytoalgo.com").split("@")[1] ?? "waytoalgo.com";
}

function baseHeaders(domain: string) {
  return {
    "Precedence": "transactional",
    "X-Auto-Response-Suppress": "OOF, AutoReply",
  };
}

function header(s: NonNullable<Awaited<ReturnType<typeof getSettings>>>) {
  return `
    <tr>
      <td style="background:linear-gradient(90deg,#0a2a3a,#0d3d52);padding:24px 32px;border-bottom:2px solid #1a4a5e;">
        <h1 style="margin:0;color:#3DD6F5;font-size:20px;letter-spacing:2px;font-weight:900;">WaytoAlgo</h1>
        <p style="margin:4px 0 0;color:rgba(168,237,255,0.5);font-size:12px;letter-spacing:1px;">Secure Investment Platform</p>
      </td>
    </tr>`;
}

function footer() {
  return `
    <tr>
      <td style="padding:16px 32px 24px;border-top:1px solid rgba(61,214,245,0.1);">
        <p style="color:rgba(168,237,255,0.3);font-size:11px;margin:0;text-align:center;">© ${new Date().getFullYear()} WaytoAlgo. All rights reserved.<br>If you did not request this email, please ignore it.</p>
      </td>
    </tr>`;
}

function wrap(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#010810;border-radius:12px;overflow:hidden;max-width:520px;width:100%;">
        ${body}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── OTP ──────────────────────────────────────────────────────────────────────
export async function sendOtpEmail(to: string, code: string, purpose: "registration" | "withdrawal" | "wallet_update" | "password_reset") {
  const s = await getSettings();
  if (!s?.smtpEnabled) return;

  const label = purpose === "registration"  ? "Registration"
              : purpose === "withdrawal"    ? "Withdrawal"
              : purpose === "wallet_update" ? "Wallet Address Update"
              : "Password Reset";

  const domain = fromDomain(s);
  const transport = createTransport(s);

  await transport.sendMail({
    from: `"${s.smtpFromName || "WaytoAlgo"}" <${s.smtpFrom}>`,
    to,
    subject: `WaytoAlgo — Your ${label} Verification Code`,
    messageId: makeMessageId(domain),
    headers: baseHeaders(domain),
    text: `WaytoAlgo — ${label} Verification\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\n© WaytoAlgo`,
    html: wrap(`
      ${header(s)}
      <tr><td style="padding:32px;">
        <p style="color:rgba(168,237,255,0.8);font-size:15px;margin:0 0 8px;">Hello,</p>
        <p style="color:rgba(168,237,255,0.6);font-size:14px;margin:0 0 24px;">Your <strong style="color:#3DD6F5;">${label}</strong> verification code is:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="background:rgba(61,214,245,0.08);border:1px solid rgba(61,214,245,0.3);border-radius:10px;padding:24px;">
            <span style="font-size:40px;font-weight:900;color:#3DD6F5;letter-spacing:0.25em;">${code}</span>
          </td></tr>
        </table>
        <p style="color:rgba(168,237,255,0.45);font-size:12px;margin:20px 0 0;text-align:center;">This code expires in <strong>10 minutes</strong>. Never share it with anyone.</p>
      </td></tr>
      ${footer()}
    `),
  });
}

// ── Welcome ───────────────────────────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, name: string) {
  const s = await getSettings();
  if (!s?.smtpEnabled) return;

  const domain = fromDomain(s);
  const transport = createTransport(s);

  const safeName = escapeHtml(name);
  await transport.sendMail({
    from: `"${s.smtpFromName || "WaytoAlgo"}" <${s.smtpFrom}>`,
    to,
    subject: "Welcome to WaytoAlgo!",
    messageId: makeMessageId(domain),
    headers: baseHeaders(domain),
    text: `Welcome to WaytoAlgo!\n\nHi ${name},\n\nYour account has been created successfully. You can now log in, make a deposit, and start growing your investment.\n\nHave questions? Contact our support team.\n\n© WaytoAlgo`,
    html: wrap(`
      ${header(s)}
      <tr><td style="padding:32px;">
        <p style="color:rgba(168,237,255,0.8);font-size:15px;margin:0 0 8px;">Hi ${safeName},</p>
        <p style="color:rgba(168,237,255,0.6);font-size:14px;margin:0 0 24px;">Welcome to <strong style="color:#3DD6F5;">WaytoAlgo</strong>! Your account has been created successfully.</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background:rgba(61,214,245,0.08);border:1px solid rgba(61,214,245,0.3);border-radius:10px;padding:24px;">
            <p style="color:rgba(168,237,255,0.7);font-size:13px;margin:0 0 12px;">Here is what you can do next:</p>
            <p style="color:rgba(168,237,255,0.6);font-size:13px;margin:0 0 8px;">💰 &nbsp;Deposit USDT to your personal wallet address</p>
            <p style="color:rgba(168,237,255,0.6);font-size:13px;margin:0 0 8px;">📈 &nbsp;Choose an investment plan and start earning daily returns</p>
            <p style="color:rgba(168,237,255,0.6);font-size:13px;margin:0;">👥 &nbsp;Refer friends using your unique referral link</p>
          </td></tr>
        </table>
        <p style="color:rgba(168,237,255,0.45);font-size:12px;margin:20px 0 0;text-align:center;">Log in to your dashboard to get started.</p>
      </td></tr>
      ${footer()}
    `),
  });
}

// ── Deposit credited (blockchain → wallet) ────────────────────────────────────
export async function sendDepositCreditedEmail(to: string, name: string, amount: number) {
  const s = await getSettings();
  if (!s?.smtpEnabled || !s?.depositConfirmationEnabled) return;

  const domain = fromDomain(s);
  const transport = createTransport(s);
  const safeName = escapeHtml(name);

  await transport.sendMail({
    from: `"${s.smtpFromName || "WaytoAlgo"}" <${s.smtpFrom}>`,
    to,
    subject: "WaytoAlgo — Deposit Credited to Your Wallet",
    messageId: makeMessageId(domain),
    headers: baseHeaders(domain),
    text: `WaytoAlgo — Deposit Credited\n\nHi ${name},\n\nYour deposit of $${amount.toFixed(2)} USDT has been confirmed and credited to your wallet balance. You can now invest it into a plan.\n\n© WaytoAlgo`,
    html: wrap(`
      ${header(s)}
      <tr><td style="padding:32px;">
        <p style="color:rgba(168,237,255,0.8);font-size:15px;margin:0 0 8px;">Hi ${safeName},</p>
        <p style="color:rgba(168,237,255,0.6);font-size:14px;margin:0 0 24px;">Your deposit has been confirmed and credited to your wallet!</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="background:rgba(61,214,245,0.08);border:1px solid rgba(61,214,245,0.3);border-radius:10px;padding:24px;">
            <div style="font-size:13px;color:rgba(168,237,255,0.5);margin-bottom:6px;">Amount Credited</div>
            <div style="font-size:36px;font-weight:900;color:#3DD6F5;">+$${amount.toFixed(2)}</div>
            <div style="font-size:12px;color:rgba(168,237,255,0.4);margin-top:4px;">USDT</div>
          </td></tr>
        </table>
        <p style="color:rgba(168,237,255,0.45);font-size:12px;margin:20px 0 0;text-align:center;">Your balance is now available. Log in to invest in a plan and start earning.</p>
      </td></tr>
      ${footer()}
    `),
  });
}

// ── Investment / Plan deposit confirmed ───────────────────────────────────────
export async function sendDepositConfirmationEmail(to: string, name: string, amount: number, plan: string) {
  const s = await getSettings();
  if (!s?.smtpEnabled || !s?.depositConfirmationEnabled) return;

  const domain = fromDomain(s);
  const transport = createTransport(s);
  const safeName = escapeHtml(name);
  const safePlan = escapeHtml(plan);

  await transport.sendMail({
    from: `"${s.smtpFromName || "WaytoAlgo"}" <${s.smtpFrom}>`,
    to,
    subject: "WaytoAlgo — Investment Activated",
    messageId: makeMessageId(domain),
    headers: baseHeaders(domain),
    text: `WaytoAlgo — Investment Activated\n\nHi ${name},\n\nYour investment has been activated!\n\nAmount: +$${amount.toFixed(2)}\nPlan: ${plan}\n\nYour investment is now earning daily returns.\n\n© WaytoAlgo`,
    html: wrap(`
      ${header(s)}
      <tr><td style="padding:32px;">
        <p style="color:rgba(168,237,255,0.8);font-size:15px;margin:0 0 8px;">Hi ${safeName},</p>
        <p style="color:rgba(168,237,255,0.6);font-size:14px;margin:0 0 24px;">Your investment is now active and earning daily returns!</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background:rgba(61,214,245,0.08);border:1px solid rgba(61,214,245,0.3);border-radius:10px;padding:24px;">
            <div style="font-size:32px;font-weight:900;color:#3DD6F5;">+$${amount.toFixed(2)}</div>
            <div style="color:rgba(168,237,255,0.5);font-size:13px;margin-top:6px;">${safePlan}</div>
          </td></tr>
        </table>
        <p style="color:rgba(168,237,255,0.45);font-size:12px;margin:20px 0 0;text-align:center;">Visit your dashboard to track your daily earnings.</p>
      </td></tr>
      ${footer()}
    `),
  });
}

// ── Admin security alert ──────────────────────────────────────────────────────
export async function sendAdminAlertEmail(
  subject: string,
  body: string,
  details: Array<[string, string]> = [],
): Promise<void> {
  const s = await getSettings();
  if (!s?.smtpEnabled) return;

  const [admin] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true))
    .limit(1);
  if (!admin) return;

  const domain = fromDomain(s);
  const transport = createTransport(s);

  const rows = details
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:6px 12px;color:rgba(168,237,255,0.5);font-size:12px;width:140px;vertical-align:top;">${escapeHtml(k)}</td>
          <td style="padding:6px 12px;color:#C8E8F5;font-size:12px;font-weight:600;">${escapeHtml(v)}</td>
        </tr>`,
    )
    .join("");

  const tableSection = rows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="border:1px solid rgba(61,214,245,0.2);border-radius:8px;margin-top:18px;overflow:hidden;">
         ${rows}
       </table>`
    : "";

  await transport.sendMail({
    from: `"${s.smtpFromName || "WaytoAlgo"}" <${s.smtpFrom}>`,
    to: admin.email,
    subject: `[WaytoAlgo ALERT] ${subject}`,
    messageId: makeMessageId(domain),
    headers: baseHeaders(domain),
    text: `WaytoAlgo Security Alert\n\n${subject}\n\n${details.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n© WaytoAlgo`,
    html: wrap(`
      ${header(s)}
      <tr><td style="padding:28px 32px;">
        <div style="display:inline-block;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);
          border-radius:6px;padding:4px 12px;margin-bottom:16px;">
          <span style="color:#F87171;font-size:11px;font-weight:700;letter-spacing:1px;">SECURITY ALERT</span>
        </div>
        <h2 style="margin:0 0 12px;color:#FFFFFF;font-size:16px;">${escapeHtml(subject)}</h2>
        <p style="color:rgba(168,237,255,0.65);font-size:13px;margin:0 0 4px;">${body}</p>
        ${tableSection}
        <p style="color:rgba(168,237,255,0.35);font-size:11px;margin:20px 0 0;">
          This is an automated alert from the WaytoAlgo platform monitoring system.
          Log in to the admin panel to review and take action if required.
        </p>
      </td></tr>
      ${footer()}
    `),
  });
}

// ── HyperCoin deposit approved ────────────────────────────────────────────────
export async function sendHcDepositApprovedEmail(
  to: string,
  name: string,
  hcAmount: number,
  usdValue: number,
  hcPrice: number,
) {
  const s = await getSettings();
  if (!s?.smtpEnabled) return;

  const domain = fromDomain(s);
  const transport = createTransport(s);
  const safeName = escapeHtml(name);

  await transport.sendMail({
    from: `"${s.smtpFromName || "WaytoAlgo"}" <${s.smtpFrom}>`,
    to,
    subject: "WaytoAlgo — HyperCoin Deposit Approved",
    messageId: makeMessageId(domain),
    headers: baseHeaders(domain),
    text: `WaytoAlgo — HyperCoin Deposit Approved\n\nHi ${name},\n\nYour HyperCoin deposit has been reviewed and approved by our team.\n\nAmount Credited: ${hcAmount.toFixed(4)} HC\nUSD Value: $${usdValue.toFixed(4)}\nHC Price: $${hcPrice.toFixed(4)}\n\nYour HyperCoin balance has been updated. Log in to your dashboard to view it.\n\n© WaytoAlgo`,
    html: wrap(`
      ${header(s)}
      <tr><td style="padding:32px;">
        <p style="color:rgba(168,237,255,0.8);font-size:15px;margin:0 0 8px;">Hi ${safeName},</p>
        <p style="color:rgba(168,237,255,0.6);font-size:14px;margin:0 0 24px;">
          Great news! Your HyperCoin deposit has been <strong style="color:#3DD6F5;">approved</strong> and credited to your account.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="background:rgba(61,214,245,0.08);border:1px solid rgba(61,214,245,0.3);border-radius:10px;padding:24px 24px 20px;">
            <div style="font-size:12px;color:rgba(168,237,255,0.45);margin-bottom:6px;letter-spacing:1px;">HYPERCOIN CREDITED</div>
            <div style="font-size:40px;font-weight:900;color:#3DD6F5;letter-spacing:1px;">+${hcAmount.toFixed(4)} HC</div>
            <div style="margin-top:14px;display:flex;justify-content:center;gap:32px;">
              <div style="text-align:center;">
                <div style="font-size:11px;color:rgba(168,237,255,0.4);margin-bottom:3px;">USD Value</div>
                <div style="font-size:15px;font-weight:700;color:rgba(168,237,255,0.85);">$${usdValue.toFixed(4)}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:11px;color:rgba(168,237,255,0.4);margin-bottom:3px;">HC Price</div>
                <div style="font-size:15px;font-weight:700;color:rgba(168,237,255,0.85);">$${hcPrice.toFixed(4)}</div>
              </div>
            </div>
          </td></tr>
        </table>
        <p style="color:rgba(168,237,255,0.45);font-size:12px;margin:20px 0 0;text-align:center;">
          Log in to your dashboard to view your updated HyperCoin balance.
        </p>
      </td></tr>
      ${footer()}
    `),
  });
}

// ── HyperCoin deposit rejected ────────────────────────────────────────────────
export async function sendHcDepositRejectedEmail(
  to: string,
  name: string,
  note?: string | null,
) {
  const s = await getSettings();
  if (!s?.smtpEnabled) return;

  const domain = fromDomain(s);
  const transport = createTransport(s);
  const safeName = escapeHtml(name);
  const safeNote = note ? escapeHtml(note) : null;

  await transport.sendMail({
    from: `"${s.smtpFromName || "WaytoAlgo"}" <${s.smtpFrom}>`,
    to,
    subject: "WaytoAlgo — HyperCoin Deposit Not Approved",
    messageId: makeMessageId(domain),
    headers: baseHeaders(domain),
    text: `WaytoAlgo — HyperCoin Deposit Not Approved\n\nHi ${name},\n\nWe were unable to approve your recent HyperCoin deposit request.${note ? `\n\nReason: ${note}` : ""}\n\nIf you believe this is a mistake or need assistance, please contact our support team.\n\n© WaytoAlgo`,
    html: wrap(`
      ${header(s)}
      <tr><td style="padding:32px;">
        <p style="color:rgba(168,237,255,0.8);font-size:15px;margin:0 0 8px;">Hi ${safeName},</p>
        <p style="color:rgba(168,237,255,0.6);font-size:14px;margin:0 0 24px;">
          We were unable to approve your recent HyperCoin deposit request.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.25);border-radius:10px;padding:20px 24px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:${safeNote ? "14px" : "0"};">
              <div style="width:8px;height:8px;border-radius:50%;background:#F87171;flex-shrink:0;"></div>
              <span style="color:#F87171;font-size:13px;font-weight:700;letter-spacing:0.5px;">DEPOSIT NOT APPROVED</span>
            </div>
            ${safeNote ? `
            <div style="border-top:1px solid rgba(248,113,113,0.15);padding-top:12px;">
              <p style="color:rgba(168,237,255,0.45);font-size:11px;margin:0 0 4px;letter-spacing:0.5px;">REASON</p>
              <p style="color:rgba(168,237,255,0.7);font-size:13px;margin:0;">${safeNote}</p>
            </div>` : ""}
          </td></tr>
        </table>
        <p style="color:rgba(168,237,255,0.5);font-size:13px;margin:20px 0 8px;">
          If you believe this is a mistake or need further assistance, please contact our support team with your deposit screenshot.
        </p>
        <p style="color:rgba(168,237,255,0.45);font-size:12px;margin:0;text-align:center;">
          You can submit a new deposit request after resolving any issues.
        </p>
      </td></tr>
      ${footer()}
    `),
  });
}

// ── Telegram helper ───────────────────────────────────────────────────────────
const TELEGRAM_CHUNK_SIZE = 49 * 1024 * 1024; // 49 MB per chunk (Telegram bot limit is 50 MB)

async function sendTelegramDocumentRaw(
  botToken: string,
  chatId: string,
  fileBuffer: Buffer,
  filename: string,
  caption: string,
): Promise<void> {
  const { default: FormData } = await import("form-data");
  const fetch = (await import("node-fetch")).default as unknown as typeof globalThis.fetch;
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("document", fileBuffer, { filename, contentType: "application/octet-stream" });
  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
  const res = await (fetch as any)(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${text}`);
  }
}

async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  fileBuffer: Buffer,
  filename: string,
  caption: string,
): Promise<void> {
  if (fileBuffer.length <= TELEGRAM_CHUNK_SIZE) {
    await sendTelegramDocumentRaw(botToken, chatId, fileBuffer, filename, caption);
    return;
  }
  // Split into chunks
  const totalChunks = Math.ceil(fileBuffer.length / TELEGRAM_CHUNK_SIZE);
  const baseName = filename.replace(/\.gz$/, "");
  for (let i = 0; i < totalChunks; i++) {
    const start = i * TELEGRAM_CHUNK_SIZE;
    const end = Math.min(start + TELEGRAM_CHUNK_SIZE, fileBuffer.length);
    const chunk = fileBuffer.slice(start, end);
    const chunkFilename = `${baseName}.part${i + 1}of${totalChunks}.gz`;
    const chunkCaption = i === 0
      ? `${caption}\n📦 Part ${i + 1}/${totalChunks} — join all parts before restoring`
      : `📦 Part ${i + 1}/${totalChunks} of ${filename}`;
    await sendTelegramDocumentRaw(botToken, chatId, chunk, chunkFilename, chunkCaption);
    // Brief pause between chunks to avoid Telegram flood protection
    if (i < totalChunks - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }
}

// ── Database backup ───────────────────────────────────────────────────────────
const BACKUP_DIR = process.env.BACKUP_DIR ?? "/var/www/uranaz/backups";
const BACKUP_KEEP = 7;

async function saveBackupToDisk(buffer: Buffer, filename: string): Promise<string> {
  const { mkdir, writeFile, readdir, unlink } = await import("fs/promises");
  const { join } = await import("path");
  await mkdir(BACKUP_DIR, { recursive: true });
  const filePath = join(BACKUP_DIR, filename);
  await writeFile(filePath, buffer);
  // Prune oldest backups — keep only latest BACKUP_KEEP files
  const files = (await readdir(BACKUP_DIR))
    .filter(f => f.startsWith("uranaz-backup-") && f.endsWith(".sql.gz"))
    .sort();
  for (const old of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
    await unlink(join(BACKUP_DIR, old)).catch(() => {});
  }
  return filePath;
}

export async function sendDatabaseBackupEmail(): Promise<{ sent: boolean; error?: string }> {
  const s = await getSettings();
  const hasEmail = !!(s?.smtpEnabled && s?.backupEmail);
  const hasTelegram = !!(s?.telegramBotToken && s?.telegramChatId);
  if (!hasEmail && !hasTelegram) return { sent: false, error: "No backup destination configured (no email and no Telegram)" };

  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const { gzip } = await import("zlib");
  const execFileAsync = promisify(execFile);
  const gzipAsync = promisify(gzip);

  const dbUrl = process.env.DATABASE_URL!;
  let dumpBuffer: Buffer;

  try {
    const { stdout } = await execFileAsync(
      "pg_dump",
      ["--dbname", dbUrl, "--format", "plain", "--no-owner", "--no-acl"],
      { encoding: "buffer", maxBuffer: 200 * 1024 * 1024 },
    );
    dumpBuffer = stdout as unknown as Buffer;
  } catch (err: any) {
    return { sent: false, error: `pg_dump failed: ${err?.message ?? err}` };
  }

  let attachBuffer: Buffer;
  try {
    attachBuffer = await gzipAsync(dumpBuffer);
  } catch (err: any) {
    return { sent: false, error: `Compression failed: ${err?.message ?? err}` };
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `uranaz-backup-${stamp}.sql.gz`;

  // Save to VPS disk (keeps last 7 backups)
  let savedPath: string | null = null;
  try {
    savedPath = await saveBackupToDisk(attachBuffer, filename);
    console.info(`[backup] Saved to disk: ${savedPath}`);
  } catch (err: any) {
    console.error("[backup] Disk save failed", err);
  }

  const errors: string[] = [];

  // ── Send via email ────────────────────────────────────────────────────────
  // Most email servers reject attachments > 25 MB. If the compressed backup exceeds
  // 20 MB we send a text-only notification instead of risking a silent rejection.
  const EMAIL_ATTACH_LIMIT = 20 * 1024 * 1024; // 20 MB
  const tooLargeForEmail = attachBuffer.length > EMAIL_ATTACH_LIMIT;

  if (hasEmail) {
    try {
      const domain = fromDomain(s!);
      const transport = createTransport(s!);
      const sizeNote = tooLargeForEmail
        ? `<p style="color:rgba(248,113,113,0.85);font-size:13px;margin:0 0 16px;">
             ⚠️ Backup is ${(attachBuffer.length / 1024 / 1024).toFixed(1)} MB — too large to attach via email.
             The file has been saved on the VPS at <strong style="color:#fff;">${savedPath ?? BACKUP_DIR}</strong>
             and sent via Telegram (split into parts if needed).
           </p>`
        : `<p style="color:rgba(168,237,255,0.65);font-size:13px;margin:0 0 16px;">
             Your hourly database backup is attached below.
           </p>`;
      await transport.sendMail({
        from: `"${s!.smtpFromName || "WaytoAlgo"}" <${s!.smtpFrom}>`,
        to: s!.backupEmail,
        subject: `[WaytoAlgo] Database Backup — ${now.toUTCString()}`,
        messageId: makeMessageId(domain),
        headers: baseHeaders(domain),
        text: tooLargeForEmail
          ? `WaytoAlgo — Database Backup Notification\n\nBackup taken at: ${now.toUTCString()}\nFile: ${filename}\nSize: ${(attachBuffer.length / 1024 / 1024).toFixed(1)} MB (too large to attach — saved on VPS and sent via Telegram)\n\n© WaytoAlgo`
          : `WaytoAlgo — Automated Database Backup\n\nBackup taken at: ${now.toUTCString()}\nFile: ${filename}\n\n© WaytoAlgo`,
        html: wrap(`
          ${header(s!)}
          <tr><td style="padding:28px 32px;">
            <div style="display:inline-block;background:rgba(61,214,245,0.10);border:1px solid rgba(61,214,245,0.28);
              border-radius:6px;padding:4px 12px;margin-bottom:16px;">
              <span style="color:#3DD6F5;font-size:11px;font-weight:700;letter-spacing:1px;">AUTOMATED BACKUP</span>
            </div>
            <h2 style="margin:0 0 10px;color:#FFFFFF;font-size:16px;">Database Backup</h2>
            ${sizeNote}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid rgba(61,214,245,0.15);border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:8px 14px;color:rgba(168,237,255,0.45);font-size:12px;width:120px;">Taken at</td>
                <td style="padding:8px 14px;color:#C8E8F5;font-size:12px;font-weight:600;">${now.toUTCString()}</td>
              </tr>
              <tr style="border-top:1px solid rgba(61,214,245,0.10);">
                <td style="padding:8px 14px;color:rgba(168,237,255,0.45);font-size:12px;">File</td>
                <td style="padding:8px 14px;color:#C8E8F5;font-size:12px;font-weight:600;">${filename}</td>
              </tr>
              <tr style="border-top:1px solid rgba(61,214,245,0.10);">
                <td style="padding:8px 14px;color:rgba(168,237,255,0.45);font-size:12px;">Original size</td>
                <td style="padding:8px 14px;color:#C8E8F5;font-size:12px;font-weight:600;">${(dumpBuffer.length / 1024).toFixed(1)} KB</td>
              </tr>
              <tr style="border-top:1px solid rgba(61,214,245,0.10);">
                <td style="padding:8px 14px;color:rgba(168,237,255,0.45);font-size:12px;">Compressed size</td>
                <td style="padding:8px 14px;color:#C8E8F5;font-size:12px;font-weight:600;">${(attachBuffer.length / 1024 / 1024).toFixed(1)} MB</td>
              </tr>
            </table>
            <p style="color:rgba(168,237,255,0.35);font-size:11px;margin:18px 0 0;">
              This is an automated hourly backup from the WaytoAlgo platform.
            </p>
          </td></tr>
          ${footer()}
        `),
        ...(tooLargeForEmail ? {} : {
          attachments: [{ filename, content: attachBuffer, contentType: "application/gzip" }],
        }),
      });
      console.info(`[backup] Email sent to ${s!.backupEmail}${tooLargeForEmail ? " (notification only — file too large)" : ""}`);
    } catch (err: any) {
      const msg = `Email send failed: ${err?.message ?? err}`;
      console.error("[backup]", msg);
      errors.push(msg);
    }
  }

  // ── Send via Telegram ─────────────────────────────────────────────────────
  if (hasTelegram) {
    try {
      const caption = `🗄 WaytoAlgo — DB Backup\n📅 ${now.toUTCString()}\n📦 ${filename}\n💾 ${(attachBuffer.length / 1024).toFixed(1)} KB`;
      await sendTelegramDocument(s!.telegramBotToken, s!.telegramChatId, attachBuffer, filename, caption);
      console.info("[backup] Sent to Telegram chat", s!.telegramChatId);
    } catch (err: any) {
      const msg = `Telegram send failed: ${err?.message ?? err}`;
      console.error("[backup]", msg);
      errors.push(msg);
    }
  }

  if (errors.length > 0 && !hasEmail && !hasTelegram) {
    return { sent: false, error: errors.join("; ") };
  }
  return { sent: true };
}

export async function isOtpRegistrationEnabled(): Promise<boolean> {
  const s = await getSettings();
  return !!(s?.smtpEnabled && s?.otpRegistrationEnabled);
}

export async function isOtpWithdrawalEnabled(): Promise<boolean> {
  const s = await getSettings();
  return !!(s?.smtpEnabled && s?.otpWithdrawalEnabled);
}

export async function isOtpWalletUpdateEnabled(): Promise<boolean> {
  const s = await getSettings();
  return !!(s?.smtpEnabled && s?.otpWalletUpdateEnabled);
}
