---
name: Rank engine (configurable ranks + timed monthly rewards)
description: Qualification math, payout concurrency model, and timing decisions for the Ranks & Rewards system.
---

# Rank engine

Configurable ranks: per-rank self-invest min, direct-business min, team-business min,
leg caps (default 40/30/30), monthly reward amount, and number of months. Admin sets
the structured fields; the server auto-derives the display `criteria`/`reward` strings.

## Qualification math
- **Direct business** = combined PERSONAL invested of the user's direct referrals only
  (not their downlines).
- **Balanced legs** = each direct's WHOLE-TEAM volume (self + entire downline), sorted
  desc. Counted toward the team requirement with caps: top leg ≤ topPct% of the team
  requirement, 2nd ≤ secondPct%, all remaining legs combined ≤ restPct%. This prevents
  one big leg from satisfying the whole requirement.
- Auto-promotion is **upward only / sticky** — never auto-demoted even if team later dips.

## Payout model — why it's built this way
- Reward credited to **withdrawBalance** (the only withdrawable wallet) + totalEarnings,
  with an income row of type `rank_bonus`.
- **Full-term payout**: the payout phase does NOT re-check qualification, so a schedule
  keeps paying all its months even if the team dips after promotion.
- **No stacking**: on promotion the old active schedule is marked `superseded` and a
  fresh one starts. A user has at most ONE active schedule.

## Concurrency / double-pay protection (the part that bit us)
The engine runs from THREE triggers in the same process: 15s-after-startup, daily cron
(01:00), and the manual admin trigger (`POST /api/admin/ranks/run-engine`). Without
guards these can overlap and double-pay or create duplicate active schedules.
- **In-process guard**: module-level `engineRunning` boolean skips overlapping runs.
- **DB safety net**: partial unique index `rank_reward_one_active_per_user` on
  `(user_id) WHERE status='active'` — cross-process guarantee of one active schedule.
- **Per-month atomic claim**: the payout UPDATE is guarded on `id + status='active' +
  nextPayoutAt<=now + monthsPaid=<expected>`; wallet/income writes only happen if the
  conditional update claimed the row. Makes each month idempotent.

**Why:** code review flagged that concurrent triggers could each insert an active
schedule and both pay out. The three layers above close that.

## Timing
First `nextPayoutAt` = promotion time + 1 month (MONTH_MS = 30 days), NOT immediate —
otherwise the startup run right after a promotion would pay month 1 instantly.
