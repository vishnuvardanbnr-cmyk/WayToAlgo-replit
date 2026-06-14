import { createServer } from "http";
import cron from "node-cron";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocket } from "./lib/wsManager";
import { sendDatabaseBackupEmail } from "./lib/email";
import { runRankEngine } from "./lib/rankEngine";
import { db, platformSettingsTable, seedRanks } from "@workspace/db";

// ── Crash guards ───────────────────────────────────────────────────────────────
// Log unhandled promise rejections instead of crashing the process
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — process kept alive");
});

// Log uncaught exceptions — exit only for truly irrecoverable errors
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — restarting gracefully");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
setupWebSocket(server);

// ── Daily payout cron: DISABLED ──
// The off-chain USDT ROI/level payout has been replaced by the token-based
// payout cycle. ROI is now credited only when an admin runs "Buy & Distribute"
// (POST /api/admin/token/distribute), which performs a real on-chain token buy
// and distributes the bought tokens virtually. The legacy processDailyPayout
// remains reachable via POST /api/admin/run-daily-payout for migration/testing
// only — it is no longer scheduled.
logger.info("Daily ROI payout cron disabled — using token-based buy & distribute instead");

// ── Hourly DB backup cron ──────────────────────────────────────────────────
cron.schedule("0 * * * *", async () => {
  logger.info("Cron: starting hourly database backup");
  try {
    const result = await sendDatabaseBackupEmail();
    if (result.sent) {
      logger.info("Cron: database backup email sent successfully");
    } else {
      logger.info({ reason: result.error }, "Cron: database backup skipped");
    }
  } catch (err) {
    logger.error({ err }, "Cron: database backup failed");
  }
});

logger.info("Hourly DB backup cron scheduled — every hour at :00");

// ── Daily rank engine cron ──────────────────────────────────────────────────
// Auto-promotes users to the highest rank they qualify for and pays out due
// monthly rank rewards to the Withdraw Wallet. Runs daily at 01:00.
cron.schedule("0 1 * * *", async () => {
  logger.info("Cron: starting daily rank engine");
  try {
    const result = await runRankEngine();
    logger.info(result, "Cron: rank engine finished");
  } catch (err) {
    logger.error({ err }, "Cron: rank engine failed");
  }
});

logger.info("Daily rank engine cron scheduled — every day at 01:00");

// Seed the default rank ladder on an empty platform so the Ranks page and
// progress bars work immediately. Idempotent: skips when ranks already exist.
seedRanks()
  .then((r) => logger.info(r, "Rank seed checked"))
  .catch((err) => logger.error({ err }, "Rank seed failed"));

// Run the rank engine shortly after startup so promotions/payouts settle without
// waiting for the next daily tick (non-blocking, errors are swallowed/logged).
setTimeout(() => {
  runRankEngine().catch((err) => logger.error({ err }, "Startup rank engine run failed"));
}, 15_000);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
