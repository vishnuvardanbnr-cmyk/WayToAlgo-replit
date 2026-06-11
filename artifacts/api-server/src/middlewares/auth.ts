import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set — refusing to start without it.");
}

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signToken(userId: number): string {
  const payload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", SECRET!).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): number | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expectedSig = createHmac("sha256", SECRET!).update(payload).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    // Enforce token expiry (30 days)
    if (!decoded.ts || Date.now() - decoded.ts > TOKEN_MAX_AGE_MS) return null;
    return decoded.userId as number;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const userId = verifyToken(token);
  if (!userId) {
    res.status(401).json({ message: "Invalid token" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }
  if (user.isBlocked) {
    res.status(401).json({ message: "Your account has been blocked. Please contact support." });
    return;
  }
  (req as any).user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    const user = (req as any).user;
    if (!user?.isAdmin) {
      res.status(403).json({ message: "Admin access required" });
      return;
    }
    next();
  });
}
