import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const ENC_PREFIX = "enc:";

const RAW_SECRET = process.env.PRIVATE_KEY_SECRET;
if (!RAW_SECRET) {
  throw new Error("PRIVATE_KEY_SECRET environment variable must be set — refusing to start without it.");
}
if (RAW_SECRET.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(RAW_SECRET)) {
  throw new Error("PRIVATE_KEY_SECRET must be exactly 64 hex characters (32 bytes / 256 bits).");
}

const ENCRYPTION_KEY = Buffer.from(RAW_SECRET, "hex");

/**
 * Encrypt a plaintext private key string.
 * Output format: "enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
export function encryptKey(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a private key that was encrypted with encryptKey().
 * Throws if the format is invalid or decryption fails.
 */
export function decryptKey(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    throw new Error("Value is not encrypted — use isEncrypted() before calling decryptKey()");
  }
  const parts = stored.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted key format");
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ctHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Returns true if the stored value was encrypted with encryptKey().
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

/**
 * Resolve a stored key to its plaintext form.
 * - If already encrypted: decrypt it.
 * - If plaintext (legacy `0x...`): return as-is (caller should re-save the encrypted form).
 * Returns null if value is empty / not set.
 */
export function resolveKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (isEncrypted(stored)) return decryptKey(stored);
  return stored; // legacy plaintext — caller responsible for migrating
}

/**
 * Ensure a key is encrypted: if it's plaintext, encrypt it; if already encrypted, leave it alone.
 * Use this before saving to the database.
 */
export function ensureEncrypted(value: string): string {
  if (!value) return value;
  if (isEncrypted(value)) return value;
  return encryptKey(value);
}
