import { Router } from "express";
import { db, incomeTable, withdrawalsTable } from "@workspace/db";
import { eq, and, desc, sum } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function incomeToResponse(inc: typeof incomeTable.$inferSelect) {
  return {
    id: inc.id,
    userId: inc.userId,
    type: inc.type,
    amount: parseFloat(inc.amount),
    description: inc.description,
    fromUserId: inc.fromUserId,
    fromUserName: inc.fromUserName,
    level: inc.level,
    createdAt: inc.createdAt.toISOString(),
  };
}

// GET /api/income
router.get("/income", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const type = req.query.type as string | undefined;
  const offset = (page - 1) * limit;

  const conditions = [eq(incomeTable.userId, user.id)];
  if (type) conditions.push(eq(incomeTable.type, type));

  const allRecords = await db.select().from(incomeTable)
    .where(and(...conditions))
    .orderBy(desc(incomeTable.createdAt));

  const paginated = allRecords.slice(offset, offset + limit);
  res.json({
    records: paginated.map(incomeToResponse),
    total: allRecords.length,
    page,
    limit,
  });
});

// GET /api/income/summary
router.get("/income/summary", requireAuth, async (req, res) => {
  const user = (req as any).user;

  const allIncome = await db.select().from(incomeTable).where(eq(incomeTable.userId, user.id));

  let dailyReturnTotal = 0;
  let spotReferralTotal = 0;
  let levelCommissionTotal = 0;
  let rankBonusTotal = 0;
  let tokenSaleTotal = 0;

  for (const rec of allIncome) {
    const amt = parseFloat(rec.amount);
    if (rec.type === "daily_return") dailyReturnTotal += amt;
    else if (rec.type === "spot_referral") spotReferralTotal += amt;
    else if (rec.type === "level_commission") levelCommissionTotal += amt;
    else if (rec.type === "rank_bonus") rankBonusTotal += amt;
    else if (rec.type === "token_sale") tokenSaleTotal += amt;
  }

  // USDT-denominated income — these are the only types withdrawable in USDT
  const usdtEarningsTotal = spotReferralTotal + rankBonusTotal + tokenSaleTotal;
  // WTA-denominated income — stored as token amounts, NOT directly withdrawable
  const wtaEarningsTotal  = dailyReturnTotal + levelCommissionTotal;

  const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.userId, user.id));
  const withdrawnTotal = withdrawals
    .filter(w => w.status === "approved")
    .reduce((s, w) => s + parseFloat(w.amount), 0);
  const pendingWithdrawal = withdrawals
    .filter(w => w.status === "pending")
    .reduce((s, w) => s + parseFloat(w.amount), 0);

  // Available balance is only from USDT earnings (WTA must be sold first)
  const availableBalance = usdtEarningsTotal - withdrawnTotal - pendingWithdrawal;

  res.json({
    totalEarnings: usdtEarningsTotal,   // USDT only — what can actually be withdrawn
    wtaEarningsTotal,                    // WTA tokens total (daily + level comm)
    dailyReturnTotal,
    spotReferralTotal,
    levelCommissionTotal,
    rankBonusTotal,
    tokenSaleTotal,
    usdtEarningsTotal,
    availableBalance: Math.max(0, availableBalance),
    withdrawnTotal,
    pendingWithdrawal,
  });
});

export default router;
