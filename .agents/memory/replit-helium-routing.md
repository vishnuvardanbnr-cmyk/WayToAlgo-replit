---
name: Replit Helium artifact routing
description: How the public edge routes traffic in a REPLIT_HELIUM_ENABLED artifact monorepo, and why "/" 502s while "/api" works. Read before touching scripts/replit-router.mjs or debugging preview/502s.
---

## The core rule (this is the one that matters)
When `REPLIT_HELIUM_ENABLED=true`, the public edge (the `*.replit.dev` domain AND the canvas artifact iframe) routes **by path to each artifact's own `localPort`**, taken from the `[[services]]` blocks in `artifacts/*/.replit-artifact/artifact.toml`. It does NOT route all traffic to the webview port (5000).

In this repo:
- `/api/*` → `localPort 8080` (api-server artifact)
- `/`     → `localPort 22041` (web artifact)

**Why:** Each artifact service declares its own `localPort` and `paths`. The edge demuxes on path. So a single proxy on port 5000 can never serve the public site — the edge never sends public `/` traffic to 5000.

## The classic symptom
- `curl https://$REPLIT_DEV_DOMAIN/api/healthz` → 200
- `curl https://$REPLIT_DEV_DOMAIN/` → 502
- `curl http://localhost:5000/` → 200 (misleading!)
- `screenshot` app_preview → looks fine (misleading!)

`/api` works because the api-server genuinely listens on 8080. `/` 502s because the web artifact is `serve = "static"` in production, so **nothing listens on 22041** — the artifact router serves static on its own port (8000) instead. The edge routes `/` to 22041, finds nothing, returns 502 before the request ever reaches any of our code.

**Why localhost/screenshot mislead:** both hit port 5000 (our proxy → artifact router on 8000, which DOES serve static). Only the real public edge uses per-artifact-port routing. Never trust localhost:5000 or screenshot to prove the public URL works — always `curl https://$REPLIT_DEV_DOMAIN/`.

## The fix (scripts/replit-router.mjs)
1. Spawn `$REPLIT_ARTIFACT_ROUTER` → it starts the api-server on 8080 (makes `/api` work) and serves static on 8000.
2. Run our own **static SPA server on port 22041** serving `artifacts/uranaz/dist/public` (makes public `/` work). Also forward `/api` from 22041 → 8080 as a safety net.
3. Run a proxy on **port 5000** → artifact router (8000) to satisfy the workflow's `outputType=webview` requirement and power the in-workspace preview/screenshot.

## Other gotchas hit along the way
- Pino logger crashed under `NODE_ENV=production` writing to `/var/log/uranaz` (not writable). Fixed by defaulting `LOG_DIR` to `/tmp/uranaz-logs`.
- Any extra workflow holding port 8080 blocks the artifact router from starting the api-server → cascade failure. Keep only the one "Start application" workflow.
- `.replit` cannot be edited directly (port mappings are auto-managed); there is no manual port-mapping tool. Work *with* the artifact `localPort`s, don't try to rewrite `[[ports]]`.
