import pino from "pino";
import { mkdirSync } from "fs";

const isProduction = process.env.NODE_ENV === "production";
const LOG_DIR = process.env["LOG_DIR"] ?? "/var/log/uranaz";

const baseOptions: pino.LoggerOptions = {
  level: process.env["LOG_LEVEL"] ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
};

let logger: pino.Logger;

if (isProduction) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
  } catch {
  }

  const streams = pino.multistream([
    { stream: process.stdout },
    {
      stream: pino.destination({
        dest: `${LOG_DIR}/api.log`,
        sync: false,
        mkdir: true,
      }),
    },
    {
      level: "error" as pino.Level,
      stream: pino.destination({
        dest: `${LOG_DIR}/api-error.log`,
        sync: false,
        mkdir: true,
      }),
    },
  ]);

  logger = pino(baseOptions, streams);
} else {
  logger = pino({
    ...baseOptions,
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  });
}

export { logger };
