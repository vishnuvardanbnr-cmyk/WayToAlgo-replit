---
name: Earning Wallets Flow
description: How Trading Profit and Team Benefit wallets work — token amounts, not USD. Sell-only convert, no re-buy.
---

## Rule
`tradingProfitBalance` and `teamBenefitBalance` store **HC token amounts** (not USD).
The convert endpoint sells tokens already in the platform withdraw wallet — no buy step.

## Why
Admin buys tokens during distribution; those tokens sit in the platform's withdraw wallet.
Users' balances reflect their share of those tokens. Selling is the only on-chain action at convert time.

## Distribution modes (admin ROI distribution)
Two selectable modes per run, both take a USDT $ value (converted to tokens at current **buyPrice**):
- **buy**: real on-chain buy from withdraw wallet (needs gas wallet), then distribute the bought tokens virtually.
- **held**: admin has already sent tokens to the withdraw wallet manually; system verifies wallet token balance ≥ needed, then assigns virtually. **No buy, no transfer, no gas wallet required.**
`token_buy_batches.source` column records which mode produced each batch.
Preview (`GET /admin/token/preview`) is a pure no-write simulation; UI must gate the distribute button on a successful preview matching the entered amount.
Supply conservation: `tokensBought === roiTotal + levelTotal + reserve` to the wei — all rounding dust + unclaimed level pool rolls into reserve.
Distribution is serialised in-process (module-level `distributionInProgress` flag) to avoid held-mode TOCTOU over-assignment.

## How to apply
- **tokenPayout.ts**: Credit `roiTokenWei` → `tradingProfitBalance`, `levelTokenWei` → `teamBenefitBalance` (token strings, not USD).
- **wallet.ts /convert**: Input `amount` = HC token quantity. Deduct tokens from source balance → call `sellTokens(wei, ...)` → credit USDT to `walletBalance`. Refund on sell failure.
- **Wallet.tsx**: Display HC amounts (`.toFixed(4) HC`), show USD estimate using `hyperCoinPrice` from `/api/settings/public`. Convert modal input is tokens, not USDT.
- `walletConvertReturnRate` field exists in DB but is unused — actual return is whatever the on-chain sell yields.
