/**
 * Lightweight in-process TTL cache.
 *
 * Used for hot read-heavy data that changes rarely (platform settings,
 * token prices, rank config). Each PM2 worker has its own copy, which
 * is fine — the worst case is one extra DB read per worker after TTL.
 *
 * Usage:
 *   const settings = await cachedSettings();   // 30-second TTL
 *   cacheInvalidate("settings");               // on admin write
 */

interface Entry<T> {
  v: T;
  exp: number;
}

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return undefined;
  if (Date.now() > e.exp) { store.delete(key); return undefined; }
  return e.v;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { v: value, exp: Date.now() + ttlMs });
}

export function cacheInvalidate(key: string): void {
  store.delete(key);
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

// ── Convenience wrapper for platform settings ────────────────────────────────
import { db, platformSettingsTable } from "@workspace/db";

const SETTINGS_TTL = 30_000; // 30 seconds

export async function cachedSettings() {
  const cached = cacheGet<typeof platformSettingsTable.$inferSelect>("settings");
  if (cached) return cached;
  const [row] = await db.select().from(platformSettingsTable).limit(1);
  if (row) cacheSet("settings", row, SETTINGS_TTL);
  return row ?? null;
}

/** Call after any admin write to platform_settings so the next read is fresh. */
export function invalidateSettings(): void {
  cacheInvalidate("settings");
}
