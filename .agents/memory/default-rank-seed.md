---
name: Default rank seed
description: Where the starter rank ladder comes from and how its idempotency works
---

# Default rank seed

`seedRanks(db)` lives in `lib/db/src/seed.ts` (exported from `@workspace/db`).
It seeds a Bronze→Diamond ladder (`DEFAULT_RANKS`) and is invoked on api-server
startup (`artifacts/api-server/src/index.ts`).

**Rule:** it only inserts when the ranks table is completely empty, and the
insert uses `ON CONFLICT DO NOTHING` on the unique `rank_number`.

**Why:** new platforms had a blank Ranks page until an admin manually created
ranks. The empty-table gate means the seed never re-creates ranks an admin has
intentionally edited or deleted; the conflict clause guards concurrent boots.

**How to apply:** if you ever need the seed to update existing ranks, the
empty-table check is what blocks it — don't remove it without rethinking the
"don't fight the admin" guarantee. Seeded `criteria`/`reward` strings are
formatted to match `deriveRankDisplay()` in `routes/admin.ts`; keep them in sync
if that format changes.
