---
name: Daily Potential projection (income/summary)
description: How the Dashboard "Daily Potential" ROI+level figure is computed and why it deliberately differs from the payout engine
---

`GET /api/income/summary` returns `dailyPotential { dailyRoiRate, roiUsd, levelUsd, totalUsd }` — a best-case projection of a user's daily ROI + level commission, shown on the Dashboard "Daily Potential" stat card.

Rules:
- ROI base mirrors the distribution engine (`tokenPayout.loadEligibility`): a user's active-investment ROI principal (`amount − tokenPurchaseAmount`) is counted ONLY when the account `isActive` AND has not reached its earnings cap (computed via earningsCap helpers `loadRoiLevelEarnedMap` / `buildDirectVolumeMap` / `capForUser`).
- `roiUsd` = self's earnable ROI principal × dailyRoiRate. `levelUsd` = downline BFS by depth (levels 1..10), each member's daily ROI × `levelCommL{n}` (Model A fractions).
- If the current user is inactive or cap-reached, both roiUsd and levelUsd are 0.
- Final projection is clamped to the current user's remaining cap room (partial clamp), mirroring engine `clampToCap`.

**Why intentional divergences from the engine exist:**
- **Level qualification gates (levelDays/levelDirects/levelUnlocks) are NOT applied** — the figure is "what they'd get if they pass all level conditions" (the user's explicit ask). It's a potential, not current eligibility.
- **Cooling window (withdrawalCoolingHours) is deliberately NOT filtered** — a brand-new investment would show $0 for 24h otherwise, which is misleading for a steady-state "potential" display. Code-review (architect) repeatedly flags cooling as a mismatch; this is a conscious product choice, not an oversight.

**How to apply:** if changing this, keep the ROI base (active + not-capped) and the current-user cap clamp consistent with the engine; only relax the level-qualification and cooling gates, and keep the card labeled as a potential ("Daily Potential"), never as guaranteed/today's payout.
