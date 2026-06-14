---
name: Withdrawal state machine & money atomicity
description: Invariants for the Withdraw Wallet debit/refund/payout flow — how to keep withdrawals safe from double-spend, double-refund, and payout-after-refund.
---

# Withdrawal state machine (Withdraw Wallet)

Two per-user USDT balances: `users.walletBalance` (Main Wallet — deposit/invest/P2P only) and
`users.withdrawBalance` (Withdraw Wallet — the ONLY withdrawable balance; collects spot referral,
ROI-token sells, and all WTA convert/Sell proceeds). Real-balance model: earnings credit it,
creating a withdrawal debits it, admin reject refunds it. `income/summary.availableBalance` == `withdrawBalance`.

## Status lifecycle
`pending → processing → approved` (on-chain ok); `processing → pending` (on-chain fail);
`pending → rejected` (refund); `pending → approved` (no-wallet-configured manual approve).

## Invariants (do NOT regress these)
- **Debit on create must be a single atomic conditional UPDATE**, never read-then-write:
  `SET withdraw_balance = withdraw_balance - amt::numeric WHERE id=:id AND withdraw_balance >= amt::numeric RETURNING`.
  0 rows → 400 insufficient. Read-then-write allows lost-update over-withdraw.
- **Only `pending` is rejectable and only `pending` is approvable.** A `processing` row (on-chain send
  in flight) must resolve before any terminal admin action — otherwise you can refund AND pay out.
- **Reject = guarded flip + refund in ONE transaction**: `UPDATE … status='rejected' WHERE id AND status='pending' RETURNING`;
  refund only if a row returned. Stops concurrent double-refund.
- **Auto-process must CLAIM the row before sending on-chain**: guarded `pending → processing` with
  `.returning()`; dispatch `sendUsdtToAddress` ONLY if a row was claimed. Otherwise a concurrent
  reject/refund leaves it rejected while funds still go out (payout-after-refund).
- **Every async on-chain completion update is guarded on `status='processing'`** (both the create-time
  auto path in withdrawals.ts and the admin approve path in admin.ts).

**Why:** these are real-money flows; the architect repeatedly flagged lost-update, double-refund, and
payout-after-refund races. The guards (conditional UPDATE … WHERE status RETURNING) are what make each
transition single-winner.

**Known gap (tracked as follow-up):** a row stuck in `processing` after a crash/restart has no API
recovery path and stays debited. Needs a timeout + admin recover/cancel path with strict guards.
