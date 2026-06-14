---
name: ROI additive distribution model
description: How daily ROI + level commission are computed and why the token split uses an effective fraction
---

# ROI distribution is ADDITIVE, not carved-out

Investors receive the FULL daily ROI (`principal × dailyRoiRate`). Level commission is paid ON TOP as `levelCommissionPoolPct` (a fraction like 0.5 = 50%) of that ROI, split across 10 levels. So the platform distributes `ROI × (1 + pct)` total each day (e.g. 0.4% investor + 0.2% levels = 0.6%).

**Why:** the user's mental model is "investor gets 0.4%, levels get an extra 50% of that on top" — earlier the engine carved level commission OUT of the daily rate (investor got less than the headline rate), which was wrong for them.

# Per-level rates are a DIRECT % of ROI, and the pool is their SUM (Model A)

Each `levelCommL1..L10` setting is a direct fraction of the investor's ROI (e.g. L1=0.20 ⇒ L1 earns 20% of ROI). `levelCommissionPoolPct` is NOT an independent input — it is DERIVED as the sum of the 10 level rates (loadEligibility computes `Object.values(cfg.levelRates).reduce(sum)`; admin PUT stores the same sum so GET stays consistent). Example set: 20/10/5/5/3/2/2/1/1/1 = 50%.

**Why:** the user enters the per-level numbers directly and the total must equal their sum — they did NOT want to rescale to "% of pool" (the older model required per-level rates to sum to 100% of the pool, so L1 had to be entered as 40 to mean 20% of ROI). Confusing and error-prone.

**How to apply:** in `simulateDistribution`, convert each direct rate to a share of the level pool with `poolFrac = levelRate / levelCommissionPoolPct` (guarded for sum=0), then `commissionWei0 = levelPoolWei × poolFrac` and `commissionUsd0 = usdShare × effPoolPct × poolFrac` (= `usdShare × levelRate/(1+sum)` = exact direct % of ROI). The poolFracs sum to 1.0, so the whole pool distributes; rounding dust → reserve. The AdminSettings "Total Level Commission" field is read-only, computed live from the 10 inputs.

**How to apply (in `simulateDistribution`, tokenPayout.ts):**
- The bought tokens fund the TOTAL (ROI + commission). To split them, use the EFFECTIVE pool fraction `effPoolPct = pct/(1+pct)` — investors get `1/(1+pct)`, level pool gets `pct/(1+pct)`. Do NOT feed the raw pct into the token split.
- Keep the RAW pct for `expectedDailyUsd = principal × dailyRoiRate × (1+pct)` (the funding minimum) and for the preview's `expectedInvestorUsd` / `expectedLevelUsd`.
- `dailyRoiRate` is the INVESTOR rate; "Expected ROI Today" in the UI shows investor ROI, not the total.

# Supply conservation must be by construction
- Never round investor and level shares with two independent bps values (they can sum to >10000 and over-allocate). Derive one as the remainder: `levelPoolWei = grossWei - investorWei0`.
- Cap each per-level commission by the remaining pool (`remainingPool = levelPoolWei - distributedWei`) so cumulative commissions can't exceed the pool even if configured level rates sum >100%.
- These two guarantees keep `reserveAddWei = tokensBought - roiTotal - levelTotal >= 0` always; the `if (<0) =0` clamp then never actually fires.
