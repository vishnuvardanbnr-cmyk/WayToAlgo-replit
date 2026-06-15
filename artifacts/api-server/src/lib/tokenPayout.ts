import { ethers } from "ethers";
import {
  db,
  investmentsTable,
  usersTable,
  platformSettingsTable,
  tokenBuyBatchesTable,
  tokenRewardsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { resolveKey } from "./keyEncryption.js";
import {
  buyTokens,
  isValidAddress,
  getTokenPrices,
  getPlatformBalances,
  TOKEN_DECIMALS,
} from "./tokenChain";
import {
  capSettingsFrom,
  buildDirectVolumeMap,
  loadRoiLevelEarnedMap,
  capForUser,
} from "./earningsCap";

export type DistributeMode = "buy" | "held";

function levelConfig(s: typeof platformSettingsTable.$inferSelect) {
  return {
    coolingHours: s.withdrawalCoolingHours ?? 24,
    levelRates: {
      1: parseFloat(s.levelCommL1), 2: parseFloat(s.levelCommL2), 3: parseFloat(s.levelCommL3),
      4: parseFloat(s.levelCommL4), 5: parseFloat(s.levelCommL5), 6: parseFloat(s.levelCommL6),
      7: parseFloat(s.levelCommL7), 8: parseFloat(s.levelCommL8),
      9: parseFloat(s.levelCommL9), 10: parseFloat(s.levelCommL10),
    } as Record<number, number>,
    levelUnlocks: {
      1: 0, 2: parseFloat(s.levelUnlockL2), 3: parseFloat(s.levelUnlockL3), 4: parseFloat(s.levelUnlockL4),
      5: parseFloat(s.levelUnlockL5), 6: parseFloat(s.levelUnlockL6), 7: parseFloat(s.levelUnlockL7),
      8: parseFloat(s.levelUnlockL8), 9: parseFloat(s.levelUnlockL9), 10: parseFloat(s.levelUnlockL10),
    } as Record<number, number>,
    levelDays: {
      1: s.levelDaysL1, 2: s.levelDaysL2, 3: s.levelDaysL3, 4: s.levelDaysL4,
      5: s.levelDaysL5, 6: s.levelDaysL6, 7: s.levelDaysL7, 8: s.levelDaysL8,
      9: s.levelDaysL9, 10: s.levelDaysL10,
    } as Record<number, number>,
    levelDirects: {
      1: s.levelDirectsL1, 2: s.levelDirectsL2, 3: s.levelDirectsL3, 4: s.levelDirectsL4,
      5: s.levelDirectsL5, 6: s.levelDirectsL6, 7: s.levelDirectsL7, 8: s.levelDirectsL8,
      9: s.levelDirectsL9, 10: s.levelDirectsL10,
    } as Record<number, number>,
  };
}

// Count, per user, how many of their DIRECT (level-1) referrals are active
// investors — "active" meaning the referral has actually invested
// (totalInvested > 0). Used to gate level-commission eligibility.
function buildActiveDirectsMap(
  allUsers: { id: number; sponsorId: number | null; totalInvested: string }[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const u of allUsers) {
    if (u.sponsorId == null) continue;
    const invested = parseFloat(u.totalInvested ?? "0") || 0;
    if (invested > 0) map.set(u.sponsorId, (map.get(u.sponsorId) ?? 0) + 1);
  }
  return map;
}

// Mirror dailyPayout.buildTeamBusinessVolumeMap (downline totalInvested sum).
function buildTeamVolumeMap(
  allUsers: { id: number; sponsorId: number | null; totalInvested: string }[],
): Map<number, number> {
  const children = new Map<number, number[]>();
  const invested = new Map<number, number>();
  for (const u of allUsers) {
    invested.set(u.id, parseFloat(u.totalInvested ?? "0") || 0);
    if (u.sponsorId != null) {
      const arr = children.get(u.sponsorId) ?? [];
      arr.push(u.id);
      children.set(u.sponsorId, arr);
    }
  }
  function teamVolume(userId: number): number {
    let vol = 0;
    const stack = [...(children.get(userId) ?? [])];
    while (stack.length > 0) {
      const cid = stack.pop()!;
      vol += invested.get(cid) ?? 0;
      for (const gc of children.get(cid) ?? []) stack.push(gc);
    }
    return vol;
  }
  const map = new Map<number, number>();
  for (const u of allUsers) map.set(u.id, teamVolume(u.id));
  return map;
}

type SettingsRow = typeof platformSettingsTable.$inferSelect;
type UserRow = typeof usersTable.$inferSelect;
type InvestmentRow = typeof investmentsTable.$inferSelect;

interface Eligibility {
  eligible: InvestmentRow[];
  userById: Map<number, UserRow>;
  teamVolumeMap: Map<number, number>;
  activeDirectsMap: Map<number, number>;
  principalMicro: Map<number, bigint>; // investmentId -> micro-USD of ROI principal
  totalMicro: bigint;
  investorIds: Set<number>;
  cfg: ReturnType<typeof levelConfig>;
  levelCommissionPoolPct: number;
  // Earnings cap
  capEnabled: boolean;
  capMap: Map<number, number>;    // userId -> cap USD ceiling (Infinity when uncapped)
  earnedMap: Map<number, number>; // userId -> cumulative roi+level USD earned (prior rounds)
  cappedInvestorCount: number;    // investors excluded today because they already hit their cap
}

/**
 * Determine which investments are eligible to receive ROI right now:
 *  - status "active"
 *  - past the withdrawal cooling window (so today's run pays the PREVIOUS day's
 *    accrued ROI; brand-new investments still cooling are excluded)
 *  - investor account is active
 * Returns everything the distribution math needs, with no chain/DB writes.
 */
async function loadEligibility(settings: SettingsRow): Promise<Eligibility> {
  const cfg = levelConfig(settings);
  // Model A: each per-level rate IS a direct fraction of ROI; the total level
  // commission pool = the sum of the 10 level rates. Investors always receive the
  // full ROI and levels are paid on top, so this sum drives the additive funding
  // (the platform buys ROI × (1 + sum) worth of tokens each day).
  const levelCommissionPoolPct = Math.max(
    0,
    Object.values(cfg.levelRates).reduce((s, r) => s + (Number.isFinite(r) && r > 0 ? r : 0), 0),
  );
  const now = new Date();

  const activeInvestments = await db
    .select()
    .from(investmentsTable)
    .where(eq(investmentsTable.status, "active"));

  const advancing = activeInvestments.filter((inv) => {
    const hoursElapsed = (now.getTime() - new Date(inv.createdAt).getTime()) / 3_600_000;
    return hoursElapsed >= cfg.coolingHours;
  });

  const allUsers = await db.select().from(usersTable);
  const userById = new Map(allUsers.map((u) => [u.id, u]));
  const teamVolumeMap = buildTeamVolumeMap(
    allUsers.map((u) => ({ id: u.id, sponsorId: u.sponsorId, totalInvested: u.totalInvested })),
  );
  const activeDirectsMap = buildActiveDirectsMap(
    allUsers.map((u) => ({ id: u.id, sponsorId: u.sponsorId, totalInvested: u.totalInvested })),
  );

  // ── Earnings cap (ROI + level) ──
  // multiplier × personal investment is the ceiling; boosted when a user's direct
  // referrals' total invested exceeds their own personal investment. Recomputed each run.
  const cs = capSettingsFrom(settings);
  const earnedMap = await loadRoiLevelEarnedMap();
  const directVolumeMap = buildDirectVolumeMap(
    allUsers.map((u) => ({ id: u.id, sponsorId: u.sponsorId, totalInvested: u.totalInvested })),
  );
  const capMap = new Map<number, number>();
  for (const u of allUsers) {
    const info = capForUser(u, directVolumeMap.get(u.id) ?? 0, earnedMap.get(u.id) ?? 0, cs);
    capMap.set(u.id, info.cap);
  }

  // Exclude fully-capped users' investments from today's ROI base entirely so the
  // minimum + proportional split reflect only principal that can actually earn.
  const cappedInvestorIds = new Set<number>();
  const eligible = advancing.filter((inv) => {
    const u = userById.get(inv.userId);
    if (!u || !u.isActive) return false;
    // ROI-blocked users earn no trading profit and generate no level commission for uplines
    if (u.roiBlocked) return false;
    if (cs.enabled) {
      const cap = capMap.get(u.id) ?? Infinity;
      const earned = earnedMap.get(u.id) ?? 0;
      if (cap !== Infinity && earned + 1e-9 >= cap) { cappedInvestorIds.add(u.id); return false; }
    }
    return true;
  });

  // ROI principal per eligible investment in micro-USD (BigInt-exact proportions).
  // For Safe investments only the ROI portion (amount − tokenPurchaseAmount) earns.
  let totalMicro = 0n;
  const principalMicro = new Map<number, bigint>();
  const investorIds = new Set<number>();
  for (const inv of eligible) {
    const totalAmt = parseFloat(inv.amount);
    const tokenPurchased = parseFloat((inv as any).tokenPurchaseAmount ?? "0");
    const roiAmt = Math.max(0, totalAmt - tokenPurchased);
    const micro = BigInt(Math.round(roiAmt * 1e6));
    principalMicro.set(inv.id, micro);
    totalMicro += micro;
    investorIds.add(inv.userId);
  }

  return {
    eligible, userById, teamVolumeMap, activeDirectsMap, principalMicro, totalMicro, investorIds, cfg, levelCommissionPoolPct,
    capEnabled: cs.enabled, capMap, earnedMap, cappedInvestorCount: cappedInvestorIds.size,
  };
}

interface SimResult {
  userTokenAdd: Map<number, bigint>;
  rewardRows: {
    userId: number; type: string; tokenAmount: bigint; usdValue: number;
    level: number | null; fromUserId: number | null; fromUserName: string | null;
  }[];
  investmentUpdates: { id: number; remainingDays: number; earnedSoFar: string; status: string }[];
  roiTotalWei: bigint;
  levelTotalWei: bigint;
  reserveAddWei: bigint;
  recipients: Set<number>;
}

/**
 * Pure distribution math (no DB/chain). `tokensBoughtWei` funds the TOTAL daily payout
 * (investor ROI + level commission on top) and is divided across eligible investments
 * proportional to ROI principal. Of each investment's gross share, investors receive
 * 1/(1+pct) (the full ROI) and pct/(1+pct) forms the level-commission pool paid to
 * qualifying uplines; the level pool is the exact remainder of gross after the investor
 * share so the two always sum to gross. Also computes the remainingDays/earnedSoFar
 * advance for each eligible investment.
 */
function simulateDistribution(e: Eligibility, tokensBoughtWei: bigint, profitUsdt: number): SimResult {
  const { eligible, userById, teamVolumeMap, activeDirectsMap, principalMicro, totalMicro, cfg, levelCommissionPoolPct } = e;
  const { capEnabled, capMap, earnedMap } = e;

  const userTokenAdd = new Map<number, bigint>();
  const rewardRows: SimResult["rewardRows"] = [];
  const investmentUpdates: SimResult["investmentUpdates"] = [];
  let roiTotalWei = 0n;
  let levelTotalWei = 0n;
  let reserveAddWei = 0n;
  const recipients = new Set<number>();

  // Additive model: investors receive the FULL daily ROI and the level commission is
  // paid ON TOP as `levelCommissionPoolPct` of that ROI. The bought tokens fund the
  // TOTAL (ROI + commission), so the effective level share of the bought tokens is
  // pct/(1+pct) and investors get 1/(1+pct).
  const effPoolPct = levelCommissionPoolPct > 0 ? levelCommissionPoolPct / (1 + levelCommissionPoolPct) : 0;
  const investorBps = BigInt(Math.round((1 - effPoolPct) * 10000));

  // Running USD earned (roi + level) per user this distribution, seeded with prior totals,
  // so each credit is clamped to the user's remaining cap allowance. Clamped-off tokens are
  // left uncredited and roll into the reserve via the supply-conservation remainder below.
  const runningEarned = new Map(earnedMap);
  function clampToCap(wei: bigint, usd: number, userId: number): { wei: bigint; usd: number } {
    if (!capEnabled) return { wei, usd };
    const cap = capMap.get(userId) ?? Infinity;
    if (cap === Infinity) return { wei, usd };
    const remaining = cap - (runningEarned.get(userId) ?? 0);
    if (remaining <= 0) return { wei: 0n, usd: 0 };
    if (usd <= remaining || usd <= 0) return { wei, usd };
    // Scale wei by remaining/usd using exact bigint math (micro-USD) to avoid float drift.
    const remMicro = BigInt(Math.round(remaining * 1e6));
    const usdMicro = BigInt(Math.round(usd * 1e6));
    if (usdMicro <= 0n) return { wei, usd };
    let cw = (wei * remMicro) / usdMicro;
    if (cw < 0n) cw = 0n;
    if (cw > wei) cw = wei;
    return { wei: cw, usd: remaining };
  }

  for (const inv of eligible) {
    const investor = userById.get(inv.userId)!;
    const micro = principalMicro.get(inv.id)!;
    const grossWei = totalMicro > 0n ? (tokensBoughtWei * micro) / totalMicro : 0n;
    const usdShare = totalMicro > 0n ? profitUsdt * (Number(micro) / Number(totalMicro)) : 0;

    const newRemaining = Math.max(0, inv.remainingDays - 1);
    const isCompleted = newRemaining === 0;
    const daysElapsed = inv.durationDays - newRemaining;
    investmentUpdates.push({
      id: inv.id,
      remainingDays: newRemaining,
      earnedSoFar: (parseFloat(inv.earnedSoFar) + usdShare).toString(),
      status: isCompleted ? "completed" : "active",
    });

    if (grossWei <= 0n) continue;

    const investorWei0 = (grossWei * investorBps) / 10000n;
    const investorUsd0 = usdShare * (1 - effPoolPct);
    const { wei: investorWei, usd: investorUsd } = clampToCap(investorWei0, investorUsd0, investor.id);
    if (investorWei > 0n) {
      userTokenAdd.set(investor.id, (userTokenAdd.get(investor.id) ?? 0n) + investorWei);
      roiTotalWei += investorWei;
      recipients.add(investor.id);
      runningEarned.set(investor.id, (runningEarned.get(investor.id) ?? 0) + investorUsd);
      rewardRows.push({
        userId: investor.id, type: "roi", tokenAmount: investorWei,
        usdValue: investorUsd,
        level: null, fromUserId: null, fromUserName: null,
      });
    }

    // Level pool = exact remainder of gross after the investor share, so
    // investorWei0 + levelPoolWei === grossWei to the wei (no independent-rounding overflow).
    const levelPoolWei = grossWei - investorWei0;
    let distributedWei = 0n;

    let currentUserId: number | null = investor.sponsorId;
    let level = 1;
    while (currentUserId && level <= 10) {
      const upline = userById.get(currentUserId);
      if (!upline) break;
      if (!upline.isActive) { currentUserId = upline.sponsorId; level++; continue; }
      const maxDays = cfg.levelDays[level] ?? 0;
      if (maxDays > 0 && daysElapsed > maxDays) { currentUserId = upline.sponsorId; level++; continue; }
      const reqDirects = cfg.levelDirects[level] ?? 0;
      if (reqDirects > 0 && (activeDirectsMap.get(upline.id) ?? 0) < reqDirects) { currentUserId = upline.sponsorId; level++; continue; }
      const unlock = cfg.levelUnlocks[level] ?? 0;
      const uplineVolume = teamVolumeMap.get(upline.id) ?? 0;
      if (uplineVolume >= unlock) {
        // Each level rate is a DIRECT % of ROI; convert it to a share of THIS
        // investment's level pool (rate ÷ poolSum) so the bought tokens split correctly.
        // The shares sum to 1.0 across all levels, so the whole pool distributes.
        const poolFrac = levelCommissionPoolPct > 0 ? (cfg.levelRates[level] ?? 0) / levelCommissionPoolPct : 0;
        const rateBps = BigInt(Math.round(poolFrac * 10000));
        let commissionWei0 = (levelPoolWei * rateBps) / 10000n;
        let commissionUsd0 = usdShare * effPoolPct * poolFrac;
        // Safety net: cumulative level commissions can never exceed this investment's
        // level pool, even if configured level rates sum above 100% — keeps supply
        // conserved by construction so reserveAddWei below is always ≥ 0.
        const remainingPool = levelPoolWei - distributedWei;
        if (commissionWei0 > remainingPool) {
          const capped = remainingPool > 0n ? remainingPool : 0n;
          if (commissionWei0 > 0n) commissionUsd0 = commissionUsd0 * (Number(capped) / Number(commissionWei0));
          commissionWei0 = capped;
        }
        const { wei: commissionWei, usd: commissionUsd } = clampToCap(commissionWei0, commissionUsd0, upline.id);
        if (commissionWei > 0n) {
          userTokenAdd.set(upline.id, (userTokenAdd.get(upline.id) ?? 0n) + commissionWei);
          levelTotalWei += commissionWei;
          distributedWei += commissionWei;
          recipients.add(upline.id);
          runningEarned.set(upline.id, (runningEarned.get(upline.id) ?? 0) + commissionUsd);
          rewardRows.push({
            userId: upline.id, type: "level", tokenAmount: commissionWei,
            usdValue: commissionUsd,
            level, fromUserId: investor.id, fromUserName: investor.name || investor.email,
          });
        }
      }
      currentUserId = upline.sponsorId;
      level++;
    }

    void distributedWei; // tracked per-investment; residual rolled into reserve below
  }

  // Conserve supply exactly: everything not credited to investors or uplines
  // (unclaimed level pool + all proportional/bps rounding dust) is booked to the
  // reserve, so tokensBought === roiTotal + levelTotal + reserve to the wei.
  reserveAddWei = tokensBoughtWei - roiTotalWei - levelTotalWei;
  if (reserveAddWei < 0n) reserveAddWei = 0n;

  return { userTokenAdd, rewardRows, investmentUpdates, roiTotalWei, levelTotalWei, reserveAddWei, recipients };
}

// ── Preview ─────────────────────────────────────────────────────────────────

export interface TokenPreviewResult {
  success: boolean;
  error?: string;
  configured: boolean;
  mode: DistributeMode;
  // Eligibility (independent of amount)
  eligibleInvestments: number;
  eligibleInvestors: number;
  totalRoiPrincipalUsd: number;
  coolingHours: number;
  cappedInvestorCount: number; // investors excluded today because they hit their earnings cap
  // ROI model — investors get the full daily ROI; level commission is paid on top.
  dailyRoiRate: number;        // fraction, e.g. 0.004 = 0.4%/day (the INVESTOR rate)
  levelCommissionPct: number;  // fraction of ROI paid out as level commission, on top
  expectedInvestorUsd: number; // investor ROI = totalRoiPrincipalUsd × dailyRoiRate
  expectedLevelUsd: number;    // level commission = expectedInvestorUsd × levelCommissionPct
  expectedDailyUsd: number;    // total to distribute = investor ROI + level commission
  // Live chain context
  buyPrice?: string;
  sellPrice?: string;
  walletTokenBalance?: string;
  walletUsdtBalance?: string;
  walletAddress?: string;
  // For the entered amount
  profitUsdt?: number;
  estTokens?: string;          // tokens that will be distributed (human)
  estInvestorTokens?: string;  // investor (Trading Profit) share
  estLevelTokens?: string;     // level commission pool actually paid
  estReserveTokens?: string;   // unclaimed level tokens → reserve
  recipientCount?: number;     // distinct users who would receive tokens
  // Sufficiency checks
  sufficientUsdt?: boolean;    // buy mode: withdraw wallet has enough USDT
  sufficientTokens?: boolean;  // held mode: withdraw wallet holds enough tokens
}

/**
 * Compute what a distribution of `profitUsdt` (USDT) would look like WITHOUT
 * touching the chain or DB. `profitUsdt` may be 0/undefined to fetch eligibility
 * + live context only. Token quantity is derived at the current buy price for
 * both modes so the two paths are equivalent for the same dollar input.
 */
export async function previewTokenDistribution(
  profitUsdt: number,
  mode: DistributeMode,
): Promise<TokenPreviewResult> {
  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) {
    return { success: false, configured: false, mode, error: "Platform settings not configured",
      eligibleInvestments: 0, eligibleInvestors: 0, totalRoiPrincipalUsd: 0, coolingHours: 24,
      cappedInvestorCount: 0, dailyRoiRate: 0, levelCommissionPct: 0,
      expectedInvestorUsd: 0, expectedLevelUsd: 0, expectedDailyUsd: 0 };
  }

  const contractAddress = (settings.tokenContractAddress || "").trim();
  const configured = isValidAddress(contractAddress);

  const e = await loadEligibility(settings);
  const totalRoiPrincipalUsd = Number(e.totalMicro) / 1e6;
  const dailyRoiRate = parseFloat(settings.dailyRoiRate ?? "0") || 0;
  const levelCommissionPct = e.levelCommissionPoolPct;
  const expectedInvestorUsd = totalRoiPrincipalUsd * dailyRoiRate;
  const expectedLevelUsd = expectedInvestorUsd * levelCommissionPct;
  const out: TokenPreviewResult = {
    success: true,
    configured,
    mode,
    eligibleInvestments: e.eligible.length,
    eligibleInvestors: e.investorIds.size,
    totalRoiPrincipalUsd,
    coolingHours: e.cfg.coolingHours,
    cappedInvestorCount: e.cappedInvestorCount,
    dailyRoiRate,
    levelCommissionPct,
    expectedInvestorUsd,
    expectedLevelUsd,
    expectedDailyUsd: expectedInvestorUsd + expectedLevelUsd,
  };

  if (!configured) {
    out.error = "Token contract address is not configured";
    return out;
  }

  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";
  const withdrawKey = resolveKey(settings.withdrawWalletPrivateKey);

  let buyPriceNum = 0;
  try {
    const prices = await getTokenPrices(contractAddress, rpcUrl);
    out.buyPrice = prices.buyPrice;
    out.sellPrice = prices.sellPrice;
    buyPriceNum = parseFloat(prices.buyPrice);
  } catch {
    /* price read failed — non-fatal for preview */
  }

  let walletTokenWei = 0n;
  let walletUsdtWei = 0n;
  if (withdrawKey) {
    try {
      const bal = await getPlatformBalances(contractAddress, withdrawKey, rpcUrl);
      walletTokenWei = bal.tokenWei;
      walletUsdtWei = bal.usdtWei;
      out.walletAddress = bal.address;
      out.walletTokenBalance = ethers.formatUnits(bal.tokenWei, TOKEN_DECIMALS);
      out.walletUsdtBalance = ethers.formatUnits(bal.usdtWei, 18);
    } catch {
      /* balance read failed — non-fatal */
    }
  }

  if (Number.isFinite(profitUsdt) && profitUsdt > 0) {
    out.profitUsdt = profitUsdt;

    if (buyPriceNum > 0) {
      const tokensWei = ethers.parseUnits((profitUsdt / buyPriceNum).toFixed(18), TOKEN_DECIMALS);
      const sim = simulateDistribution(e, tokensWei, profitUsdt);
      out.estTokens = ethers.formatUnits(tokensWei, TOKEN_DECIMALS);
      out.estInvestorTokens = ethers.formatUnits(sim.roiTotalWei, TOKEN_DECIMALS);
      out.estLevelTokens = ethers.formatUnits(sim.levelTotalWei, TOKEN_DECIMALS);
      out.estReserveTokens = ethers.formatUnits(sim.reserveAddWei, TOKEN_DECIMALS);
      out.recipientCount = sim.recipients.size;
      out.sufficientTokens = walletTokenWei >= tokensWei;
    }

    // buy mode: need enough USDT in the withdraw wallet to fund the buy
    const usdtNeededWei = ethers.parseUnits(profitUsdt.toFixed(6), 18);
    out.sufficientUsdt = walletUsdtWei >= usdtNeededWei;
  }

  return out;
}

// ── Distribute ──────────────────────────────────────────────────────────────

export interface TokenDistributeResult {
  success: boolean;
  error?: string;
  batchId?: number;
  txHash?: string;
  source?: DistributeMode;
  usdtSpent?: number;
  tokensBought?: string;
  roiTokenTotal?: string;
  levelTokenTotal?: string;
  recipientCount?: number;
  eligibleInvestments?: number;
}

/**
 * The ROI engine. Admin enters the day's trading profit (USDT).
 *
 *  mode "buy"  → execute a REAL on-chain buy for `profitUsdt` from the withdraw
 *                wallet (raising the live price), then distribute those tokens.
 *  mode "held" → distribute tokens the admin has ALREADY sent to the withdraw
 *                wallet. We convert `profitUsdt` to a token quantity at the
 *                current buy price and verify the wallet holds enough — no buy,
 *                no transfer (admin funds the wallet manually).
 *
 * In both modes the tokens are distributed VIRTUALLY, proportional to each
 * eligible investment's ROI principal, carving level commissions to qualifying
 * uplines. Rewards land in users.roiTokenBalance (+ tradingProfit/teamBenefit
 * sub-balances) and token_rewards rows. They become withdrawable USDT only when
 * the user sells them on the Wallet page.
 */
// In-process guard: distributions are a manual single-admin action; serialising
// them prevents a TOCTOU where two concurrent runs both pass the held-mode
// balance check (or double-spend in buy mode) and over-assign tokens.
let distributionInProgress = false;

export async function runTokenDistribute(
  profitUsdt: number,
  mode: DistributeMode,
): Promise<TokenDistributeResult> {
  if (distributionInProgress) {
    return { success: false, error: "Another distribution is already running — please wait for it to finish." };
  }
  distributionInProgress = true;
  try {
    return await _runTokenDistribute(profitUsdt, mode);
  } finally {
    distributionInProgress = false;
  }
}

async function _runTokenDistribute(
  profitUsdt: number,
  mode: DistributeMode,
): Promise<TokenDistributeResult> {
  if (!Number.isFinite(profitUsdt) || profitUsdt <= 0) {
    return { success: false, error: "Profit amount must be a positive number" };
  }

  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) return { success: false, error: "Platform settings not configured" };

  const contractAddress = (settings.tokenContractAddress || "").trim();
  if (!isValidAddress(contractAddress)) {
    return { success: false, error: "Token contract address is not configured" };
  }
  const withdrawKey = resolveKey(settings.withdrawWalletPrivateKey);
  const gasKey = resolveKey(settings.gasWalletPrivateKey);
  if (!withdrawKey) {
    return { success: false, error: "Withdraw wallet must be configured" };
  }
  // Held mode performs no on-chain transaction, so it doesn't need a gas wallet.
  if (mode === "buy" && !gasKey) {
    return { success: false, error: "Gas wallet must be configured to buy tokens on-chain" };
  }
  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";

  // ── 1. Eligibility BEFORE acting so we never act with nobody to pay ──
  const e = await loadEligibility(settings);
  if (e.eligible.length === 0) {
    return { success: false, error: "No eligible active investments to distribute to (check cooling period and active investors)" };
  }
  if (e.totalMicro <= 0n) {
    return { success: false, error: "Eligible investment principal is zero" };
  }

  // ── Daily payout minimum (additive model) ──
  // The admin may distribute the same or more than this amount, but never less.
  // Required = investor ROI (eligible principal × dailyRoiRate) + level commission on top
  // (pct of that ROI). Any excess is recorded as "extra".
  const dailyRoiRate = parseFloat(settings.dailyRoiRate ?? "0") || 0;
  const pct = e.levelCommissionPoolPct;
  const investorRoiUsd = (Number(e.totalMicro) / 1e6) * dailyRoiRate;
  const expectedDailyUsd = investorRoiUsd * (1 + pct); // investor ROI + level commission on top
  if (expectedDailyUsd > 0 && profitUsdt + 1e-6 < expectedDailyUsd) {
    return {
      success: false,
      error: `Amount is below the required daily minimum of $${expectedDailyUsd.toFixed(2)} — investor ROI $${investorRoiUsd.toFixed(2)} (principal × ${(dailyRoiRate * 100).toFixed(3)}%/day) plus ${(pct * 100).toFixed(0)}% level commission $${(investorRoiUsd * pct).toFixed(2)}. Enter at least that much.`,
    };
  }

  // Live price (needed to record buyPrice, and to convert $→tokens in held mode)
  let buyPrice = "0";
  let buyPriceNum = 0;
  try {
    const prices = await getTokenPrices(contractAddress, rpcUrl);
    buyPrice = prices.buyPrice;
    buyPriceNum = parseFloat(prices.buyPrice);
  } catch {
    /* non-fatal for buy mode (price is informational); fatal for held mode below */
  }

  // ── 2. Determine tokens to distribute ──
  let tokensBoughtWei: bigint;
  let buyTxHash: string | null = null;
  let batchId: number;

  if (mode === "held") {
    if (buyPriceNum <= 0) {
      return { success: false, error: "Could not read the live token price needed to convert USDT to tokens" };
    }
    tokensBoughtWei = ethers.parseUnits((profitUsdt / buyPriceNum).toFixed(18), TOKEN_DECIMALS);

    // Verify the withdraw wallet already holds enough tokens (admin funds it).
    try {
      const bal = await getPlatformBalances(contractAddress, withdrawKey, rpcUrl);
      if (bal.tokenWei < tokensBoughtWei) {
        return {
          success: false,
          error: `Withdraw wallet holds ${ethers.formatUnits(bal.tokenWei, TOKEN_DECIMALS)} tokens but ${ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS)} are needed. Send more tokens to the withdraw wallet first.`,
        };
      }
    } catch (err: any) {
      return { success: false, error: `Could not read withdraw wallet token balance: ${err?.shortMessage || err?.message || "RPC error"}` };
    }

    const [batch] = await db.insert(tokenBuyBatchesTable).values({
      usdtSpent: profitUsdt.toString(),
      expectedUsdt: expectedDailyUsd.toFixed(6),
      source: "held",
      buyPrice,
      status: "pending",
    }).returning();
    batchId = batch.id;
  } else {
    // buy mode — record a pending batch first so a failed buy is audited
    const [batch] = await db.insert(tokenBuyBatchesTable).values({
      usdtSpent: profitUsdt.toString(),
      expectedUsdt: expectedDailyUsd.toFixed(6),
      source: "buy",
      status: "pending",
    }).returning();
    batchId = batch.id;

    const buy = await buyTokens(profitUsdt, contractAddress, withdrawKey, gasKey, rpcUrl);
    if (!buy.success || !buy.tokensBought) {
      await db.update(tokenBuyBatchesTable)
        .set({ status: "failed", note: buy.error ?? "Buy failed", buyTxHash: buy.txHash ?? null, buyPrice })
        .where(eq(tokenBuyBatchesTable.id, batchId));
      return { success: false, error: buy.error ?? "On-chain buy failed", batchId, source: "buy" };
    }
    tokensBoughtWei = buy.tokensBought;
    buyTxHash = buy.txHash ?? null;
  }

  // ── 3. Compute distribution (pure) ──
  const sim = simulateDistribution(e, tokensBoughtWei, profitUsdt);

  // ── 4. Apply everything in one transaction ──
  try {
    await db.transaction(async (tx) => {
      for (const upd of sim.investmentUpdates) {
        await tx.update(investmentsTable)
          .set({ remainingDays: upd.remainingDays, earnedSoFar: upd.earnedSoFar, status: upd.status })
          .where(eq(investmentsTable.id, upd.id));
      }
      for (const [userId, addWei] of sim.userTokenAdd.entries()) {
        const u = e.userById.get(userId)!;
        const current = ethers.parseUnits((u.roiTokenBalance || "0"), TOKEN_DECIMALS);
        const next = current + addWei;

        const roiTokenWei = sim.rewardRows
          .filter(r => r.userId === userId && r.type === "roi")
          .reduce((s, r) => s + r.tokenAmount, 0n);
        const levelTokenWei = sim.rewardRows
          .filter(r => r.userId === userId && r.type === "level")
          .reduce((s, r) => s + r.tokenAmount, 0n);

        const newTradingBal = roiTokenWei > 0n
          ? (parseFloat(u.tradingProfitBalance || "0") + parseFloat(ethers.formatUnits(roiTokenWei, TOKEN_DECIMALS))).toFixed(6)
          : u.tradingProfitBalance;
        const newTeamBal = levelTokenWei > 0n
          ? (parseFloat(u.teamBenefitBalance || "0") + parseFloat(ethers.formatUnits(levelTokenWei, TOKEN_DECIMALS))).toFixed(6)
          : u.teamBenefitBalance;

        const usdShare = (Number(addWei) / Number(tokensBoughtWei)) * profitUsdt;

        await tx.update(usersTable)
          .set({
            roiTokenBalance: ethers.formatUnits(next, TOKEN_DECIMALS),
            tradingProfitBalance: newTradingBal,
            teamBenefitBalance: newTeamBal,
            totalEarnings: (parseFloat(u.totalEarnings || "0") + usdShare).toFixed(6),
          })
          .where(eq(usersTable.id, userId));
      }
      if (sim.rewardRows.length > 0) {
        await tx.insert(tokenRewardsTable).values(
          sim.rewardRows.map((r) => ({
            userId: r.userId,
            batchId,
            type: r.type,
            tokenAmount: ethers.formatUnits(r.tokenAmount, TOKEN_DECIMALS),
            usdValue: r.usdValue.toFixed(6),
            level: r.level,
            fromUserId: r.fromUserId,
            fromUserName: r.fromUserName,
          })),
        );
      }
      if (sim.reserveAddWei > 0n) {
        const [ps] = await tx.select().from(platformSettingsTable).limit(1);
        if (ps) {
          const currentReserve = parseFloat(ps.reserveTokenBalance ?? "0");
          const addReserve = parseFloat(ethers.formatUnits(sim.reserveAddWei, TOKEN_DECIMALS));
          await tx.update(platformSettingsTable)
            .set({ reserveTokenBalance: (currentReserve + addReserve).toFixed(8) })
            .where(eq(platformSettingsTable.id, ps.id));
        }
      }
      await tx.update(tokenBuyBatchesTable)
        .set({
          status: "completed",
          buyTxHash,
          buyPrice,
          tokensBought: ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS),
          roiTokenTotal: ethers.formatUnits(sim.roiTotalWei, TOKEN_DECIMALS),
          levelTokenTotal: ethers.formatUnits(sim.levelTotalWei, TOKEN_DECIMALS),
          recipientCount: sim.recipients.size,
        })
        .where(eq(tokenBuyBatchesTable.id, batchId));
    });
  } catch (err: any) {
    logger.error({ err, batchId }, "Token distribution DB transaction failed");
    await db.update(tokenBuyBatchesTable)
      .set({
        status: "failed",
        note: `Distribution failed: ${err?.message}`,
        buyTxHash,
      })
      .where(eq(tokenBuyBatchesTable.id, batchId));
    return {
      success: false,
      error: mode === "buy"
        ? "On-chain buy succeeded but distribution failed — see batch note. No tokens were credited."
        : "Distribution failed — see batch note. No tokens were credited.",
      batchId,
      txHash: buyTxHash ?? undefined,
      source: mode,
    };
  }

  logger.info(
    { batchId, mode, recipients: sim.recipients.size, eligible: e.eligible.length },
    "Token distribute completed",
  );

  return {
    success: true,
    batchId,
    txHash: buyTxHash ?? undefined,
    source: mode,
    usdtSpent: profitUsdt,
    tokensBought: ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS),
    roiTokenTotal: ethers.formatUnits(sim.roiTotalWei, TOKEN_DECIMALS),
    levelTokenTotal: ethers.formatUnits(sim.levelTotalWei, TOKEN_DECIMALS),
    recipientCount: sim.recipients.size,
    eligibleInvestments: e.eligible.length,
  };
}

/** Backward-compatible wrapper: original buy-and-distribute behaviour. */
export function runTokenBuyAndDistribute(profitUsdt: number): Promise<TokenDistributeResult> {
  return runTokenDistribute(profitUsdt, "buy");
}

/**
 * MetaMask-based distribution: the admin already executed the on-chain buy
 * in their browser. We receive the resulting token quantity + tx hash and do
 * only the virtual in-DB distribution — no private key or chain write needed.
 */
export async function runTokenDistributeMetaMask(
  profitUsdt: number,
  tokensBoughtWei: bigint,
  buyTxHash: string,
): Promise<TokenDistributeResult> {
  if (distributionInProgress) {
    return { success: false, error: "Another distribution is already running — please wait." };
  }
  distributionInProgress = true;
  try {
    return await _runTokenDistributeMetaMask(profitUsdt, tokensBoughtWei, buyTxHash);
  } finally {
    distributionInProgress = false;
  }
}

async function _runTokenDistributeMetaMask(
  profitUsdt: number,
  tokensBoughtWei: bigint,
  buyTxHash: string,
): Promise<TokenDistributeResult> {
  if (!Number.isFinite(profitUsdt) || profitUsdt <= 0) {
    return { success: false, error: "Profit amount must be a positive number" };
  }
  if (tokensBoughtWei <= 0n) {
    return { success: false, error: "Token amount must be positive" };
  }

  const [settings] = await db.select().from(platformSettingsTable).limit(1);
  if (!settings) return { success: false, error: "Platform settings not configured" };

  const contractAddress = (settings.tokenContractAddress || "").trim();
  if (!isValidAddress(contractAddress)) {
    return { success: false, error: "Token contract address is not configured" };
  }
  const rpcUrl = settings.bscRpcUrl || "https://bsc-dataseed.binance.org/";

  const e = await loadEligibility(settings);
  if (e.eligible.length === 0) {
    return { success: false, error: "No eligible active investments to distribute to (check cooling period and active investors)" };
  }
  if (e.totalMicro <= 0n) {
    return { success: false, error: "Eligible investment principal is zero" };
  }

  const dailyRoiRate = parseFloat(settings.dailyRoiRate ?? "0") || 0;
  const pct = e.levelCommissionPoolPct;
  const investorRoiUsd = (Number(e.totalMicro) / 1e6) * dailyRoiRate;
  const expectedDailyUsd = investorRoiUsd * (1 + pct);
  if (expectedDailyUsd > 0 && profitUsdt + 1e-6 < expectedDailyUsd) {
    return {
      success: false,
      error: `Amount is below the required daily minimum of $${expectedDailyUsd.toFixed(2)}.`,
    };
  }

  let buyPrice = "0";
  try {
    const prices = await getTokenPrices(contractAddress, rpcUrl);
    buyPrice = prices.buyPrice;
  } catch { /* non-fatal — price is informational */ }

  const [batch] = await db.insert(tokenBuyBatchesTable).values({
    usdtSpent: profitUsdt.toString(),
    expectedUsdt: expectedDailyUsd.toFixed(6),
    source: "buy",
    buyTxHash,
    buyPrice,
    status: "pending",
  }).returning();
  const batchId = batch.id;

  const sim = simulateDistribution(e, tokensBoughtWei, profitUsdt);

  try {
    await db.transaction(async (tx) => {
      for (const upd of sim.investmentUpdates) {
        await tx.update(investmentsTable)
          .set({ remainingDays: upd.remainingDays, earnedSoFar: upd.earnedSoFar, status: upd.status })
          .where(eq(investmentsTable.id, upd.id));
      }
      for (const [userId, addWei] of sim.userTokenAdd.entries()) {
        const u = e.userById.get(userId)!;
        const current = ethers.parseUnits((u.roiTokenBalance || "0"), TOKEN_DECIMALS);
        const next = current + addWei;
        const roiTokenWei = sim.rewardRows.filter(r => r.userId === userId && r.type === "roi").reduce((s, r) => s + r.tokenAmount, 0n);
        const levelTokenWei = sim.rewardRows.filter(r => r.userId === userId && r.type === "level").reduce((s, r) => s + r.tokenAmount, 0n);
        const newTradingBal = roiTokenWei > 0n ? (parseFloat(u.tradingProfitBalance || "0") + parseFloat(ethers.formatUnits(roiTokenWei, TOKEN_DECIMALS))).toFixed(6) : u.tradingProfitBalance;
        const newTeamBal = levelTokenWei > 0n ? (parseFloat(u.teamBenefitBalance || "0") + parseFloat(ethers.formatUnits(levelTokenWei, TOKEN_DECIMALS))).toFixed(6) : u.teamBenefitBalance;
        const usdShare = (Number(addWei) / Number(tokensBoughtWei)) * profitUsdt;
        await tx.update(usersTable).set({
          roiTokenBalance: ethers.formatUnits(next, TOKEN_DECIMALS),
          tradingProfitBalance: newTradingBal,
          teamBenefitBalance: newTeamBal,
          totalEarnings: (parseFloat(u.totalEarnings || "0") + usdShare).toFixed(6),
        }).where(eq(usersTable.id, userId));
      }
      if (sim.rewardRows.length > 0) {
        await tx.insert(tokenRewardsTable).values(
          sim.rewardRows.map((r) => ({
            userId: r.userId, batchId, type: r.type,
            tokenAmount: ethers.formatUnits(r.tokenAmount, TOKEN_DECIMALS),
            usdValue: r.usdValue.toFixed(6),
            level: r.level, fromUserId: r.fromUserId, fromUserName: r.fromUserName,
          })),
        );
      }
      if (sim.reserveAddWei > 0n) {
        const [ps] = await tx.select().from(platformSettingsTable).limit(1);
        if (ps) {
          const currentReserve = parseFloat(ps.reserveTokenBalance ?? "0");
          const addReserve = parseFloat(ethers.formatUnits(sim.reserveAddWei, TOKEN_DECIMALS));
          await tx.update(platformSettingsTable)
            .set({ reserveTokenBalance: (currentReserve + addReserve).toFixed(8) })
            .where(eq(platformSettingsTable.id, ps.id));
        }
      }
      await tx.update(tokenBuyBatchesTable).set({
        status: "completed",
        buyTxHash,
        buyPrice,
        tokensBought: ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS),
        roiTokenTotal: ethers.formatUnits(sim.roiTotalWei, TOKEN_DECIMALS),
        levelTokenTotal: ethers.formatUnits(sim.levelTotalWei, TOKEN_DECIMALS),
        recipientCount: sim.recipients.size,
      }).where(eq(tokenBuyBatchesTable.id, batchId));
    });
  } catch (err: any) {
    logger.error({ err, batchId }, "MetaMask token distribution DB transaction failed");
    await db.update(tokenBuyBatchesTable)
      .set({ status: "failed", note: `Distribution failed: ${err?.message}`, buyTxHash })
      .where(eq(tokenBuyBatchesTable.id, batchId));
    return {
      success: false,
      error: "On-chain buy succeeded but distribution failed — see batch note. No tokens were credited.",
      batchId, txHash: buyTxHash, source: "buy",
    };
  }

  logger.info({ batchId, recipients: sim.recipients.size, eligible: e.eligible.length }, "MetaMask token distribute completed");

  return {
    success: true, batchId, txHash: buyTxHash, source: "buy",
    usdtSpent: profitUsdt,
    tokensBought: ethers.formatUnits(tokensBoughtWei, TOKEN_DECIMALS),
    roiTokenTotal: ethers.formatUnits(sim.roiTotalWei, TOKEN_DECIMALS),
    levelTokenTotal: ethers.formatUnits(sim.levelTotalWei, TOKEN_DECIMALS),
    recipientCount: sim.recipients.size,
    eligibleInvestments: e.eligible.length,
  };
}
