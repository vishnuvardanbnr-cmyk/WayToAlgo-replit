---
name: Safe Invest on-chain proof binding
description: How a Safe-Invest API request proves its on-chain token-half buy is genuine and belongs to the caller
---

Safe Invest pays its 50% token-half on-chain (user MetaMask `buySafe`) and the
ROI-half from the in-app balance. Because the API grants full `totalInvested` /
spot-referral / rank credit for the *full* amount while only the ROI-half is
deducted in-app, the on-chain proof MUST be airtight or it becomes an economic
exploit (pay half, get full credit).

The required trust chain for the Safe path (all enforced server-side before the
investment is created — a client calling the API directly must satisfy every
link):
1. **Replay**: the token-purchase row is inserted INSIDE the investment DB
   transaction with NO `onConflictDoNothing`; a duplicate unique txHash throws
   pg `23505` → whole investment rolls back. A reused tx can never mint a second
   investment.
2. **Ownership (EIP-191)**: request carries a `signature`; server rebuilds the
   exact message `WaytoAlgo Safe Invest\nWallet:<lower>\nTx:<lower>` and
   `ethers.verifyMessage` must recover the buying wallet. This is the real proof
   — a stored/registered wallet address is NOT itself proof of control.
3. **On-chain**: fetch tx+receipt over BSC RPC (retry for propagation lag),
   assert `receipt.status===1`, `tx.to===configured contract`, calldata decodes
   as `buySafe(...)`, `tx.from===wallet`, and paid USDT ≥ the required 50%.

**Why:** code review escalated through three FAILs — (a) unverified txHash, then
(b) client wallet not bound to the user, then (c) registered wallet not
ownership-proven (users.walletAddress is not unique, so a victim's address could
be registered and their public tx claimed). Only a per-request signature over
the unique txHash closes it; the registered-wallet match is kept as
defense-in-depth.

**How to apply:** never trust a client-supplied txHash/wallet for any flow that
grants value — bind it with a fresh on-chain verification AND a signature whose
canonical message string matches byte-for-byte on both sides (lowercase wallet +
txHash). Backend verification keys off `settings.tokenContractAddress` (same
config the ROI engine uses); the frontend trades against its own hardcoded
address, so on contract redeploy BOTH must point at the new contract or Safe
invests deny-of-service (not an exploit, just downtime).
