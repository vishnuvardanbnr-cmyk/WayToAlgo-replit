import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import router from "./routes";
import { logger } from "./lib/logger";
import { getRedis } from "./lib/redis";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app: Express = express();

// Trust the first proxy (nginx) so express-rate-limit gets the real client IP
// from X-Forwarded-For instead of the loopback address.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow requests from production domains, Replit dev/preview domains, and local development
const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
const allowedOrigins: (string | RegExp)[] = [
  "https://way2algo.io",
  "https://www.way2algo.io",
  "https://waytoalgo.com",
  "https://www.waytoalgo.com",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.replit\.dev$/,
  /\.repl\.co$/,
];
if (REPLIT_DEV_DOMAIN) {
  allowedOrigins.push(`https://${REPLIT_DEV_DOMAIN}`);
}
app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server (no origin) and matching origins
    if (!origin) return cb(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === "string" ? o === origin : o.test(origin)
    );
    // Return false (not an Error) so CORS silently blocks without throwing
    cb(null, allowed);
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// When Redis is available (production), counters are shared across all PM2
// cluster workers so limits are enforced globally, not per-worker.
// Falls back to in-memory store when Redis is not configured (local dev).
function makeStore(prefix: string) {
  const redis = getRedis();
  if (!redis) return undefined; // express-rate-limit defaults to MemoryStore
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args: string[]) => (redis as any).call(...args),
  });
}

// Login: 10 requests per minute per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again in a minute." },
  skip: (req) => req.method === "OPTIONS",
  store: makeStore("auth"),
});

// OTP endpoint: 5 per minute per IP — prevents OTP spam and enumeration
const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP requests, please wait before trying again." },
  skip: (req) => req.method === "OPTIONS",
  store: makeStore("otp"),
});

// General API: 200 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, slow down." },
  skip: (req) => req.method === "OPTIONS",
  store: makeStore("api"),
});

// ── Body parsers — 10 mb to handle base64 profile images and large payloads ──
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply rate limiters before routing
app.use("/api/auth/send-otp", otpLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api", generalLimiter);

app.use("/api", router);

// ── Frontend static file serving ──────────────────────────────────────────────
// Serve the pre-built Vite frontend so everything runs on a single port.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../uranaz/dist/public");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: "1h", etag: true }));
  // SPA fallback — any unmatched route returns index.html (Express 5 wildcard syntax)
  app.get("/{*wildcard}", (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
// Catches PayloadTooLargeError, SyntaxError (bad JSON), and any other
// synchronous errors thrown by middleware — returns clean JSON instead of
// crashing or leaking stack traces.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    res.status(413).json({ message: "Request body too large. Maximum size is 10 MB." });
    return;
  }
  if (err.status === 400 && err.type === "entity.parse.failed") {
    res.status(400).json({ message: "Invalid JSON in request body." });
    return;
  }
  logger.error({ err }, "Unhandled Express error");
  res.status(err.status ?? 500).json({ message: err.message ?? "Internal server error" });
});

export default app;
