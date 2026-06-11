import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

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
// Only allow requests from the production domain and local development
const allowedOrigins = [
  "https://waytoalgo.com",
  "https://www.waytoalgo.com",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.replit\.dev$/,
  /\.repl\.co$/,
];
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
// Login: 10 requests per minute per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again in a minute." },
  skip: (req) => req.method === "OPTIONS",
});

// OTP endpoint: 5 per minute per IP — prevents OTP spam and enumeration
const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many OTP requests, please wait before trying again." },
  skip: (req) => req.method === "OPTIONS",
});

// General API: 200 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, slow down." },
  skip: (req) => req.method === "OPTIONS",
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
