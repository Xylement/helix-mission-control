# HELIX Mission Control — Codebase Context
## Living reference for Claude Code sessions
## Last updated: March 19, 2026 (post Phase 6, Stripe live)

---

## 1. System Overview

**Product:** HELIX Mission Control — Multi-agent AI orchestration platform
**Brand:** HelixNode (helixnode.tech)
**Built for:** GALADO (phone cases and charms, Penang, Malaysia)
**Goal:** Sell as self-hosted SaaS

**Two codebases on one VPS (72.60.232.46, user: helix):**

| Codebase | Path | Purpose | Port |
|----------|------|---------|------|
| HELIX Mission Control | ~/helix-mission-control/ | Main product | 3000 (FE), 8000 (BE) |
| HelixNode License Server | ~/helixnode-api/ | Licensing, Stripe, marketplace registry | 8100 |

**URLs:**
- Product: https://helix.galado.com.my (Nginx reverse proxy)
- License API: https://api.helixnode.tech (Nginx -> port 8100)
- Docs: https://docs.helixnode.tech (VitePress static, Nginx)
- Landing: https://helixnode.tech (static HTML, Nginx)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Backend | FastAPI (Python) + SQLAlchemy (async) |
| Database | PostgreSQL 16 (port 5432 main, port 5433 license) |
| Cache | Redis 7 |
| AI Runtime | OpenClaw Gateway (Docker container, port 18789) |
| Default Model | Moonshot Kimi K2.5 (BYOK support) |
| Payments | Stripe (LIVE mode) |
| Email | Resend (noreply@helixnode.tech) |
| Docs | VitePress at ~/helixnode-docs/ |
| Deployment | Docker Compose on Hostinger KVM4 (4 vCPU, 4GB RAM) |
| SSL | Certbot via Nginx |
| Reverse Proxy | Nginx (GALADO instance), Caddy available for new customer installs |

---

## 3. Database Schema — Mission Control (port 5432, db: helix_mc)

### Core Tables

**organizations** — id (UUID PK), name, created_at

**departments** — id (UUID PK), org_id (FK organizations), name, emoji, sort_order

**boards** — id (UUID PK), department_id (FK departments), name, description, sort_order

**users** — id (UUID PK), org_id (FK organizations NOT NULL), email (unique global), password_hash, name (unique per org), role (admin|member), avatar_url, telegram_notifications (bool), telegram_user_id, created_at, last_login_at

**agents** — id (UUID PK), org_id (FK organizations), name (unique per org), role_title, department_id (FK departments), primary_board_id (FK boards), system_prompt, status (online|offline|busy|error), execution_mode (auto|manual), model_provider, model_name, model_api_key_encrypted, ai_model_id (FK ai_models), marketplace_template_slug, last_seen_at, openclaw_session_id, created_at

**tasks** — id (UUID PK), board_id (FK boards), title, description, status (todo|in_progress|review|approved|rejected|done|cancelled), priority (low|medium|high|urgent), assigned_agent_id (FK agents nullable), created_by_user_id (FK users), due_date, requires_approval (bool), approved_by_user_id, approved_at, result (text), tags (TEXT[] DEFAULT '{}'), metadata (JSONB), archived (bool DEFAULT false), started_at, completed_at, created_at, updated_at

**comments** — id (UUID PK), task_id (FK tasks), user_id (FK users nullable), agent_id (FK agents nullable), author_type, author_name, content, mentions (JSONB), created_at

**activity_log** — id (UUID PK), org_id (FK organizations), actor_type (user|agent|system), actor_id, action, target_type, target_id, metadata (JSONB — includes task_title, board_name, agent_name etc.), created_at

**notifications** — id (UUID PK), org_id, user_id (FK users), type, title, message, target_type, target_id, read (bool), telegram_sent (bool), created_at. Index: (user_id, read, created_at)

**task_attachments** — id (UUID PK), task_id (FK tasks CASCADE), org_id, filename, file_path, file_size, mime_type, uploaded_by_user_id, uploaded_by_agent_id, created_at

### Permission Tables

**board_permissions** — id (UUID PK), board_id (FK boards), user_id (FK users), permission_level (no_access|view|create|manage), granted_by_user_id (FK users nullable), created_at

### Config Tables

**organization_settings** — id (UUID PK), org_id (FK organizations UNIQUE), model_provider, model_name, model_api_key_encrypted, model_base_url, model_display_name, model_context_window (256000), model_max_tokens (8192), telegram_bot_token_encrypted, telegram_allowed_user_ids, timezone (Asia/Kuala_Lumpur), max_agents (50), created_at, updated_at

**service_tokens** — id (UUID PK), org_id (FK organizations), name, token_hash (SHA256), token_prefix (8 chars), last_used_at, created_at, revoked_at

**gateways** — id (UUID PK), org_id (FK organizations), name, websocket_url, token, created_at

**onboarding_state** — id (UUID PK), org_id (FK organizations nullable), current_step (1-8), completed (bool), data (JSON), created_at, updated_at

**license_cache** — id (INTEGER PK, singleton row=1), license_key_prefix, plan, status, max_agents, max_members, features (JSONB), trial (bool), trial_ends_at, current_period_end, grace_period_ends, message, last_validated_at, cached_response (JSONB)

### Skills Tables

**skills** — id (UUID PK), org_id (FK organizations), name (200), slug (100 unique per org), version (20), description, category (50), tags (TEXT[]), content (TEXT markdown), frontmatter (JSONB), activation_mode (always|board|tag), activation_boards (UUID[]), activation_tags (TEXT[]), created_by (FK users), is_system (bool), marketplace_template_id (100), created_at, updated_at

**agent_skills** — id (UUID PK), agent_id (FK agents CASCADE), skill_id (FK skills CASCADE), assigned_at, assigned_by (FK users). UNIQUE(agent_id, skill_id)

**skill_attachments** — id (UUID PK), skill_id (FK skills CASCADE), filename, original_filename, description, file_size, mime_type, storage_path, uploaded_by (FK users), uploaded_at

### AI Model Tables

**ai_models** — id (UUID PK), org_id (FK organizations), provider_name, display_name, api_key_encrypted (Fernet), base_url, models (JSONB), is_default (bool), is_active (bool), created_at, updated_at

**token_usage_log** — id (UUID PK), org_id, agent_id, model_provider, model_name, input_tokens, output_tokens, total_tokens, estimated_cost_usd, task_id, created_at

### Marketplace Install Tables

**installed_templates** — id (UUID PK), org_id, template_slug, template_type (agent|skill), template_name, template_version, manifest (JSON), local_resource_id, local_resource_type, installed_by (FK users), installed_at, is_active (bool)

### Workflow Tables

**workflows** — id (UUID PK), org_id, name, description, emoji, trigger_type (manual|schedule|event), trigger_config (JSONB), is_active (bool), marketplace_template_slug, created_by (FK users), created_at, updated_at

**workflow_steps** — id (UUID PK), workflow_id (FK CASCADE), step_id (50), name, step_type (agent|human|notification), agent_id (FK agents SET NULL), action_prompt, depends_on (ARRAY String), timeout_minutes (60), requires_approval (bool), step_order, position_x, position_y, config (JSONB)

**workflow_executions** — id (UUID PK), workflow_id (FK CASCADE), org_id, status (running|paused|completed|failed|cancelled), input_data (JSONB), output_data (JSONB), started_by (FK users), started_at, completed_at, error_message

**workflow_step_executions** — id (UUID PK), execution_id (FK CASCADE), step_id, task_id (FK tasks SET NULL), status (pending|running|waiting_approval|completed|failed|skipped), input_data (JSONB), output_data (JSONB), started_at, completed_at, error_message

### Plugin Tables

**installed_plugins** — id (UUID PK), org_id (FK CASCADE), plugin_slug, name, emoji, description, plugin_type (api_connector|webhook_receiver|data_processor|notification_channel), manifest (JSONB), credentials_encrypted (LargeBinary Fernet), settings_values (JSONB), is_active (bool), is_configured (bool), marketplace_template_slug, installed_by (FK users), installed_at, last_used_at

**agent_plugins** — id (UUID PK), agent_id (FK CASCADE), plugin_id (FK CASCADE), capabilities (JSONB), assigned_at, assigned_by (FK users). UNIQUE(agent_id, plugin_id)

**plugin_executions** — id (UUID PK), org_id (FK CASCADE), plugin_id (FK CASCADE), agent_id (FK SET NULL), capability_id, capability_name, request_data (JSONB), response_data (JSONB), response_status_code, status (pending|success|error|timeout), error_message, duration_ms, executed_by (FK users), executed_at

---

## 4. Database Schema — License Server (port 5433, db: helix_license)

**licenses** — id (UUID PK), license_key_hash (SHA256 UNIQUE), license_key_prefix, customer_email (indexed), customer_name, plan, billing_interval, stripe_customer_id, stripe_subscription_id, instance_id, instance_domain, instance_version, status (active|expired|cancelled|suspended|payment_failed), trial (bool), trial_ends_at, current_period_start, current_period_end, grace_period_ends, last_transfer_at, reported_agents, reported_members, last_validated_at, created_at, activated_at, cancelled_at

**license_events** — id (UUID PK), license_id (FK NOT NULL), event_type, metadata (JSON), created_at

**marketplace_categories** — id (UUID PK), slug (UNIQUE), name, description, icon (emoji), display_order, created_at

**marketplace_creators** — id (UUID PK), license_key_hash, username (UNIQUE), display_name, avatar_url, bio, website, is_verified (bool), is_official (bool), template_count, total_installs, created_at

**marketplace_templates** — id (UUID PK), slug (UNIQUE), type (agent|workflow|plugin|skill|department_pack), name, emoji, version, author_id (FK creators), description, long_description, category_id (FK categories), tags (TEXT[]), manifest (JSONB), icon_url, screenshots (TEXT[]), status (draft|in_review|approved|rejected|published|deprecated), is_official (bool), is_featured (bool), min_helix_version, min_plan, required_plugins (TEXT[]), install_count, rating_avg, rating_count, published_at, created_at, updated_at

**marketplace_reviews** — id (UUID PK), template_id (FK CASCADE), license_key, reviewer_name, rating (1-5), title, body, helpful_count, is_flagged (bool), flagged_reason, created_at. UNIQUE(template_id, license_key)

**marketplace_review_responses** — review_id (FK reviews), creator_id (FK creators), body, created_at

**marketplace_installs** — id (UUID PK), template_id (FK CASCADE), license_key, helix_version, installed_at

**marketplace_submissions** — id (UUID PK), creator_id (FK creators), template_id (FK templates), status, reviewer_notes, submitted_at, reviewed_at

**license_marketplace_installs** — id (UUID PK), license_key, template_id (FK templates), template_type, installed_at, uninstalled_at. UNIQUE(license_key, template_id)

---

## 5. Backend Services — Mission Control

| Service | File | Purpose |
|---------|------|---------|
| Gateway | services/gateway.py | OpenClaw WebSocket client, task dispatch with skill injection |
| Task Status | services/task_status.py | Status transition matrix — agents NEVER set "done", only "review" |
| Activity | services/activity.py | Log activity + WebSocket publish |
| WebSocket Manager | services/websocket_manager.py | Connection management, broadcast |
| Event Bus | services/event_bus.py | Redis pub/sub |
| Notifications | services/notifications.py | Create + deliver notifications |
| Telegram Notify | services/telegram_notify.py | Telegram Bot API |
| License Service | services/license_service.py | Validate, enforce limits, 72h cache |
| Skill Service | services/skill_service.py | CRUD, resolve_active_skills, workspace sync |
| Marketplace Service | services/marketplace_service.py | Proxy to api.helixnode.tech |
| Install Service | services/install_service.py | Install/uninstall marketplace templates |
| Export Service | services/export_service.py | Export agent/skill as manifest |
| Workflow Engine | services/workflow_engine.py | DAG execution, step advancement, task hooks |
| Workflow Service | services/workflow_service.py | CRUD, feature gating (Pro+) |
| Plugin Runtime | services/plugin_runtime.py | Execute capabilities, encrypt credentials |
| Model Providers | services/model_providers.py | 6-provider registry (moonshot, openai, anthropic, nvidia, kimi_code, custom) |
| Permissions | services/permissions.py | Board permission checks, filtering (default-closed model) |
| Encryption | utils/encryption.py | Fernet encrypt/decrypt (JWT_SECRET derived) |

---

## 6. Auth System

**Three auth methods (core/deps.py):**
1. JWT — user login, org_id in token
2. Legacy LOCAL_AUTH_TOKEN — backward compat
3. Service tokens — SHA256 hashed, for integrations (Helix Telegram bot)

**Admin + service tokens bypass board permissions.**

**Board permissions (default-closed model):**
- Members have NO access to any board unless explicitly granted
- Permission levels: no_access < view < create < manage
- `view` — see board and tasks, can comment
- `create` — view + create tasks, edit/delete own tasks only
- `manage` — full access (edit/delete any task)
- `no_access` — stored as explicit DB record; board hidden from user
- Admins always have full access to all boards
- Enforced on: board listing, board detail, task CRUD, task listing/search, comments, dashboard stats, activity feed
- Frontend: hides boards/departments with no access, hides create/edit/delete buttons based on permission level
- Service: `backend/app/services/permissions.py` (check_board_access, filter_boards_by_permission, get_user_accessible_board_ids)
- Board listing response includes `user_permission` field for frontend UI decisions

---

## 7. Key Architecture Patterns

1. Agents can NEVER set tasks to "done" — only "review". Humans approve.
2. Org-scoped everything — all queries filter by org_id
3. Skills inject into agent prompt at dispatch time via resolve_active_skills()
4. Workspace sync — system_prompt to SOUL.md, skills to SKILLS.md
5. Rich metadata in activity_log — denormalized at write time
6. WebSocket via Redis pub/sub
7. Fernet encryption for API keys and plugin credentials
8. HTTP-first Nginx then Certbot (SSL chicken-and-egg pattern)
9. Docker env vars must be explicit in docker-compose.yml
10. helix user has no sudo

---

## 8. Known Issues

- ~~Board permissions not enforced~~ — **FIXED** (default-closed model, enforced on all endpoints)
- ~~Activity feed lacks department colors~~ — **FIXED** (colorized by department and action type)
- Frontend health check occasionally shows unhealthy (cosmetic)
- Billing history is placeholder (links to Stripe Portal)
- ~~Gateway config sync from DB to container needs restart~~ — **FIXED** (backend syncs model config from DB to openclaw.json on startup)

---

## 9. Seed Data

- GALADO org with 5 departments, 18 boards, 20 agents, 4 users, 10 custom skills
- License: HLX-O7SR-YT8U-1WEI-MFZU (Scale, 50 agents, 25 members, exp Mar 2027)
- Marketplace: 11 categories, 1 official creator, 51 published templates

---

## 10. How to Update This File

After every Claude Code session that creates/modifies files:
1. Claude Code should append changes to the "Recent Changes" section
2. If new tables/columns were added, update Section 3 or 4
3. If new endpoints were added, note them
4. If bugs were fixed, move them from Section 8 to a "Fixed" note

---

## 11. Recent Changes

### March 19, 2026 — Board Permission Enforcement

**New file:** `backend/app/services/permissions.py` — Centralized permission checking service

**Backend changes:**
- `routers/boards.py` — List boards filters by permission; new `GET /boards/{id}` with permission check; response includes `user_permission` field
- `routers/tasks.py` — Task listing/search filtered by accessible boards; `GET /tasks/{id}` checks VIEW; `PATCH /tasks/{id}` enforces CREATE=own-only, MANAGE=any; `DELETE /tasks/{id}` enforces CREATE=own, MANAGE=any
- `routers/comments.py` — `GET` and `POST` comments check VIEW permission on task's board
- `routers/dashboard.py` — Stats and activity filtered by accessible boards; departments with no accessible boards hidden
- `routers/activity.py` — Activity feed filtered by accessible boards (both paginated and legacy)
- `routers/board_permissions.py` — Accepts `no_access` as valid permission level
- `schemas/board.py` — `BoardOut` includes `user_permission: str | None`

**Frontend changes:**
- `lib/api.ts` — `Board` type includes `user_permission` field
- `app/boards/[id]/page.tsx` — Access denied page; hides create/edit/delete buttons based on permission
- `app/boards/page.tsx` — Hides departments with no accessible boards
- `app/dashboard/page.tsx` — Task creation modal only shows boards with create/manage permission
- `app/team/page.tsx` — Saves "No Access" as `no_access` DB record instead of revoking

**Permission model:** Default-closed — members see nothing unless explicitly granted access via Team page.

### March 19, 2026 — License Enforcement Tightening

**Backend changes:**
- `services/license_service.py` — Default plan changed from 999 agents/members to 0/0 with status `no_license` and `valid: false`. Added `_get_effective_license_key()` (checks env first, then DB). Added `save_license_key()` for DB persistence. `_cache_response()` now stores full license key for DB fallback.
- `routers/billing.py` — Added `POST /billing/activate` (activate license key, save to DB, validate against license server). Added `POST /billing/trial` (start 7-day free trial via api.helixnode.tech, auto-save trial key to DB).
- `main.py` — Added `ALTER TABLE license_cache` to widen `license_key_prefix` column to VARCHAR(30) for full key storage.

**Frontend changes:**
- `components/onboarding/license-step.tsx` — Removed "Skip for now" button; license step is now mandatory.
- `app/onboarding/page.tsx` — License step (step 3) cannot be skipped; stepper prevents jumping past it.
- `components/billing/TrialLockScreen.tsx` — Now shows lock screen for `no_license` status (in addition to expired/trial-expired).
- `components/billing/PlanBanner.tsx` — Added banner for `no_license` status with "Activate" CTA.

**Migration:** `011_widen_license_key_prefix.py` — Widens `license_key_prefix` from VARCHAR(20) to VARCHAR(30).

**License enforcement model:** Without a license key (env or DB), the system returns `valid: false`, `max_agents: 0`, `max_members: 0`. Users must activate a license during onboarding. Existing instances with LICENSE_KEY in .env are unaffected.

### March 19, 2026 — Docs Site: Remove Dashboard Link

**External change (~/helixnode-docs):**
- `.vitepress/config.mts` — Nav "Links" dropdown: changed `{ text: 'Dashboard', link: 'https://helix.galado.com.my' }` to `{ text: 'Get Started', link: '/getting-started/installation' }`. Removes public link to internal GALADO instance.

### March 19, 2026 — Install Script Repo URL Fix

- `install.sh` — Updated `HELIX_REPO` from `https://github.com/nicholasgalado/helix-mission-control.git` to `https://github.com/Xylement/helix-mission-control.git` (correct GitHub org).

### March 19, 2026 — Docs: Beta Tester Quick Start Page

**External change (~/helixnode-docs):**
- **New file:** `getting-started/beta-quickstart.md` — Beta tester quickstart guide covering VPS requirements, AI API key providers, license key activation, install command (`curl -fsSL https://helixnode.tech/install.sh | bash`), onboarding wizard walkthrough (8 steps), first things to try (tasks, @mentions, marketplace, workflows, skills), useful Docker commands, and feedback guidelines. Beta plan: Starter (5 agents, 3 members, 90 days free).
- `.vitepress/config.mts` — Added `{ text: 'Beta Quick Start', link: '/getting-started/beta-quickstart' }` as last item in Getting Started sidebar.

### March 24, 2026 — Install URL Standardization

- `install.sh` — Updated usage comment URL from `raw.githubusercontent.com/<repo>/...` to `https://helixnode.tech/install.sh`
- **External change (~/helixnode-docs):** `getting-started/installation.md` — Fixed manual install git clone URL from `github.com/helixnode/...` to `github.com/Xylement/helix-mission-control.git`
- Install script copied to web server at `helixnode.tech/install.sh` — all docs now point to `curl -fsSL https://helixnode.tech/install.sh | bash`

### March 24, 2026 — Repo Cleanup & Docs sudo Fix

**Git repo fixes:**
- Removed `frontend/.git` nested directory — frontend source files now tracked directly in the main repo (was previously treated as a submodule)
- Added `frontend/public/.gitkeep` — fixes frontend build failure due to missing public directory

**External change (~/helixnode-docs):**
- `getting-started/installation.md` — Changed all install commands from `| bash` to `| sudo bash` (5 occurrences)
- `getting-started/beta-quickstart.md` — Changed install command from `| bash` to `| sudo bash`
- Rebuilt docs to `/tmp/docs-dist-sudo/` for deployment

### March 24, 2026 — Gateway Graceful Startup on Fresh Install

**Problem:** On fresh installs, the gateway container crashes because MODEL_API_KEY is empty (not configured until onboarding), which blocks the backend from starting (it depended on gateway being healthy).

**docker-compose.yml:**
- Backend's gateway dependency changed from `condition: service_healthy` to `condition: service_started` — backend starts regardless of gateway health
- Gateway restart policy changed from `restart: unless-stopped` to `restart: on-failure:5` — retries a few times but doesn't loop forever

**gateway/entrypoint.sh:**
- Added early check: if MODEL_API_KEY is empty, prints "No AI model key configured. Gateway will start after onboarding." and sleeps in a loop instead of crashing

**install.sh:**
- Creates placeholder OpenClaw directories before Docker starts: `~/.openclaw/workspaces`, `~/.openclaw/identity`, `~/.openclaw/skills`, and `~/.openclaw/openclaw.json` (empty `{}`) — prevents volume mount failures on fresh install
- Sets ownership of `~/.openclaw` to helix user

### March 24, 2026 — Fresh Install Migration Fix

**Problem:** Alembic migrations didn't work on a fresh database. Migration 001 was just a stamp (no tables), and migrations 002-011 tried to ALTER tables that didn't exist. Also, `main.py` crashed on fresh install because `ALTER TABLE license_cache` ran before the table was created (license_cache is raw SQL, not a SQLAlchemy model).

**Deleted:** All 11 incremental migration files (`001_initial_stamp` through `011_widen_license_key_prefix`)

**New file:** `backend/alembic/versions/001_initial_schema.py` — Single migration that creates ALL 28 tables from scratch using `op.create_table()` in correct FK dependency order:
1. organizations → departments → boards → users → ai_models → gateways
2. agents → tasks → comments → activity_logs → notifications
3. organization_settings → service_tokens → task_attachments → board_permissions
4. onboarding_state → token_usage → skills → agent_skills → skill_attachments
5. installed_templates → workflows → workflow_steps → workflow_executions → workflow_step_executions
6. installed_plugins → agent_plugins → plugin_executions
7. license_cache (raw SQL, CREATE TABLE IF NOT EXISTS)

All columns, constraints, indexes, foreign keys, and unique constraints match current SQLAlchemy models.

**main.py fix:** Lifespan now runs `CREATE TABLE IF NOT EXISTS license_cache` before the `ALTER TABLE` to widen `license_key_prefix`, so fresh installs don't crash.

**Existing DB:** Cleared old `alembic_version` and stamped at `001_initial_schema` — no schema changes needed since tables already exist.

### March 24, 2026 — Remove GALADO Branding & Gate Seed Data

**Problem:** Fresh customer installs showed GALADO-specific branding and pre-filled GALADO demo data.

**backend/app/main.py:**
- `seed_all()` now only runs when `SEED_DATA=true` is set in environment. Fresh installs get empty DB (onboarding wizard creates org/admin). GALADO server has `SEED_DATA=true` in its `.env` manually.

**Frontend branding fixes (all GALADO references removed):**
- `app/login/page.tsx` — Email placeholder: `you@galado.com.my` → `you@company.com`. Footer: `GALADO SDN BHD` → `Powered by HelixNode`
- `components/sidebar.tsx` — Subtitle: `GALADO` → `Mission Control`
- `app/team/page.tsx` — Email placeholder: `email@galado.com.my` → `email@company.com`

**Verified:** `grep -ri galado frontend/src/` returns zero matches.

### March 24, 2026 — Fix ensure_helix_user Crash on Fresh Install

**Problem:** `ensure_helix_user()` in `main.py` lifespan crashes on fresh installs because it falls back to `org_id=1` when no organization exists, violating the FK constraint.

**backend/app/main.py:**
- Added check: only call `ensure_helix_user(db)` if at least one organization exists in the DB. Fresh installs skip it; the helix system user gets created after onboarding creates the first org.

### March 25, 2026 — Gateway Agent Registration, Model Config Sync, Kimi Code, Agent Delete, Agent Limit Counter

**Fix 1: Gateway Agent Registration on Fresh Install**

**backend/app/services/gateway.py:**
- Added `_register_missing_agents()` — after connecting to gateway and loading agent list, checks all DB agents and registers any missing from gateway via `agents.create`. Idempotent (skips existing).
- Added `_register_single_agent(name, system_prompt)` — registers one agent with gateway. Creates workspace dir + SOUL.md if missing. Does NOT send `id` — lets OpenClaw assign it, then reads back the assigned ID from the response or falls back to `_find_agent_id_by_name()` lookup.
- Added `_find_agent_id_by_name(name)` — looks up a gateway agent ID by name via `agents.list`.
- Added `unregister_agent(agent_name)` — removes agent from gateway via `agents.delete`.

**backend/app/routers/agents.py:**
- `POST /api/agents/` now registers new agents with gateway after creation.
- `PATCH /api/agents/{id}` re-registers with gateway if name changes.
- `DELETE /api/agents/{id}` now properly cleans up: nullifies task assignments, deletes agent_skills, agent_plugins, agent comments, then removes from gateway.

**Fix 2: Gateway Container Permissions**

**gateway/Dockerfile:**
- Added `/home/openclaw/.openclaw/canvas` and `/home/openclaw/.openclaw/cron` directories with correct ownership.

**gateway/entrypoint.sh:**
- Fixed MC_API_BASE double http:// bug: `"http://${MC_API_BASE:-backend:8000}"` → `"${MC_API_BASE:-http://backend:8000}"`

**Fix 3: Gateway Reads Model Config from DB**

**backend/app/services/gateway.py:**
- Added `sync_model_config_from_db()` — if `MODEL_API_KEY` env var is empty, reads model config from `organization_settings` table (provider, model, encrypted API key) and writes to `/home/helix/.openclaw/openclaw.json`. Backward compatible: skips if env var is set.

**backend/app/main.py:**
- Calls `gateway.sync_model_config_from_db()` in lifespan before starting gateway.

**Fix 4: ensure_helix_user already fixed** (March 24 — org existence check already in main.py)

**Feature 5: Delete Agents**

**Backend:** `DELETE /api/agents/{id}` (admin only, 204) — nullifies task assignments, deletes agent_skills, agent_plugins, agent comments, then deletes agent and unregisters from gateway.

**Frontend:** `app/agents/[id]/page.tsx` — Added red "Delete" button (admin only) with confirmation modal. Lists consequences (unassign tasks, remove skills/plugins/comments). On confirm, calls DELETE and redirects to agents list.

**Feature 6: Onboarding Agent Limit Counter**

**Backend:** Added `GET /api/onboarding/agent-limit` (no auth) — returns `{max_agents, plan}` from license_cache. Default: 5 (trial).

**Frontend:** `components/onboarding/agents-step.tsx` — Shows "{n}/{max} agents selected" counter. When limit reached, disables further selection and shows "limit reached for {plan} plan" message.

**Feature 7: Kimi Code AI Model Provider**

**Backend:** `services/model_providers.py` — Added `kimi_code` provider: base_url `https://api.kimi.com/coding/v1`, model `kimi-for-coding`, key_prefix `sk-kimi-`, context 262144, max_tokens 32768, OpenAI-compatible.

**Gateway:** `gateway/entrypoint.sh` — Added `kimi_code` case with correct base URL and `openai-completions` API type.

**Frontend:**
- `components/onboarding/ai-model-step.tsx` — Dynamic API key placeholder from provider config. Added Kimi Code help link to kimi.com/code/console.
- `app/settings/model-config/page.tsx` — Added Kimi Code help link for API key.

### March 25, 2026 — Fresh Install Fixes (openclaw chown, openclaw.json mount, IPv4)

**install.sh:**
- `.openclaw` directory `chown` changed from `$HELIX_USER:$HELIX_USER` to `1001:1001` — matches the gateway container's `openclaw` user UID, not the host `helix` user.
- IP detection for "Access URL" changed from `curl -s ifconfig.me` to `curl -s4 ifconfig.me` to force IPv4. `hostname -I` fallback now scans for the first dotted-quad address instead of blindly taking the first field (which could be IPv6).

**docker-compose.yml:**
- Backend `openclaw.json` volume mount changed from `:ro` to `:rw` — `sync_model_config_from_db()` needs write access on fresh installs where `MODEL_API_KEY` env is empty.

### March 25, 2026 — Gateway Startup Fixes (polling, config sections, onboarding sync)

**gateway/entrypoint.sh:**
- Replaced infinite `sleep 30` block with polling loop: when `MODEL_API_KEY` env is empty, checks `openclaw.json` every 5s for a valid API key using `config_has_key()` (node script that inspects env values). Starts gateway as soon as key is detected.
- If config already has a key on startup, proceeds immediately without waiting.

**backend/app/services/gateway.py — `sync_model_config_from_db()`:**
- Now includes `gateway` section (`mode: "local"`, port, auth token from `OPENCLAW_GATEWAY_TOKEN` env) and `tools` section if not already present in openclaw.json. OpenClaw requires `gateway.mode=local` to start.
- Merges into existing config — preserves gateway/tools sections if already present (e.g. GALADO).

**backend/app/routers/onboarding.py:**
- Step 3 (AI model config) now calls `gateway.sync_model_config_from_db()` after saving, so the key is written to openclaw.json immediately for the gateway to detect.

**backend/app/routers/settings.py:**
- Model config update (`PUT /settings/model`) also calls `gateway.sync_model_config_from_db()` in addition to the existing .env + container restart flow.

**Fresh install flow:** User completes onboarding step 3 → API key saved to DB → backend writes full config to openclaw.json (env, models, agents, gateway, tools) → gateway detects key within 5s → gateway starts.

### March 25, 2026 — Kimi Code API Format Fix

**Problem:** Kimi Code API returned 403 "only available for Coding Agents" because the wrong API format was configured. Kimi Code requires `anthropic-messages`, not `openai-completions`.

**backend/app/services/model_providers.py:**
- `kimi_code` provider: `api_type` changed from `"openai-completions"` to `"anthropic-messages"`, `base_url` corrected to `https://api.kimi.com/coding/` (trailing slash, no `/v1`).

**gateway/entrypoint.sh:**
- `kimi_code` case: `API_TYPE` changed to `"anthropic-messages"`, `BASE_URL` corrected to match.

**No change needed in gateway.py** — `sync_model_config_from_db()` reads `api_type` from `get_provider_config()` automatically.

### March 25, 2026 — Telegram Config Sync from DB to Gateway

**Problem:** Users configure Telegram through the dashboard (saved to `organization_settings` in DB), but the gateway only read `TELEGRAM_BOT_TOKEN` from `.env`. Fresh installs with Telegram configured via onboarding/settings had no Telegram channel in `openclaw.json`.

**backend/app/services/gateway.py — `sync_model_config_from_db()`:**
- Now reads `telegram_bot_token_encrypted` and `telegram_allowed_user_ids` from `organization_settings`.
- Decrypts bot token using Fernet and writes `channels.telegram` section to `openclaw.json` with `enabled`, `botToken`, `dmPolicy: "allowlist"`, and `allowFrom` (parsed from comma-separated user IDs).
- Skipped if `TELEGRAM_BOT_TOKEN` env var is set (backward compat with GALADO).

**Kimi Code in Settings > AI Model:** Already works — the page loads providers dynamically from `GET /api/settings/model/providers` which returns all `PROVIDERS` including `kimi_code`. Requires `docker compose up -d --build` to pick up backend changes.
