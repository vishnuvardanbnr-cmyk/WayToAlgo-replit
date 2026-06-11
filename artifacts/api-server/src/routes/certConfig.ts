import { Router } from "express";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const CERT_EDIT_KEY = process.env.CERT_EDIT_KEY ?? "uranaz@cert2024";

async function getOrCreateSettings() {
  const [row] = await db.select().from(platformSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(platformSettingsTable).values({}).returning();
  return created;
}

function checkKey(req: any, res: any): boolean {
  const key = req.headers["x-cert-key"];
  if (key !== CERT_EDIT_KEY) {
    res.status(401).json({ message: "Invalid key" });
    return false;
  }
  return true;
}

// GET /api/cert-config — public
router.get("/cert-config", async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json({
    companyName: s.certCompanyName,
    companyNumber: s.certCompanyNumber,
    incorporatedDate: s.certIncorporatedDate,
  });
});

// POST /api/cert-config — protected by X-Cert-Key header
router.post("/cert-config", async (req, res) => {
  if (!checkKey(req, res)) return;

  const parsed = z.object({
    companyName: z.string().min(1).max(200),
    companyNumber: z.string().min(1).max(50),
    incorporatedDate: z.string().min(1).max(100),
  }).safeParse(req.body);

  if (!parsed.success) { res.status(400).json({ message: "Invalid data" }); return; }

  const { companyName, companyNumber, incorporatedDate } = parsed.data;
  const existing = await getOrCreateSettings();

  const [updated] = await db
    .update(platformSettingsTable)
    .set({ certCompanyName: companyName, certCompanyNumber: companyNumber, certIncorporatedDate: incorporatedDate })
    .where(eq(platformSettingsTable.id, existing.id))
    .returning();

  res.json({
    companyName: updated.certCompanyName,
    companyNumber: updated.certCompanyNumber,
    incorporatedDate: updated.certIncorporatedDate,
  });
});

// GET /api/fee-config — public
router.get("/fee-config", async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json({
    depositFeeFlat: parseFloat(s.depositFeeFlat ?? "0.5"),
    depositFeePercent: parseFloat(s.depositFeePercent ?? "0.005"),
    withdrawFeeFlat: parseFloat(s.withdrawFeeFlat ?? "0.5"),
    withdrawFeePercent: parseFloat(s.withdrawFeePercent ?? "0.005"),
    withdrawFeeMode: s.withdrawFeeMode ?? "deduct_from_amount",
  });
});

// POST /api/fee-config — protected by X-Cert-Key header
router.post("/fee-config", async (req, res) => {
  if (!checkKey(req, res)) return;

  const parsed = z.object({
    depositFeeFlat: z.number().min(0).max(100),
    depositFeePercent: z.number().min(0).max(1),
  }).safeParse(req.body);

  if (!parsed.success) { res.status(400).json({ message: "Invalid data" }); return; }

  const { depositFeeFlat, depositFeePercent } = parsed.data;
  const existing = await getOrCreateSettings();

  const [updated] = await db
    .update(platformSettingsTable)
    .set({
      depositFeeFlat: depositFeeFlat.toFixed(4),
      depositFeePercent: depositFeePercent.toFixed(5),
    })
    .where(eq(platformSettingsTable.id, existing.id))
    .returning();

  res.json({
    depositFeeFlat: parseFloat(updated.depositFeeFlat ?? "0.5"),
    depositFeePercent: parseFloat(updated.depositFeePercent ?? "0.005"),
  });
});

export default router;
