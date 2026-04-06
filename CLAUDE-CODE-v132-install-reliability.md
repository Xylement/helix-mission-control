# Claude Code Task: v1.3.2 — Installation Reliability

Read CODEBASE-CONTEXT.md first.

## Overview

Fresh installs are broken for both script-based and manual installations. This task fixes every known installation issue to make HELIX work out of the box — no manual debugging required.

## Issues to Fix

1. Frontend can't reach backend (NEXT_PUBLIC_API_BASE_URL not set)
2. Gateway never starts (GENERATE_CONFIG missing, no openclaw config)
3. GATEWAY_TOKEN and SERVICE_TOKEN warnings
4. ~/.openclaw/ directory not created
5. Hardcoded backend:8000 leaks into builds
6. Dockerfile bakes wrong env var
7. Next.js standalone doesn't proxy rewrites properly
8. Manual install docs reference non-existent Alembic
9. No .env auto-generation for manual installs

---

## Fix 1: Rewrite `frontend/Dockerfile` — No hardcoded API URLs

**File:** `frontend/Dockerfile`

Remove all hardcoded API URLs from the Dockerfile. The frontend should work with empty/relative URLs and rely on the backend being accessible at `localhost:8000` (exposed port).

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

Key changes:
- **Remove** `ENV NEXT_PUBLIC_API_URL=http://localhost:8000` — this var is not used by any code and causes confusion
- Keep `ARG/ENV NEXT_PUBLIC_API_BASE_URL=` — this IS used by api.ts's `getApiBase()`
- No other API-related env vars baked in

## Fix 2: Rewrite `frontend/src/lib/api.ts` — Smart API base detection

**File:** `frontend/src/lib/api.ts`

Replace the `getApiBase()` function with a robust version that works in ALL scenarios:

```typescript
const getApiBase = (): string => {
  // 1. Explicit env variable (highest priority — set by user or docker-compose)
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  
  // 2. Client-side (browser): always use same-origin relative path
  // This works with Nginx/Caddy reverse proxy AND with direct port access
  if (typeof window !== 'undefined') {
    // If accessing on port 3000, redirect API calls to port 8000 on same host
    const loc = window.location;
    if (loc.port === '3000') {
      return `${loc.protocol}//${loc.hostname}:8000`;
    }
    // Behind reverse proxy (port 80/443) — use relative path
    return '';
  }
  
  // 3. Server-side (SSR): use Docker internal network
  return 'http://backend:8000';
};
```

This handles ALL cases:
- **Behind Nginx/Caddy** (port 80/443): returns `''` → relative `/api/...` → proxy forwards
- **Direct Docker access** (port 3000): returns `http://localhost:8000` → browser hits backend directly
- **Custom domain on port 3000**: returns `http://yourdomain.com:8000`
- **SSR (server-side)**: returns `http://backend:8000` → Docker internal network
- **Explicit override**: `NEXT_PUBLIC_API_BASE_URL` always wins

IMPORTANT: The `typeof window !== 'undefined'` check is the key — server-side code (SSR) uses Docker network names, client-side code (browser) uses the actual hostname.

## Fix 3: Update `docker-compose.yml` — Proper defaults

**File:** `docker-compose.yml`

Update the frontend service environment section:

```yaml
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: helix-frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-}
    healthcheck:
      test: ["CMD-SHELL", "wget -qO /dev/null http://localhost:3000 || exit 1"]
      interval: 30s
      timeout: 10s
      start_period: 30s
      retries: 3
    depends_on:
      - backend
```

Changes:
- **Remove** `NEXT_PUBLIC_API_URL` — not used anywhere
- Keep `NEXT_PUBLIC_API_BASE_URL` — empty default means auto-detection kicks in
- **Remove** `BACKEND_URL` — no longer needed since we removed Next.js rewrites approach

Also ensure the gateway service has these env vars:

```yaml
  gateway:
    # ... existing config ...
    environment:
      - GATEWAY_TOKEN=${GATEWAY_TOKEN:-default-gateway-token}
```

And the backend service:

```yaml
  backend:
    # ... existing config ...
    environment:
      # ... existing vars ...
      - GENERATE_CONFIG=${GENERATE_CONFIG:-true}
      - SERVICE_TOKEN=${SERVICE_TOKEN:-}
      - GATEWAY_TOKEN=${GATEWAY_TOKEN:-default-gateway-token}
```

## Fix 4: Remove `frontend/next.config.mjs` rewrites

**File:** `frontend/next.config.mjs`

Remove the rewrite rules — they don't work in standalone mode and cause confusion:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

export default nextConfig;
```

The API routing is now handled entirely by `getApiBase()` in api.ts.

## Fix 5: Update `.env.example` — Complete, working defaults

**File:** `.env.example`

Rewrite to be a complete, working config that a fresh install can use directly:

```bash
# ============================================================
# HELIX Mission Control — Configuration
# ============================================================
# Copy this file to .env and edit the values below.
# Required fields are marked with [REQUIRED].

# === Organization ===
ORG_NAME=My Company

# === Admin Account [REQUIRED] ===
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme123

# === AI Model [REQUIRED — configure at least one] ===
# Providers: moonshot, openai, anthropic, gemini, openrouter, nvidia, kimi_code, custom
MODEL_PROVIDER=gemini
MODEL_NAME=gemini-2.5-flash
MODEL_API_KEY=              # [REQUIRED] Get free key at https://aistudio.google.com/apikey
MODEL_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
MODEL_DISPLAY_NAME=Google Gemini
MODEL_CONTEXT_WINDOW=1000000
MODEL_MAX_TOKENS=65536

# === Gateway ===
GATEWAY_PORT=18789
GATEWAY_URL=ws://gateway:18789
GATEWAY_TOKEN=              # Auto-generated if empty
GENERATE_CONFIG=true        # Generate openclaw.json from model config (set false for manual config)

# === Domain & SSL ===
DOMAIN=                     # Your domain (leave empty for localhost access)
ENABLE_SSL=false

# === Database ===
POSTGRES_USER=helix
POSTGRES_PASSWORD=          # Auto-generated if empty
POSTGRES_DB=helix_mc

# === Redis ===
REDIS_URL=redis://redis:6379/0

# === Authentication ===
AUTH_MODE=local
JWT_SECRET=                 # Auto-generated if empty

# === Frontend ===
NEXT_PUBLIC_API_BASE_URL=   # Leave empty for auto-detection (recommended)

# === Telegram (optional) ===
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=

# === Service Token (optional — for API integrations) ===
SERVICE_TOKEN=

# === Email (optional — for password reset) ===
RESEND_API_KEY=
FROM_EMAIL=noreply@yourdomain.com
```

## Fix 6: Create `scripts/setup-env.sh` — Auto-generate .env from .env.example

**File:** `scripts/setup-env.sh`

Create a setup script that generates `.env` from `.env.example` with auto-generated secrets:

```bash
#!/bin/bash
set -e

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

if [ -f "$ENV_FILE" ]; then
    echo "[HELIX] .env already exists. Skipping setup."
    echo "[HELIX] To regenerate, delete .env and run this script again."
    exit 0
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
    echo "[HELIX] ERROR: .env.example not found"
    exit 1
fi

echo "[HELIX] Generating .env from .env.example..."

# Copy example
cp "$EXAMPLE_FILE" "$ENV_FILE"

# Auto-generate secrets
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
POSTGRES_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)
GATEWAY_TOKEN=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)

# Inject generated values
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
sed -i "s|^GATEWAY_TOKEN=.*|GATEWAY_TOKEN=${GATEWAY_TOKEN}|" "$ENV_FILE"

echo "[HELIX] .env generated with auto-generated secrets."
echo "[HELIX] IMPORTANT: Edit .env and set your MODEL_API_KEY before starting."
echo ""
echo "  nano .env"
echo ""
```

Make executable:
```bash
chmod +x scripts/setup-env.sh
```

## Fix 7: Gateway should start even without AI model key

**File:** `gateway/entrypoint.sh`

The gateway currently shows "No AI model key configured" and polls forever. Instead, it should start the OpenClaw server in a "waiting" state so that:
- The Docker health check doesn't show unhealthy
- The backend can connect and register agents
- Config syncs work when the user adds a model later

Modify the polling loop to:
1. Still show the message that no model is configured
2. But START the OpenClaw server anyway with a minimal config
3. When a real model config appears, restart/reload OpenClaw

If this is too complex to modify in OpenClaw itself, at minimum:
- Change the health check for gateway to not mark as unhealthy when waiting for config
- Add a clear message in the HELIX UI: "Gateway is waiting for AI model configuration. Go to Settings > AI Models to configure."

**Alternative simpler fix:** In the gateway entrypoint, create a minimal openclaw.json with a dummy provider so OpenClaw starts, then the real config overwrites it when the user configures a model:

```bash
if [ -z "$MODEL_API_KEY" ] && [ ! -f "$OPENCLAW_CONFIG" ]; then
    echo "Creating minimal gateway config (waiting for AI model setup)..."
    mkdir -p "$(dirname "$OPENCLAW_CONFIG")"
    cat > "$OPENCLAW_CONFIG" << 'MINIMAL_EOF'
{
    "server": {
        "host": "0.0.0.0",
        "port": 18789
    }
}
MINIMAL_EOF
fi
```

Then start OpenClaw regardless. It will accept connections but won't be able to process AI requests until a model is configured. The HELIX backend already handles gateway errors gracefully.

## Fix 8: Add `/api/health/setup` endpoint — Setup health check

**File:** `backend/app/routers/health.py` (new, or add to existing health endpoint)

Add a public (no auth) setup check endpoint:

```
GET /api/health/setup
```

Returns:
```json
{
  "status": "ok",
  "checks": {
    "database": { "ok": true, "message": "Connected" },
    "redis": { "ok": true, "message": "Connected" },
    "gateway": { "ok": false, "message": "Not connected — configure AI model in Settings > AI Models" },
    "model_configured": { "ok": false, "message": "No AI model configured" },
    "license": { "ok": true, "message": "Trial active, expires in 7 days" },
    "admin_exists": { "ok": true, "message": "Admin account configured" },
    "onboarding": { "ok": false, "message": "Onboarding not completed" }
  },
  "ready": false,
  "next_step": "Configure AI model in Settings > AI Models"
}
```

This helps users and support diagnose issues without SSH access.

## Fix 9: Frontend setup check page

**File:** `frontend/src/app/setup-check/page.tsx` (new)

Create a simple public page at `/setup-check` that calls `/api/health/setup` and displays a checklist:

- ✅ Database connected
- ✅ Redis connected
- ❌ Gateway not connected — Configure AI model
- ✅ Admin account exists
- ❌ Onboarding not completed

With links to fix each issue. No auth required — this is a diagnostic page.

Add a banner on the Dashboard that shows when setup is incomplete: "Setup incomplete — [View Setup Checklist](/setup-check)"

## Fix 10: Create required directories in docker-compose.yml

**File:** `docker-compose.yml`

Ensure the gateway volume mount creates the directory if it doesn't exist. Docker does this automatically for bind mounts, but verify the path is correct.

Check current gateway volumes and ensure:
```yaml
  gateway:
    volumes:
      - ${HOME:-.}/.openclaw:/home/openclaw/.openclaw
```

The `${HOME:-.}` ensures it works even if HOME isn't set.

Also add a startup script or init container that creates required directories:

Add to the backend service:
```yaml
  backend:
    # ... existing config ...
    volumes:
      - ./data:/app/data
      - ./VERSION:/app/VERSION:ro
```

Ensure `data/` directory exists:
```bash
mkdir -p data
```

## Fix 11: Update install.sh — Ensure all env vars are set

**File:** `install.sh`

In the section that generates `.env`, ensure ALL of these are included:

```bash
GENERATE_CONFIG=true
GATEWAY_TOKEN=$(generate_random_token)
SERVICE_TOKEN=
NEXT_PUBLIC_API_BASE_URL=
```

Also ensure `mkdir -p ~/.openclaw` is called before `docker compose up`.

Check the current install.sh and add any missing env vars. The generated `.env` should be a complete working config — user should only need to add their AI model API key during onboarding.

## Fix 12: Update manual installation docs

**File:** `~/helixnode-docs/getting-started/installation.md`

Replace the Manual Installation section with:

```markdown
## Manual Installation

### 1. Clone and setup

```bash
git clone https://github.com/Xylement/helix-mission-control.git
cd helix-mission-control
```

### 2. Generate environment config

```bash
bash scripts/setup-env.sh
```

This creates `.env` with auto-generated secrets (JWT, database password, gateway token).

### 3. (Optional) Configure AI model now

Edit `.env` and set your AI model API key:

```bash
nano .env
```

Set `MODEL_API_KEY` to your API key. For a free Google Gemini key, visit [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

You can also skip this and configure the model from the web UI after starting.

### 4. Start HELIX

```bash
docker compose up -d --build
```

This builds and starts all services (database, Redis, gateway, backend, frontend). First build takes 3-5 minutes.

### 5. Access the dashboard

Open [http://localhost:3000](http://localhost:3000) in your browser.

The onboarding wizard will guide you through:
- Creating your organization and admin account
- Activating a license (or starting a free trial)
- Configuring your AI model (if not done in step 3)
- Setting up departments and agents

### 6. Verify setup

Visit [http://localhost:3000/setup-check](http://localhost:3000/setup-check) to see if all services are running correctly.

> **Troubleshooting:** If you see "Loading..." on pages, check the [Troubleshooting](#troubleshooting) section below.
```

---

## Apply to Both Production and Staging

Apply all changes to `~/helix-mission-control/` (main branch) first. Then copy changed files to `~/helix-staging/` (staging branch).

**IMPORTANT production notes:**
- Production uses Nginx reverse proxy — the new `getApiBase()` handles this (returns '' for port 80/443)
- Production has `GENERATE_CONFIG=false` in `.env` — do NOT change this
- Production's docker-compose.yml has different networking — only change the frontend environment section, not backend/gateway networking
- Test on staging first before applying to production

## Build and Deploy

```bash
# Build and test on staging first
cd ~/helix-staging
docker compose up -d --build backend frontend

# Verify staging works
curl http://localhost:3001/api/health  # or whatever staging port is

# Then apply to production
cd ~/helix-mission-control
docker compose up -d --build backend frontend
```

## After Completion

Update CODEBASE-CONTEXT.md:
- Note the new getApiBase() logic in api.ts
- Note the setup-check endpoint and page
- Note the setup-env.sh script
- Add to Recent Changes

Update VERSION to 1.3.2:
```bash
echo "1.3.2" > VERSION
```

Then:
```bash
cd ~/helix-mission-control
git add -A && git commit -m "fix: v1.3.2 — installation reliability overhaul

- Smart API base detection (works behind proxy, direct Docker, and custom domains)
- Remove hardcoded URLs from Dockerfile and next.config
- Gateway starts even without model key configured
- Setup health check endpoint and diagnostic page
- Auto-generate .env with secrets via setup-env.sh
- Complete .env.example with all required vars and defaults
- Updated manual installation docs" && git push

cd ~/helix-staging
git add -A && git commit -m "fix: v1.3.2 — installation reliability" && git push
```

Update license server version:
```bash
cd ~/helixnode-api
sed -i 's/LATEST_HELIX_VERSION=.*/LATEST_HELIX_VERSION=1.3.2/' .env
sed -i 's/LATEST_HELIX_RELEASE_DATE=.*/LATEST_HELIX_RELEASE_DATE=2026-04-06/' .env
docker compose restart license-api
```

Also update admin dashboard LATEST_VERSION if it has one:
```bash
cd ~/helixnode-admin
grep -r "LATEST_VERSION\|1.3.1" frontend/src/lib/utils.ts && sed -i "s/1.3.1/1.3.2/g" frontend/src/lib/utils.ts
docker compose up -d --build frontend
```
