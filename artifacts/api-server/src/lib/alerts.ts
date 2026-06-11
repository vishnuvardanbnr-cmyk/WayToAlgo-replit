import { logger } from "./logger";
import { sendAdminAlertEmail } from "./email";

const LARGE_DEPOSIT_THRESHOLD = parseFloat(process.env["LARGE_DEPOSIT_THRESHOLD"] ?? "500");

const UNUSUAL_WITHDRAWAL_COUNT = parseInt(process.env["UNUSUAL_WITHDRAWAL_COUNT"] ?? "3", 10);

const OTP_FAILURE_WINDOW_MS = 30 * 60 * 1000;
const OTP_FAILURE_ALERT_THRESHOLD = 5;

interface OtpFailureEntry {
  count: number;
  resetAt: number;
  alerted: boolean;
}

const otpFailures = new Map<string, OtpFailureEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpFailures.entries()) {
    if (now > entry.resetAt) otpFailures.delete(key);
  }
}, 5 * 60 * 1000);

export async function alertLargeDeposit(
  userId: number,
  userName: string,
  email: string,
  amount: number,
): Promise<void> {
  if (amount < LARGE_DEPOSIT_THRESHOLD) return;

  logger.warn(
    { event: "large_deposit", userId, userName, amount, threshold: LARGE_DEPOSIT_THRESHOLD },
    `Large deposit detected: $${amount.toFixed(2)} USDT by ${userName} (User #${userId})`,
  );

  try {
    await sendAdminAlertEmail(
      "Large Deposit Alert",
      `A deposit of <strong>$${amount.toFixed(2)} USDT</strong> was received — this exceeds the alert threshold of $${LARGE_DEPOSIT_THRESHOLD}.`,
      [
        ["User", `${userName} (ID #${userId})`],
        ["Email", email],
        ["Amount", `$${amount.toFixed(2)} USDT`],
        ["Threshold", `$${LARGE_DEPOSIT_THRESHOLD} USDT`],
        ["Time", new Date().toUTCString()],
      ],
    );
  } catch (err) {
    logger.error({ err }, "Failed to send large deposit alert email");
  }
}

export async function alertUnusualWithdrawal(
  userId: number,
  userName: string,
  amount: number,
  recentCount: number,
): Promise<void> {
  if (recentCount < UNUSUAL_WITHDRAWAL_COUNT) return;

  logger.warn(
    { event: "unusual_withdrawal", userId, userName, amount, recentCount },
    `Unusual withdrawal pattern: ${userName} (User #${userId}) made ${recentCount} withdrawals in the last 24h`,
  );

  try {
    await sendAdminAlertEmail(
      "Unusual Withdrawal Pattern Alert",
      `User <strong>${userName}</strong> has made <strong>${recentCount} withdrawal requests</strong> in the last 24 hours.`,
      [
        ["User", `${userName} (ID #${userId})`],
        ["Withdrawals in 24h", String(recentCount)],
        ["Latest Amount", `$${amount.toFixed(2)} USDT`],
        ["Time", new Date().toUTCString()],
      ],
    );
  } catch (err) {
    logger.error({ err }, "Failed to send unusual withdrawal alert email");
  }
}

export function trackOtpFailure(email: string, ip: string): void {
  const key = `${email}:${ip}`;
  const now = Date.now();
  const entry = otpFailures.get(key);

  if (!entry || now > entry.resetAt) {
    otpFailures.set(key, { count: 1, resetAt: now + OTP_FAILURE_WINDOW_MS, alerted: false });
    return;
  }

  entry.count++;

  if (entry.count >= OTP_FAILURE_ALERT_THRESHOLD && !entry.alerted) {
    entry.alerted = true;
    logger.warn(
      { event: "otp_failure_threshold", email, ip, count: entry.count },
      `Multiple failed OTP attempts: ${entry.count} failures for ${email} from IP ${ip}`,
    );
    sendAdminAlertEmail(
      "Multiple Failed OTP Attempts",
      `<strong>${entry.count} failed OTP verification attempts</strong> have been detected within a 30-minute window.`,
      [
        ["Account Email", email],
        ["Source IP", ip],
        ["Failure Count", String(entry.count)],
        ["Window", "30 minutes"],
        ["Time", new Date().toUTCString()],
      ],
    ).catch((err: unknown) => {
      logger.error({ err }, "Failed to send OTP failure alert email");
    });
  }
}
