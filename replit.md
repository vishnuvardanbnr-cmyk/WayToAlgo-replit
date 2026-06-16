# WaytoAlgo — Investment Platform

## Project Overview
A full-featured investment platform with user and admin panels, professional AI-trading aesthetic ("Quantum Indigo" — electric indigo-blue #5B8CFF on deep slate-navy #060814), glassmorphism cards, animated star field. Mobile-first with fixed bottom navigation.

## Architecture

### Monorepo Structure
```
artifacts/
  uranaz/          — React + Vite frontend (path: /)
  api-server/      — Express + Drizzle backend (path: /api)
lib/
  api-spec/        — OpenAPI spec + codegen config
  api-client-react/ — Generated React Query hooks
  api-zod/         — Generated Zod schemas
  db/              — Drizzle schema + migrations
```

### Tech Stack
- **Frontend**: React 18, Vite, TailwindCSS v4, Wouter (routing), TanStack Query, react-hook-form, Zod, qrcode.react
- **Backend**: Express, Drizzle ORM, PostgreSQL, ethers.js (BEP-20 blockchain), nodemailer, ws (WebSocket)
- **Auth**: HMAC-SHA256 signed tokens (SESSION_SECRET), stored in localStorage as `waytoalgo_token`
- **Codegen**: Orval (OpenAPI → React Query hooks + Zod schemas)

## Frontend Pages

### User Pages
- `/` — Landing page
- `/login` — Login form
- `/register` — Registration with referral code + OTP support. **First-user rule**: if the platform has zero users, the first registrant is auto-promoted to admin (`isAdmin = true`) and the referral code field is hidden + skipped. Once any user exists, the referral code becomes mandatory and the sponsor must resolve to an existing user (server returns 400 otherwise). Public endpoint `GET /api/auth/registration-info` returns `{ userCount, isFirstUser, requiresReferral }` and is used by the frontend to switch the Zod schema and UI between the two modes.
- `/profile-setup` — Wallet address + country setup
- `/dashboard` — Balance, active investments, income breakdown, quick links
- `/deposit` — BEP-20 USDT deposit: unique wallet address, QR code, "Check Deposit" sweeper
- `/invest` — Investment plan selection + calculator
- `/income` — Income history with type filters
- `/wallet` — Wallet overview with transaction history
- `/team` — Multi-level team structure
- `/share` — Referral link + code
- `/profile` — User profile edit
- `/withdrawals` — Withdrawal request + history (with OTP)
- `/ranks` — 5-rank system with progress
- `/support` — Live chat support tickets (WebSocket)
- `/transactions` — Transaction history

### Admin Pages
- `/admin` — Platform stats overview
- `/admin/users` — User list + edit drawer (Profile / Access / Balance tabs). Per-user toggles for: account active, withdrawals blocked, P2P blocked, new investments blocked, admin role. Edit name/email/phone/country/wallet, adjust USDT + HyperCoin balances, set level, set block reason (shown in the user-facing error). Enforced server-side in `withdrawals POST`, `wallet/p2p/transfer POST`, `investments POST` with HTTP 403 + reason.
- `/admin/investments` — All investments list
- `/admin/withdrawals` — Withdrawal approval/rejection
- `/admin/reports` — Detailed reports (deposits, withdrawals, wallet-address change history); CSV export, date/status/search filters
- `/admin/settings` — Platform settings + SMTP config + Blockchain wallet config
- `/admin/support` — Live support ticket management
- `/admin/offers` — Promotional offer management
- `/admin/notices` — Push announcements & alerts

### Admin Reports
- `GET /api/admin/reports/deposits?page&limit&status&search&from&to` — Deposit history w/ user info, summary totals
- `GET /api/admin/reports/withdrawals?page&limit&status&search&from&to` — Withdrawal history w/ user info, summary totals
- `GET /api/admin/reports/wallet-changes?page&limit&search&from&to&otpOnly` — Wallet update audit trail
- All persisted in `wallet_address_changes` table (userId, oldAddress, newAddress, otpVerified, ipAddress, userAgent). Inserted by `/auth/profile-setup` on any wallet change (initial setup or update). `otpVerified` reflects whether the request actually presented and validated an OTP — not just whether the feature was on.

## Backend API Routes

### Auth
- `POST /api/auth/register` — Register user (optional referralCode + OTP)
- `POST /api/auth/login` — Login, returns { user, token }
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user (includes walletBalance)
- `POST /api/auth/profile-setup` — Set wallet/country/ID
- `POST /api/auth/send-otp` — Send OTP email
- `GET /api/auth/otp-required` — Check if OTP is required

### Deposits (BEP-20 USDT)
- `GET /api/deposits/address` — Get/create user's unique BSC deposit address
- `POST /api/deposits/check` — Check BSC for USDT, sweep to admin wallet, credit balance
- `GET /api/deposits` — User's deposit history
- `GET /api/admin/deposits` — All deposits (admin)

### Admin Wallet
- `GET /api/admin/wallet-settings` — Get master wallet + gas wallet config
- `PUT /api/admin/wallet-settings` — Save master wallet address + gas wallet private key + BSC RPC + min deposit

### Support (WebSocket + REST)
- `GET /api/support/tickets` — User's tickets
- `POST /api/support/tickets` — Create ticket
- `GET /api/support/tickets/:id` — Ticket + messages
- `POST /api/support/tickets/:id/messages` — Send message
- `GET /api/admin/support/tickets` — All tickets (admin)
- `PUT /api/admin/support/tickets/:id/status` — Update ticket status
- `WS /api/ws?token=TOKEN` — WebSocket live chat

### User
- `GET /api/investments` — List user's investments
- `POST /api/investments` — Create investment
- `GET /api/income` — Income history
- `GET /api/income/summary` — Income summary + available balance
- `GET /api/team` — Team levels
- `GET /api/team/stats` — Team stats
- `GET /api/team/referral-link` — Referral code + link
- `GET /api/withdrawals` — Withdrawal history
- `POST /api/withdrawals` — Submit withdrawal
- `GET /api/ranks` — All ranks
- `GET /api/ranks/progress` — User rank progress

### Admin
- `GET /api/admin/stats` — Platform statistics
- `GET/PUT /api/admin/settings` — Platform settings
- `GET /api/admin/users` — All users
- `PUT /api/admin/users/:id` — Update user status
- `GET /api/admin/investments` — All investments
- `GET /api/admin/withdrawals` — All withdrawals
- `POST /api/admin/withdrawals/:id/approve` — Approve withdrawal
- `POST /api/admin/withdrawals/:id/reject` — Reject withdrawal
- `GET/PUT /api/admin/smtp-settings` — SMTP email configuration

## Database Schema (Drizzle ORM, PostgreSQL)
- `users` — id, name, email, phone, password_hash, referral_code, sponsor_id, wallet_address, country, id_number, current_level, current_rank_id, is_admin, is_active, profile_complete, total_earnings, total_invested, wallet_balance, deposit_address, deposit_private_key, created_at
- `investments` — id, user_id, amount, plan_tier, daily_rate, duration_days, earned_so_far, remaining_days, start_date, end_date, status, hyper_coin_amount, usdt_amount
- `income` — id, user_id, type, amount, description, from_user_id, created_at
- `withdrawals` — id, user_id, amount, wallet_address, status, note, processed_at, created_at
- `ranks` — id, rank_number, name, criteria, reward, requires_rank_id, requires_count, requires_levels
- `platform_settings` — id, maintenance_mode, min/max_deposit, hyper_coin_min_percent, spot_referral_rate, launch_offer_active, withdrawal_enabled, smtp_*, otp_*_enabled, admin_master_wallet, gas_wallet_private_key, bsc_rpc_url, min_deposit_usdt
- `otp_codes` — id, email, code, purpose, used, expires_at, created_at
- `support_tickets` — id, user_id, subject, status, created_at, updated_at
- `support_messages` — id, ticket_id, user_id, is_admin, text, created_at
- `deposits` — id, user_id, tx_hash, amount, status, sweep_tx_hash, note, created_at, credited_at

## Deposit Flow (BEP-20 USDT on BSC)
1. Each user gets a unique BEP-20 wallet address (generated with ethers.js, stored in DB)
2. User sends USDT (BEP-20) to their address and clicks "Check Deposit"
3. Server checks BSC for USDT balance via `ethers.js` + public RPC
4. If USDT found: sends BNB from gas wallet to cover sweep gas → sweeps USDT to admin master wallet
5. Only after confirmed sweep: credits user's `wallet_balance`
6. Sweep tx hash linked to BSCScan for verification

## SMTP / OTP System
- Admin saves SMTP credentials in settings panel
- Optional OTP on registration and withdrawal
- OTP codes expire in 10 minutes, single-use

## Security Architecture

### Authentication Tokens
- HMAC-SHA256 signed, stored in localStorage as `waytoalgo_token`
- **30-day expiry** enforced server-side (`ts` claim checked in verifyToken)
- SESSION_SECRET **required** at startup — server throws if not set (no hardcoded fallback)

### Rate Limiting (express-rate-limit)
- OTP send (`POST /api/auth/send-otp`): **5 requests / 10 minutes** per IP
- Login + Register: **20 requests / 15 minutes** per IP
- All other API: **300 requests / minute** per IP
- `trust proxy: 1` set so nginx's X-Forwarded-For is used for real client IP

### CORS
- Restricted to `https://way2algo.io`, `https://www.way2algo.io`, and localhost
- All other origins rejected

### DB Transactions (Race Condition Protection)
- P2P transfers: wrapped in full DB transaction (check + deduct + credit + audit log)
- Investment creation: wrapped in DB transaction (balance re-fetched inside tx, deducted atomically)
- Registration: uses Postgres advisory lock + transaction for first-user/admin race

### Email Security
- TLS verification (`rejectUnauthorized: true`) enabled for all non-localhost SMTP servers
- All user-supplied data (name, plan label) escaped with `escapeHtml()` before HTML interpolation

### Password Hashing — Bcrypt Migration
- **New registrations**: hashed with bcrypt (12 rounds) via `bcryptjs`
- **Existing users**: still have the old SHA-256+salt hash in the DB; on their next successful login the server detects the old format (doesn't start with `$2`), verifies with SHA-256, then silently re-hashes with bcrypt and saves — transparent to the user
- `legacyHash()` kept only for migration verification; `hashPassword()` is now async bcrypt-only

## Seed Data
- Admin: admin@uranaz.com / admin123
- Demo user: john@example.com / demo123

## Design Constants ("Quantum Indigo" — professional AI-trading theme)
- Background: `#060814` (deep slate-navy)
- Primary accent: `#5B8CFF` (electric indigo-blue); dim/gradient end: `#3D5CE0`
- Light/ice tint (headings, muted text base): `#C2D2FF`
- Glass: `rgba(10,14,30,0.65)` + `blur(14px)` + `1px solid rgba(91,140,255,0.10)`
- Muted text: `rgba(194,210,255,0.4)`
- HSL token (CSS vars in index.css): primary/accent/ring = `222 90% 66%`, background = `225 55% 5%`
- Semantic colors unchanged: green `rgb(52,211,153)` gains, red `rgb(248,113,113)` loss, amber `rgb(251,191,36)`
- Font: Orbitron (headings), system-ui (body)
- Token key: `waytoalgo_token` in localStorage
- Note: the sign-in (Login) page no longer shows the logo image; only the "Welcome Back" heading remains.
