---
name: Build & run model (uranaz monorepo)
description: How the app is actually built/served and why restart alone never picks up source edits.
---

## Rule
The running app serves **prebuilt bundles**, not live source. After editing backend or frontend source you MUST rebuild the relevant bundle AND restart, or your changes silently won't appear (you'll get stale routes / old UI, and unmatched API routes fall through to the SPA returning index.html with HTTP 200).

**Why:** `restart_workflow "Start application"` only re-runs `node scripts/replit-router.mjs`, which spawns the prebuilt artifacts — it does NOT run any build step.

## How to apply
- **Backend** (`artifacts/api-server`): runs `node dist/index.mjs`, an esbuild bundle. Rebuild with `pnpm --filter @workspace/api-server run build` (runs `build.mjs`; esbuild strips types so pre-existing `tsc` errors don't block it). Then `restart_workflow`.
- **Frontend** (`artifacts/uranaz`): served as static files from `dist/public`. Rebuild with `cd artifacts/uranaz && PORT=22041 BASE_PATH=/ NODE_ENV=production npx vite build --config vite.config.ts`. The vite config THROWS if `PORT` or `BASE_PATH` env vars are missing — both are required at config-load time even for a build.
- **DB schema** (`lib/db`): `pnpm --filter @workspace/db run push`.
- Ports: unified router owns 8000 (artifact router), 8080 (api), 22041 (web), 5000 (webview). The separate `artifacts/api-server: API Server` and `artifacts/uranaz: web` workflows **fail by design** (port conflicts with the unified router) — do not "fix" them.

## Typecheck note
Plain `tsc -b`/`--noEmit` surfaces many **pre-existing** errors (stale `lib/*/dist` → TS6305 cascade making types resolve to `{}`/`any`; `req.query` string|string[]; ServerStatus prop drift). These are not introduced by new edits and don't affect the esbuild/vite runtime. To check only your own file, filter tsc output by filename and confirm 0 matches.
