/**
 * Shared Redis client factory (ioredis).
 *
 * All clients are lazy-connected and non-fatal: if REDIS_URL is not set
 * (e.g. local dev without Redis) every getter returns null and callers
 * fall back to in-process behaviour.
 *
 * Three separate clients are needed because ioredis connections that
 * enter subscribe mode can no longer issue normal commands:
 *   getRedis()       — general use (rate-limit store, cache, etc.)
 *   getPublisher()   — WebSocket message fan-out publish
 *   getSubscriber()  — WebSocket message fan-out subscribe
 */
import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

function make(name: string): Redis | null {
  if (!REDIS_URL) return null;
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
  });
  client.on("error", (err) => logger.warn({ err }, `Redis ${name} error`));
  return client;
}

let _redis: Redis | null | undefined;
let _pub: Redis | null | undefined;
let _sub: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (_redis === undefined) _redis = make("client");
  return _redis;
}

export function getPublisher(): Redis | null {
  if (_pub === undefined) _pub = make("publisher");
  return _pub;
}

export function getSubscriber(): Redis | null {
  if (_sub === undefined) _sub = make("subscriber");
  return _sub;
}

export { REDIS_URL };
