---
name: Replit Helium routing
description: When REPLIT_HELIUM_ENABLED=true, external traffic goes through the artifact router on port 8000, not port 5000 directly. Fix and root causes documented here.
---

## The Rule
When `REPLIT_HELIUM_ENABLED=true` (present in env), Replit's external domain routes ALL traffic through `$REPLIT_ARTIFACT_ROUTER` (a binary), which listens on **port 8000** — NOT the declared webview port 5000.

## Why configureWorkflow still requires port 5000
Replit's workflow system enforces `waitForPort = 5000` for `outputType = "webview"`. The fix is to run a lightweight proxy on port 5000 that forwards to port 8000 (artifact router).

## What the artifact router does
- Reads `artifacts/*/.replit-artifact/artifact.toml` files
- In production mode (`previewMode=false`): serves static files from `publicDir`, starts the backend via the production run command
- Routes `/api` → backend (port 8080), `/` → static files or Vite dev server
- Listens on port **8000**

## Root causes of 502 in this project
1. **Port conflict**: Any workflow running on port 8080 (e.g. "Start Backend") prevents the artifact router from starting its own backend → artifact router fails → 502
2. **Pino logger crash**: In production mode (`NODE_ENV=production`), pino tried to write logs to `/var/log/uranaz/` which is not writable in Replit → fixed by changing `LOG_DIR` default to `/tmp/uranaz-logs`

## The fix (scripts/replit-router.mjs)
- Spawns `$REPLIT_ARTIFACT_ROUTER` in background
- Waits for port 8000 to be ready
- Creates HTTP + WebSocket proxy on port 5000 → port 8000
- Workflow command: `node scripts/replit-router.mjs` with `waitForPort = 5000`

**Why:** Remove all other workflows that take port 8080 — only the artifact router should manage the backend process.
