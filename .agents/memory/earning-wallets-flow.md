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

## How to apply
- **tokenPayout.ts**: Credit `roiTokenWei` → `tradingProfitBalance`, `levelTokenWei` → `teamBenefitBalance` (token strings, not USD).
- **wallet.ts /convert**: Input `amount` = HC token quantity. Deduct tokens from source balance → call `sellTokens(wei, ...)` → credit USDT to `walletBalance`. Refund on sell failure.
- **Wallet.tsx**: Display HC amounts (`.toFixed(4) HC`), show USD estimate using `hyperCoinPrice` from `/api/settings/public`. Convert modal input is tokens, not USDT.
- `walletConvertReturnRate` field exists in DB but is unused — actual return is whatever the on-chain sell yields.
