---
name: VPS deploy paths
description: Correct file paths for deploying backend and frontend to the production VPS
---

## Rule
VPS at root@13.140.173.105, app root `/var/www/waytoalgo/`.

| Artifact | Source (after build) | Destination on VPS |
|---|---|---|
| Backend bundle | `artifacts/api-server/dist/index.mjs` | `/var/www/waytoalgo/backend/index.mjs` |
| Backend sourcemap | `artifacts/api-server/dist/index.mjs.map` | `/var/www/waytoalgo/backend/index.mjs.map` |
| Backend workers | `artifacts/api-server/dist/pino-*.mjs` | `/var/www/waytoalgo/backend/` |
| Frontend JS/CSS | `artifacts/uranaz/dist/public/assets/*` | `/var/www/waytoalgo/frontend/assets/` |
| Frontend HTML | `artifacts/uranaz/dist/public/index.html` | `/var/www/waytoalgo/frontend/index.html` |

**Why:** PM2 runs `/var/www/waytoalgo/backend/start.sh` which execs `node /var/www/waytoalgo/backend/index.mjs`. Nginx serves static files from `/var/www/waytoalgo/frontend/` and proxies `/api/` to port 8080.

**CRITICAL — avoid nested assets dir bug:**
`cp -rf dist/public/assets /var/www/waytoalgo/frontend/assets` creates a nested
`frontend/assets/assets/` if the destination already exists. Use `cp -rf dist/public/assets/* /var/www/waytoalgo/frontend/assets/` (note the `*`) to copy only the contents, not the directory itself.

**How to apply (correct SSH commands):**
```bash
# 1. Build
pnpm --filter @workspace/api-server run build
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/uranaz run build

# 2. Package + upload
tar -czf /tmp/deploy.tar.gz artifacts/api-server/dist artifacts/uranaz/dist
sshpass -p "$VPS_SSH_PASSWORD" scp /tmp/deploy.tar.gz root@13.140.173.105:/tmp/

# 3. Deploy on VPS
ssh root@13.140.173.105 '
  cd /tmp && tar -xzf deploy.tar.gz
  cp -f  artifacts/api-server/dist/index.mjs       /var/www/waytoalgo/backend/index.mjs
  cp -f  artifacts/api-server/dist/index.mjs.map   /var/www/waytoalgo/backend/index.mjs.map
  cp -rf artifacts/uranaz/dist/public/assets/*     /var/www/waytoalgo/frontend/assets/
  cp -f  artifacts/uranaz/dist/public/index.html   /var/www/waytoalgo/frontend/index.html
  pm2 restart waytoalgo-api
'
```
