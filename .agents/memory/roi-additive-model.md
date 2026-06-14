---
name: ROI additive distribution model
description: How daily ROI + level commission are computed and why the token split uses an effective fraction
---

# ROI distribution is ADDITIVE, not carved-out

Investors receive the FULL daily ROI (`principal × dailyRoiRate`). Level commission is paid ON TOP as `levelCommissionPoolPct` (the raw setting, a fraction like 0.5 = 50%) of that ROI, split across 10 levels by per-level rates. So the platform distributes `ROI × (1 + pct)` total each day (e.g. 0.4% investor + 0.2% levels = 0.6%).

**Why:** the user's mental model is "investor gets 0.4%, levels get an extra 50% of that on top" — earlier the engine carved level commission OUT of the daily rate (investor got less than the headline rate), which was wrong for them.

**How to apply (in `simulateDistribution`, tokenPayout.ts):**
- The bought tokens fund the TOTAL (ROI + commission). To split them, use the EFFECTIVE pool fraction `effPoolPct = pct/(1+pct)` — investors get `1/(1+pct)`, level pool gets `pct/(1+pct)`. Do NOT feed the raw pct into the token split.
- Keep the RAW pct for `expectedDailyUsd = principal × dailyRoiRate × (1+pct)` (the funding minimum) and for the preview's `expectedInvestorUsd` / `expectedLevelUsd`.
- `dailyRoiRate` is the INVESTOR rate; "Expected ROI Today" in the UI shows investor ROI, not the total.

# Supply conservation must be by construction
- Never round investor and level shares with two independent bps values (they can sum to >10000 and over-allocate). Derive one as the remainder: `levelPoolWei = grossWei - investorWei0`.
- Cap each per-level commission by the remaining pool (`remainingPool = levelPoolWei - distributedWei`) so cumulative commissions can't exceed the pool even if configured level rates sum >100%.
- These two guarantees keep `reserveAddWei = tokensBought - roiTotal - levelTotal >= 0` always; the `if (<0) =0` clamp then never actually fires.
