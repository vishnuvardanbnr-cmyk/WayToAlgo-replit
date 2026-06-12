---
name: WTA purchase DB tracking
description: How on-chain WTA token buys are recorded in the platform DB for wallet-connection-free display
---

## Rule
After every confirmed on-chain WTA buy, `TokenPurchase.tsx` fires a non-fatal `POST /api/token/record-purchase`. `GET /api/token/holdings` returns aggregated totals + live sell price. Both Dashboard and Wallet show holdings without requiring wallet connection.

**Why:** MetaMask is not always connected when users visit Dashboard/Wallet, so on-chain reads would show zero. DB records ensure holdings always display.

**How to apply:**
- `user_token_purchases` table: userId, walletAddress, txHash (UNIQUE), usdtSpent, wtaReceived, buyPrice, createdAt
- Backend routes in `artifacts/api-server/src/routes/token.ts`
- `DashboardTokenCard.tsx` — falls back to DB totals when wallet not connected; prefers live on-chain balance when wallet is connected
- `Wallet.tsx` — shows WTA Token Balance card when `purchaseCount > 0`
- The record-purchase call uses the pre-computed `net` BigInt (gross minus referral bps) as `wtaReceived` — close enough (max 1% slippage diff)
