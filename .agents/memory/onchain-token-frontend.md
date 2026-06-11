---
name: On-chain token Buy/Sell frontend
description: How the on-chain bonding-curve token feature is wired and why it uses raw window.ethereum
---

# On-chain bonding-curve token (Buy/Sell)

The Invest page has a two-section switcher: existing off-chain investments and a fully on-chain token Buy/Sell (`TokenPurchase.tsx` + `lib/tokenContract.ts`). It is intentionally isolated from the platform's off-chain USDT balance / deposits / investments — never couple them.

**Rule:** the frontend has NO ethers/wagmi. All chain interaction uses raw `window.ethereum` with manual hex ABI encoding (32-byte padded uint/address, dynamic-string decode for `symbol()`). Pattern mirrors `Wallet.tsx`.
**Why:** keeps the bundle small and matches the existing deposit/withdraw code; adding ethers to the frontend would be inconsistent.
**How to apply:** to compute new function selectors, run ethers from the api-server package (`pnpm --filter @workspace/api-server exec node`) — ethers exists only there.

**Contract address is set later:** `TOKEN_CONTRACT_ADDRESS` in `lib/tokenContract.ts` is empty until the user deploys `contracts/BondingCurveToken.sol` and pastes the BSC address. While empty, `isTokenConfigured()` is false and the UI shows a "coming soon" state — do not attempt reads/writes.

**Flows:** buy = ensure BSC → account → USDT balance check → allowance check → approve (if needed, wait receipt) → quoteBuy → applySlippage (1%) → buy → wait receipt. Sell = balance check → quoteSell → applySlippage → sell → wait receipt (no approval; contract burns from msg.sender). Gas caps are fixed (approve 100k, buy/sell 400k) — consider eth_estimateGas if deployments revert.

**Token-wide stats (liquidity / supply / holders):** display-only, fetched on an ISOLATED path (each read independently try/caught) so a stats/RPC failure can never break the core price+balance refresh — do not fold them back into the core `Promise.all`. There is NO on-chain holder counter: holders are derived client-side by replaying `Transfer` event logs (`eth_getLogs`) and tallying net balances (mint=from 0x0, burn=to 0x0, count balances >0). **Why:** the bonding-curve contract exposes no holder set. **Caveat:** a single `fromBlock:0x0→latest` log query can hit public-BSC-RPC range limits as history grows; it degrades to `—`. If it becomes unreliable on a live token, switch to chunked block-window scanning + caching.

**On-chain 10-level referral income (BUILT):** REAL tokens minted on-chain to each upline sponsor at purchase time. Decisions locked in: (1) reward is CARVED FROM THE BUYER — buyer receives `gross - referralTotal`; total supply per buy is unchanged (`totalMinted += gross`), so curve backing per token is unaffected; (2) FIXED 10 levels, admin sets per-level % in basis points; (3) the WEBSITE supplies the upline addresses into `buy` (no on-chain referral registry) — a buyer COULD bypass by calling `buy` directly with different/empty referrers; user accepted this tradeoff.
**Why carved-from-buyer:** keeps the bonding-curve invariant (USDT backing ÷ supply) intact; extra-mint would dilute backing.
**How it's wired:** contract `buy(uint256,uint256,address[])` selector `5e1f417e`; `_payReferrals` skips zero-addr/self/zero-pct, bounded to `LEVELS=10`; owner-only `setLevelPercents(uint256[10])` capped at `MAX_TOTAL_BPS=9000` (buyer always keeps ≥10%); contract is OZ v5 `Ownable(msg.sender)`. Backend `GET /api/token/upline` (auth, in `routes/token.ts`) walks `usersTable.sponsorId` ascending, level-1=direct-sponsor first, zero-fills missing/invalid wallets to a fixed length 10, with cycle guard. Frontend: `tokenContract.ts` adds `encAddressArray` (dynamic `address[]` last-arg, offset `0x60` after 2 static words), `readLevelPercents()` (decodes fixed `uint256[10]` inline), `readOwner()`; `TokenPurchase.tsx` fetches uplines+percents on an isolated non-fatal path, slippage `minOut` is computed against the NET buyer amount, and the self/zero-addr/zero-pct skip MUST mirror the contract in all 3 places (contract `_payReferrals`, contract `quoteBuyNet`, frontend `activeReferralBps`). Admin sets percents on-chain via owner MetaMask in `AdminTokenReferral.tsx` (rendered in AdminSettings Blockchain tab).
