---
name: Withdrawal concurrency test harness
description: How the api-server withdrawal concurrency tests are wired and the gotchas that bite when writing settings-dependent integration tests.
---

# Withdrawal concurrency tests (api-server)

Vitest + supertest suite at `artifacts/api-server/test/withdrawals.concurrency.test.ts`,
run with `pnpm --filter @workspace/api-server test`. It mounts the real
`withdrawals` + `admin` routers on a bare express app (no rate limiter/CORS) and
races requests against the real dev Postgres DB to lock in the guarded-update
invariants (no over-withdraw, single refund, reject-vs-claim exclusivity, approve
only on pending).

## Gotcha: multiple `platform_settings` rows + `limit(1)` with no ORDER BY
Routes read settings via `.limit(1)` with **no ORDER BY**, and the dev DB has
**more than one** `platform_settings` row. So which row a route reads is
non-deterministic. Any test that mutates settings (e.g. switching to auto
withdrawal mode) must patch **ALL** rows (`db.update(table).set(patch)` with no
WHERE) and snapshot/restore every row, or the route may read a row you didn't
touch and silently take the wrong branch.
**Why:** first attempt updated only one snapshotted row → auto-mode tests saw the
"manual" branch and failed mysteriously.

## Gotcha: mocking the blockchain send
`sendUsdtToAddress` is imported two ways — static `from "../lib/blockchain"`
(withdrawals.ts) and dynamic `import("../lib/blockchain.js")` (admin.ts). Both
resolve to the same module, so one `vi.mock("../src/lib/blockchain", ...)` with
`importActual` (keep `getSettings` real, override only `sendUsdtToAddress`) covers
both. Use `vi.hoisted` for the shared mock fn.

## Auto-mode dispatch is fire-and-forget
Approve/auto create respond immediately (status `processing`) then flip to
`approved` asynchronously after the (mocked) send resolves. Tests must poll the
row until a terminal status before asserting send-count / balance.
