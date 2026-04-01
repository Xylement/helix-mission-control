# Claude Code Task: Fix Frontend API Proxy for Fresh Installs

Read CODEBASE-CONTEXT.md first.

## Problem

On fresh installs without a reverse proxy (Nginx/Caddy), the frontend at port 3000 cannot reach the backend at port 8000. The frontend's `api.ts` and `billing.ts` make requests to `/api/...` on the same origin, expecting a reverse proxy to forward them. Without Nginx, these requests hit Next.js which returns 404.

This was discovered during a macOS Docker Desktop install where there's no Nginx — just bare Docker Compose.

## Root Cause

1. `frontend/src/lib/api.ts` uses `""` as the API base URL (empty string), so `fetch("" + "/api" + path)` hits `http://localhost:3000/api/...`
2. `frontend/src/lib/billing.ts` does the same pattern
3. There is no `next.config.js` (or `next.config.mjs`) with rewrite rules to proxy `/api/*` to the backend
4. The Dockerfile hardcodes `ENV NEXT_PUBLIC_API_URL=http://localhost:8000` but `api.ts` doesn't actually use this env var for the main fetch wrapper — it's unused

## Fix

### 1. Create `frontend/next.config.js` with API rewrites

Create this file (or update if `next.config.mjs` exists — check first):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

**Key details:**
- `output: 'standalone'` — this is already used (the Dockerfile copies from `.next/standalone`), make sure it stays
- `BACKEND_URL` env var defaults to `http://backend:8000` (Docker service name) — works in Docker Compose out of the box
- In production with Nginx, the rewrites never trigger because Nginx intercepts `/api/*` first
- If there's already a `next.config.mjs` or `next.config.ts`, convert to that format instead

### 2. Check for existing next.config files

Before creating, check:
```bash
ls frontend/next.config*
```

If `next.config.mjs` exists, use ESM format:
```js
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://backend:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

If `next.config.ts` exists, use TypeScript format with the same logic.

### 3. Update `docker-compose.yml` — add BACKEND_URL to frontend service

In the frontend service's `environment` section, add:

```yaml
    environment:
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-auto}
      - NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-}
      - BACKEND_URL=http://backend:8000
```

`BACKEND_URL` is a server-side env var (no `NEXT_PUBLIC_` prefix), so it's available at runtime for the rewrites function. It does NOT need to be in build args.

### 4. Update `frontend/Dockerfile` — ensure standalone output includes rewrites

The rewrites config needs to be present at build time. Since `next.config.js` is already COPY'd with `COPY . .`, this should work automatically. But verify the standalone output includes the config:

After the existing `COPY --from=builder` lines, the rewrites should work because Next.js standalone mode includes the server that handles rewrites.

**No Dockerfile changes should be needed** — just verify the existing `COPY . .` before `RUN npm run build` picks up the new `next.config.js`.

### 5. Fix the install script `install.sh`

The install script is at the project root (and deployed to `/var/www/helixnode.tech/install.sh`). Find where it creates the `.env` file and ensure these fixes:

a. **Create `.openclaw` directory before docker compose up:**
```bash
mkdir -p ~/.openclaw
```
Add this line before the `docker compose up -d` command.

b. **Move log file to user-writable location:**
Replace all references to `/var/log/helix-install.log` with `$HOME/.helix/install.log`, and add `mkdir -p "$HOME/.helix"` before the first log write.

c. **Add root guard at the top of the script** (after shebang):
```bash
if [ "$(id -u)" -eq 0 ]; then
    echo ""
    echo "[HELIX] ERROR: Don't run this script with sudo or as root."
    echo "[HELIX] Run it as your normal user:"
    echo ""
    echo "  curl -fsSL https://helixnode.tech/install.sh | bash"
    echo ""
    exit 1
fi
```

### 6. Apply to BOTH production and staging

This fix must be applied to both codebases:
- `~/helix-mission-control/` (production, main branch)
- `~/helix-staging/` (staging branch)

For production: apply on main branch, rebuild frontend only (`docker compose up -d --build frontend`)
For staging: apply on staging branch, rebuild frontend only

**IMPORTANT:** Do NOT change production's docker-compose.yml networking (it uses Docker bridge with service names `db`, `redis`, `gateway`). Do NOT change staging's networking (it uses `network_mode: host` with localhost ports). Only add the `BACKEND_URL` env var to the frontend service.

For staging's docker-compose.yml, the BACKEND_URL should be:
```yaml
- BACKEND_URL=http://localhost:8000
```
(because staging uses `network_mode: host`)

### 7. Verify

After rebuilding frontend on production:
```bash
# Should return backend health response, not Next.js 404
curl http://localhost:3000/api/health
```

Expected: `{"status":"ok","service":"helix-mission-control","gateway_connected":true}`

## What NOT to change

- Do NOT modify `api.ts` or `billing.ts` fetch base URL logic — the empty string base is correct, the proxy handles routing
- Do NOT change Nginx configs — Nginx still handles `/api/*` in production, the Next.js rewrite is a fallback for non-proxied setups
- Do NOT change backend ports or networking
- Do NOT change the Dockerfile's `ENV NEXT_PUBLIC_API_URL=http://localhost:8000` — it's harmless and may be used by other code

## After completion

Update CODEBASE-CONTEXT.md:
- Add this fix to Recent Changes section
- Note that `next.config.js` now proxies `/api/*` to backend via rewrites
- Note install.sh fixes (root guard, log path, .openclaw mkdir)

Then:
```bash
git add -A && git commit -m "fix: add Next.js API rewrites for fresh installs without reverse proxy

- Add next.config.js with /api/* rewrite to backend container
- Add BACKEND_URL env var to frontend service in docker-compose.yml
- Fix install.sh: root guard, user-writable log path, pre-create .openclaw dir
- Fixes 404 on onboarding for Docker Desktop installs without Nginx" && git push
```
