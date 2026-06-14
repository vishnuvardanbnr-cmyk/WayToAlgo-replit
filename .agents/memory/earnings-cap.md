---
name: Earnings cap (ROI + level)
description: How the per-user earnings ceiling on ROI + level commission is enforced in the token distribution engine.
---

# Earnings cap (ROI + level combined)

A user earns at most `multiplier × personal investment` from Trading Profit (ROI,
token_rewards type `roi`) + Team Benefit (level commission, type `level`) **combined**.
Spot referral income is **not** capped. Admins are uncapped. A platform toggle
(`earningsCapEnabled`) plus `earningsCapBase` (default 2) and `earningsCapBoosted`
(default 3) live on `platform_settings`.

- **Boost trigger:** multiplier = boosted when a user's *direct* (level-1) referrals'
  total invested volume is *strictly greater* than the user's own personal investment;
  else base.
- **Earned basis:** cumulative earned for the cap is the sum of `token_rewards.usd_value`
  where `type IN ('roi','level')` — NOT `users.total_earnings` (that includes spot referral).
  **Why:** the cap is ROI+level only; using total_earnings would wrongly count spot income.
- **Engine behavior:** fully-capped investors are excluded from the eligible ROI base
  (so the daily minimum + proportional split reflect only principal that can still earn);
  partially-capped users are paid up to their remaining allowance and the clamped-off
  tokens roll into the platform reserve via the existing supply-conservation remainder
  (`reserveAddWei = bought − roi − level`). Recomputed every distribution run (dynamic).
- **Per-run atomicity:** a single `runningEarned` map (seeded from historical totals)
  is used so multiple credits to the same user within one run can't collectively exceed
  the cap. Clamp math uses exact bigint micro-USD scaling, not float, to avoid drift.

**How to apply:** any new income type that should count toward the cap must write a
`token_rewards` row with the right `type` and a correct `usd_value`; anything that should
NOT count (like spot) must stay out of those two types. `/income/summary` recomputes the
same cap for display, so keep its logic in lockstep with `tokenPayout.ts`.
