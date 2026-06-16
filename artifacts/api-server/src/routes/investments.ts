import { Router } from "express";
import { db, investmentsTable, usersTable, incomeTable, platformSettingsTable, userTokenPurchasesTable } from "@workspace/db";
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
  const isSafe = investmentType === "safe";

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
  // Safe  → 100% deducted from the in-app USDT balance. 50% is virtually
  //         allocated as WTA tokens (recorded in user_token_purchases); the
  //         other 50% earns daily ROI. Admin later deposits the token-half
  //         funds into the contract.
  // Risky → 100% earns daily ROI (no token purchase), paid from the in-app wallet.
  const tokenPurchaseAmount = isSafe ? amount * 0.5 : 0;
  // Full amount is always deducted from the in-app wallet for both types.
  const usdtAmount = amount;
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

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  // Generate a unique pending reference for the Safe Invest token record.
  // This is stored atomically with the investment; replaced by the real tx hash
  // if the on-chain mint succeeds, left as-is for admin manual settlement if not.
  const virtualRef = isSafe ? `virtual:${user.id}:${Date.now()}` : "";

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

      // Record a pending token allocation for Safe Invest. The virtualRef is
      // replaced with the real on-chain transfer tx hash after the DB commit.
      if (isSafe) {
        const walletAddr = (freshUser.walletAddress || "platform").toLowerCase();
        await tx.insert(userTokenPurchasesTable).values({
          userId: user.id,
          walletAddress: walletAddr,
          txHash: virtualRef,
          usdtSpent: tokenPurchaseAmount.toString(),
          wtaReceived: "0",
          buyPrice: "0",
        });
      }

      // Auto-activate user on their first investment
      const isFirstInvestment = parseFloat(lockedUser.totalInvested) === 0;
      // For Safe Invest, only the ROI half (50%) counts toward the earnings cap
      // basis and team volume — the token half earns no daily ROI.
      const roiPrincipalAdded = isSafe ? amount * 0.5 : amount;
      await tx.update(usersTable)
        .set({
          totalInvested: (parseFloat(lockedUser.totalInvested) + roiPrincipalAdded).toString(),
          walletBalance: (latestUsdt - usdtAmount).toString(),
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
        .set({
          totalEarnings: (parseFloat(recipientUser.totalEarnings) + spotCommission).toString(),
          // Spot referral commission is an earning → credit the withdraw wallet
          withdrawBalance: (parseFloat(recipientUser.withdrawBalance ?? "0") + spotCommission).toFixed(6),
        })
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
