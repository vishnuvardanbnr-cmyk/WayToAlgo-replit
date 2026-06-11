import { Router } from "express";
import { db, investmentsTable, usersTable, incomeTable, platformSettingsTable } from "@workspace/db";
import { eq, and, desc, sum } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateInvestmentBody } from "@workspace/api-zod";
import { sendDepositConfirmationEmail } from "../lib/email";

const router = Router();

async function getPlan(amount: number) {
  const [s] = await db.select().from(platformSettingsTable).limit(1);
  const rate = s ? parseFloat(s.planDailyRate) : 0.008;
  const days = s ? s.planDays : 300;
  const minAmount = s ? parseFloat(s.planMinAmount) : 100;
  const maxTotal = s ? parseFloat(s.maxTotalInvestment) : 2000;
  if (amount >= minAmount && amount <= maxTotal) {
    return { tier: "plan", dailyRate: rate, durationDays: days };
  }
  return null;
}

function investmentToResponse(inv: typeof investmentsTable.$inferSelect) {
  return {
    id: inv.id,
    userId: inv.userId,
    amount: parseFloat(inv.amount),
    planTier: inv.planTier,
    dailyRate: parseFloat(inv.dailyRate),
    durationDays: inv.durationDays,
    earnedSoFar: parseFloat(inv.earnedSoFar),
    remainingDays: inv.remainingDays,
    startDate: inv.startDate.toISOString(),
    endDate: inv.endDate.toISOString(),
    status: inv.status,
    hyperCoinAmount: parseFloat(inv.hyperCoinAmount),
    usdtAmount: parseFloat(inv.usdtAmount),
    investmentType: (inv.investmentType ?? "risky") as "safe" | "risky",
    tokenPurchaseAmount: parseFloat(inv.tokenPurchaseAmount ?? "0"),
    createdAt: inv.createdAt.toISOString(),
  };
}

// GET /api/investments
router.get("/investments", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const investments = await db.select().from(investmentsTable)
    .where(eq(investmentsTable.userId, user.id))
    .orderBy(desc(investmentsTable.createdAt));
  res.json(investments.map(investmentToResponse));
});

// POST /api/investments
router.post("/investments", requireAuth, async (req, res) => {
  const parsed = CreateInvestmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const user = (req as any).user;
  const { amount, investmentType } = parsed.data as { amount: number; investmentType: "safe" | "risky" };

  if (user.investmentBlocked) {
    const reason = user.investmentBlockReason || user.blockReason;
    res.status(403).json({
      message: reason
        ? `New investments are blocked: ${reason}`
        : "New investments have been blocked on your account. Please contact support.",
    });
    return;
  }

  if (amount % 100 !== 0) {
    res.status(400).json({ message: "Investment must be a multiple of 100" });
    return;
  }

  const plan = await getPlan(amount);
  if (!plan) {
    const [s2] = await db.select().from(platformSettingsTable).limit(1);
    const minAmt = s2 ? parseFloat(s2.planMinAmount) : 100;
    const maxT = s2 ? parseFloat(s2.maxTotalInvestment) : 2000;
    res.status(400).json({ message: `Investment amount must be $${minAmt}–$${maxT.toLocaleString()} USDT` });
    return;
  }

  const [settings] = await db.select().from(platformSettingsTable).limit(1);

  // Compute the split server-side based on investmentType:
  // Safe  → 50% goes to immediate WTA token purchase, 50% earns daily ROI
  // Risky → 100% earns daily ROI (no token purchase)
  const tokenPurchaseAmount = investmentType === "safe" ? amount * 0.5 : 0;
  const usdtAmount = amount; // always paid entirely from USDT wallet
  const hyperCoinAmount = 0; // user never pays with WTA tokens

  // Fetch fresh user to check balances
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  if (!freshUser) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  // Enforce configurable total active investment limit
  const maxTotalInvestment = parseFloat(settings?.maxTotalInvestment ?? "2000");
  const [{ total: activeTotal }] = await db
    .select({ total: sum(investmentsTable.amount) })
    .from(investmentsTable)
    .where(and(eq(investmentsTable.userId, user.id), eq(investmentsTable.status, "active")));
  const currentActiveTotal = parseFloat(activeTotal ?? "0");
  if (currentActiveTotal + amount > maxTotalInvestment) {
    const remaining = Math.max(0, maxTotalInvestment - currentActiveTotal);
    res.status(400).json({
      message: `Maximum total investment is $${maxTotalInvestment}. You have $${currentActiveTotal.toFixed(2)} currently active, so you can only invest up to $${remaining.toFixed(2)} more.`,
      code: "MAX_INVESTMENT_EXCEEDED",
      maxTotal: maxTotalInvestment,
      currentTotal: currentActiveTotal,
      remaining,
    });
    return;
  }

  const currentUsdt = parseFloat(freshUser.walletBalance ?? "0");
  if (usdtAmount > currentUsdt) {
    res.status(400).json({ message: `Insufficient USDT balance. Available: $${currentUsdt.toFixed(2)}` });
    return;
  }

  // For Safe invest: credit WTA tokens at current admin-configured price
  const tokenPrice = parseFloat(settings?.hyperCoinPrice ?? "1");
  const tokensToCredit = tokenPurchaseAmount > 0 && tokenPrice > 0
    ? tokenPurchaseAmount / tokenPrice
    : 0;

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  // Wrap investment creation + balance deduction in a transaction to prevent race conditions
  let investment: typeof investmentsTable.$inferSelect;
  try {
    [investment] = await db.transaction(async (tx) => {
      // Re-fetch user inside transaction to get latest balances
      const [lockedUser] = await tx.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
      if (!lockedUser) throw Object.assign(new Error("User not found"), { status: 404 });
      const latestUsdt = parseFloat(lockedUser.walletBalance ?? "0");
      if (usdtAmount > latestUsdt) throw Object.assign(new Error(`Insufficient USDT balance. Available: $${latestUsdt.toFixed(2)}`), { status: 400 });

      const inv = await tx.insert(investmentsTable).values({
        userId: user.id,
        amount: amount.toString(),
        planTier: plan.tier,
        dailyRate: plan.dailyRate.toString(),
        durationDays: plan.durationDays,
        remainingDays: plan.durationDays,
        startDate,
        endDate,
        hyperCoinAmount: hyperCoinAmount.toString(),
        usdtAmount: usdtAmount.toString(),
        investmentType,
        tokenPurchaseAmount: tokenPurchaseAmount.toString(),
        status: "active",
        earnedSoFar: "0",
      }).returning();

      // Auto-activate user on their first investment
      const isFirstInvestment = parseFloat(lockedUser.totalInvested) === 0;
      const currentHyper = parseFloat(lockedUser.hyperCoinBalance ?? "0");
      await tx.update(usersTable)
        .set({
          totalInvested: (parseFloat(lockedUser.totalInvested) + amount).toString(),
          walletBalance: (latestUsdt - usdtAmount).toString(),
          // Safe invest: credit WTA tokens immediately at current price
          ...(tokensToCredit > 0 ? { hyperCoinBalance: (currentHyper + tokensToCredit).toFixed(6) } : {}),
          ...(isFirstInvestment ? { isActive: true } : {}),
        })
        .where(eq(usersTable.id, user.id));

      return inv;
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ message: err?.message ?? "Investment creation failed" });
    return;
  }

  if (user.sponsorId) {
    const spotRate = settings ? parseFloat(settings.spotReferralRate) : 0.05;
    const spotCommission = amount * spotRate;
    const [sponsor] = await db.select().from(usersTable).where(eq(usersTable.id, user.sponsorId)).limit(1);

    // If sponsor is inactive, redirect the commission to the admin account
    let recipientId: number | null = null;
    let recipientUser: typeof usersTable.$inferSelect | undefined;

    if (sponsor && sponsor.isActive) {
      recipientId = sponsor.id;
      recipientUser = sponsor;
    } else {
      // Find first admin user to receive the redirected commission
      const [admin] = await db.select().from(usersTable)
        .where(eq(usersTable.isAdmin, true))
        .limit(1);
      if (admin) {
        recipientId = admin.id;
        recipientUser = admin;
      }
    }

    if (recipientId && recipientUser) {
      await db.insert(incomeTable).values({
        userId: recipientId,
        type: "spot_referral",
        amount: spotCommission.toString(),
        description: sponsor && !sponsor.isActive
          ? `Spot referral commission from ${user.name} (redirected — original sponsor inactive)`
          : `Spot referral commission from ${user.name}`,
        fromUserId: user.id,
        fromUserName: user.name,
      });
      await db.update(usersTable)
        .set({ totalEarnings: (parseFloat(recipientUser.totalEarnings) + spotCommission).toString() })
        .where(eq(usersTable.id, recipientId));
    }
  }

  // Send deposit confirmation email (fire-and-forget)
  const planLabel = `${plan.tier.toUpperCase()} — ${(plan.dailyRate * 100).toFixed(1)}%/day, ${plan.durationDays} days`;
  sendDepositConfirmationEmail(user.email, user.name, amount, planLabel).catch(() => {});

  res.status(201).json(investmentToResponse(investment));
});

// GET /api/investments/:id
router.get("/investments/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const user = (req as any).user;
  const [investment] = await db.select().from(investmentsTable)
    .where(and(eq(investmentsTable.id, id), eq(investmentsTable.userId, user.id)))
    .limit(1);
  if (!investment) {
    res.status(404).json({ message: "Investment not found" });
    return;
  }
  res.json(investmentToResponse(investment));
});

export { investmentToResponse };
export default router;
