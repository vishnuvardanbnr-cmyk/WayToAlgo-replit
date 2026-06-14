---
name: Rank engine test isolation
description: How to write reliable tests for runRankEngine against the shared dev Postgres DB.
---

# Testing the rank engine (runRankEngine)

Two non-obvious traps when testing `artifacts/api-server/src/lib/rankEngine.ts` with vitest
(`artifacts/api-server/test/rankEngine.test.ts`, run via `pnpm --filter @workspace/api-server test`):

- **`runRankEngine()` scans EVERY user and rank in the DB, not a scoped set.** Tests run against the
  shared dev Postgres, so a real ("ambient") user can be promoted/paid if it happens to qualify for a
  test rank. Mitigation: make every engine-running test rank require `selfInvestmentMin > 0` or
  `teamBusinessMin > 0` (so a zero-invest ambient user can't qualify), AND in `beforeAll` snapshot all
  existing users' `currentRankId`/`withdrawBalance`/`totalEarnings`, restoring them in `afterEach`.
  Also sweep schedules by `inArray(rankId, createdRankIds)` — promotion can create schedules for
  ambient users referencing your test ranks.

- **The in-process `engineRunning` guard means two concurrent `runRankEngine()` calls never both reach
  the DB.** The second returns `{0,0,0}` immediately. So `Promise.all([runRankEngine, runRankEngine])`
  only proves the in-process guard, NOT the DB-level atomic claim. To prove no double-pay at the DB
  layer, race two raw guarded UPDATEs that mirror the engine's claim WHERE clause
  (`status='active' AND nextPayoutAt<=now AND monthsPaid=<expected>`) and assert exactly one returns a row.

**Why:** these two facts caused false-confidence/isolation gaps flagged in code review; documenting so
future rank-engine tests follow the same cleanup + concurrency-proof discipline.

Other notes: `ranksTable.criteria`/`reward` are NOT NULL with no default — always provide them.
Promotion sets first `nextPayoutAt` to +30 days, so a promotion run pays nothing; force a due payout by
updating `nextPayoutAt` into the past.
