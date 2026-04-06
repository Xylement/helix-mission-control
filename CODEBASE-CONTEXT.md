# HELIX Mission Control — Codebase Context
## Living reference for Claude Code sessions
## Last updated: March 29, 2026 (v1.2.0 release)
## Last updated: April 6, 2026 (v1.3.2 installation reliability, billing activation fix)

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

**agents** — id (UUID PK), org_id (FK organizations), name (unique per org), role_title, department_id (FK departments), primary_board_id (FK boards), system_prompt, status (online|offline|busy|error), execution_mode (auto|manual), model_provider, model_name, model_api_key_encrypted, ai_model_id (FK ai_models), marketplace_template_slug, monthly_budget_usd (DECIMAL nullable), budget_warning_threshold (DECIMAL default 0.80), budget_paused (bool default false), budget_pause_reason (VARCHAR 200), budget_reset_day (int default 1), last_seen_at, openclaw_session_id, created_at

**tasks** — id (UUID PK), board_id (FK boards), title, description, status (todo|in_progress|review|approved|rejected|done|cancelled), priority (low|medium|high|urgent), assigned_agent_id (FK agents nullable), created_by_user_id (FK users), due_date, requires_approval (bool), approved_by_user_id, approved_at, result (text), tags (TEXT[] DEFAULT '{}'), metadata (JSONB), goal_id (FK goals SET NULL nullable, indexed), archived (bool DEFAULT false), parent_task_id (FK tasks SET NULL nullable, indexed — delegation parent), delegation_status (VARCHAR 20 nullable — pending|in_progress|completed|failed), delegated_by_agent_id (FK agents SET NULL nullable), started_at, completed_at, created_at, updated_at

**comments** — id (UUID PK), task_id (FK tasks), user_id (FK users nullable), agent_id (FK agents nullable), author_type, author_name, content, mentions (JSONB), created_at

**activity_log** — id (UUID PK), org_id (FK organizations), actor_type (user|agent|system), actor_id, action, target_type, target_id, metadata (JSONB — includes task_title, board_name, agent_name etc.), created_at

**notifications** — id (UUID PK), org_id, user_id (FK users), type, title, message, target_type, target_id, read (bool), telegram_sent (bool), created_at. Index: (user_id, read, created_at)

**task_attachments** — id (UUID PK), task_id (FK tasks CASCADE), org_id, filename, file_path, file_size, mime_type, uploaded_by_user_id, uploaded_by_agent_id, created_at

### Permission Tables

**board_permissions** — id (UUID PK), board_id (FK boards), user_id (FK users), permission_level (no_access|view|create|manage), granted_by_user_id (FK users nullable), created_at

### Config Tables

**organization_settings** — id (UUID PK), org_id (FK organizations UNIQUE), model_provider, model_name, model_api_key_encrypted, model_base_url, model_display_name, model_context_window (256000), model_max_tokens (8192), telegram_bot_token_encrypted, telegram_allowed_user_ids, timezone (Asia/Kuala_Lumpur), max_agents (50), backup_enabled (bool DEFAULT false), backup_schedule (daily/weekly), backup_time (02:00), backup_day (monday), backup_retention_days (7), created_at, updated_at

**backups** — id (UUID PK), org_id (FK organizations), filename, file_path, file_size_bytes (BIGINT), backup_type (auto/manual), status (completed/failed/in_progress), error_message (TEXT nullable), created_at

**service_tokens** — id (UUID PK), org_id (FK organizations), name, token_hash (SHA256), token_prefix (8 chars), last_used_at, created_at, revoked_at

**gateways** — id (UUID PK), org_id (FK organizations), name, websocket_url, token, created_at

**onboarding_state** — id (UUID PK), org_id (FK organizations nullable), current_step (1-8), completed (bool), data (JSON), created_at, updated_at

**license_cache** — id (INTEGER PK, singleton row=1), license_key_prefix, plan, status, max_agents, max_members, features (JSONB), trial (bool), trial_ends_at, current_period_end, grace_period_ends, message, last_validated_at, cached_response (JSONB)

### White Label Tables

**white_label_config** — id (UUID PK), org_id (FK organizations UNIQUE), product_name (VARCHAR 100, default "HELIX Mission Control"), product_short_name (VARCHAR 30, default "HELIX"), company_name (VARCHAR 100, default "HelixNode"), logo_url (TEXT nullable), favicon_url (TEXT nullable), accent_color (VARCHAR 7, default "#3b82f6"), accent_color_secondary (VARCHAR 7, default "#8b5cf6"), login_title (VARCHAR 200, default "Sign in to Mission Control"), login_subtitle (TEXT nullable), footer_text (VARCHAR 200, default "Powered by HelixNode"), loading_animation_enabled (BOOLEAN default true), loading_animation_text (VARCHAR 30, default "HELIX"), custom_css (TEXT nullable), docs_url (TEXT default "https://docs.helixnode.tech"), support_email (VARCHAR 200 nullable), support_url (TEXT nullable), marketplace_visible (BOOLEAN default true), created_at, updated_at

=======
### Goals Tables

**goals** — id (SERIAL PK), org_id (FK organizations NOT NULL), parent_goal_id (FK goals CASCADE nullable), title (VARCHAR 500), description (TEXT), goal_type (VARCHAR 20: mission|objective|key_result), status (VARCHAR 20: active|completed|paused|cancelled), owner_type (VARCHAR 10: user|agent|NULL), owner_id (INT nullable polymorphic), target_date (DATE), progress (INT 0-100), department_id (FK departments SET NULL), board_id (FK boards SET NULL), sort_order (INT), created_by (FK users), created_at, updated_at. Indexes: org_id, parent_goal_id, board_id

### Skills Tables

**skills** — id (UUID PK), org_id (FK organizations), name (200), slug (100 unique per org), version (20), description, category (50), tags (TEXT[]), content (TEXT markdown), frontmatter (JSONB), activation_mode (always|board|tag), activation_boards (UUID[]), activation_tags (TEXT[]), created_by (FK users), is_system (bool), marketplace_template_id (100), created_at, updated_at

**agent_skills** — id (UUID PK), agent_id (FK agents CASCADE), skill_id (FK skills CASCADE), assigned_at, assigned_by (FK users). UNIQUE(agent_id, skill_id)

**skill_attachments** — id (UUID PK), skill_id (FK skills CASCADE), filename, original_filename, description, file_size, mime_type, storage_path, uploaded_by (FK users), uploaded_at

### Execution Trace Tables

**execution_traces** — id (UUID PK), org_id (FK organizations), task_id (FK tasks CASCADE), agent_id (FK agents CASCADE), trace_status (VARCHAR 20: running|completed|failed|cancelled), total_steps (INT), total_input_tokens (INT), total_output_tokens (INT), total_estimated_cost_usd (DECIMAL 10,6), model_provider (VARCHAR 50), model_name (VARCHAR 100), error_message (TEXT), started_at, completed_at, duration_ms (INT), created_at. Indexes: task_id, agent_id, org_id

**execution_trace_steps** — id (UUID PK), trace_id (FK execution_traces CASCADE), step_number (INT), step_type (VARCHAR 30: reasoning|tool_call|tool_result|error|system), content (TEXT), tool_name (VARCHAR 200), tool_input (JSONB), tool_output (TEXT), input_tokens (INT), output_tokens (INT), estimated_cost_usd (DECIMAL 10,6), duration_ms (INT), created_at. Index: trace_id

### Schedule Tables

**agent_schedules** — id (UUID PK), org_id (FK organizations), agent_id (FK agents CASCADE), board_id (FK boards CASCADE), name (200), description (TEXT), task_title_template (500), task_prompt (TEXT), schedule_type (daily|weekly|monthly|interval), schedule_time (HH:MM), schedule_days (TEXT[]), schedule_interval_minutes (INT), is_active (bool), requires_approval (bool), priority (20), tags (TEXT[]), last_run_at, next_run_at (indexed WHERE is_active), run_count (INT), retry_count (INT), created_by (FK users), created_at, updated_at

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
| Model Providers | services/model_providers.py | 8-provider registry (moonshot, openai, anthropic, nvidia, gemini, openrouter, kimi_code, custom) |
| Permissions | services/permissions.py | Board permission checks, filtering (default-closed model) |
| Version | services/version_service.py | Read VERSION file, check api.helixnode.tech for updates, 6h cache |
| White Label | routers/white_label.py | Branding API (6 endpoints), license-gated |
| Email Templates | services/email_templates.py | Branded transactional emails via Resend |
| White Label | routers/white_label.py | Branding API (7 endpoints), license-gated |
| Email Templates | services/email_templates.py | Branded transactional emails via Resend |
| Budget Service | services/budget_service.py | Per-agent token budget enforcement, auto-pause, period reset |
| Goal Service | services/goal_service.py | Goal tree queries (CTE), context injection for prompts, auto-progress calculation |
| Schedule Service | services/schedule_service.py | Recurring task scheduling — calculate next run, execute schedules, background checker |
| Trace Service | services/trace_service.py | Execution trace CRUD — create/complete traces, add steps, query by task/agent, org-scoped stats |
| Delegation Service | services/delegation_service.py | Agent-to-agent delegation — create sub-tasks, delegation tree (recursive CTE), depth/count limits, completion tracking |
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

## 6b. Key Frontend Additions (v1.2.0)

- `contexts/BrandingContext.tsx` — React context for dynamic branding
- `lib/branding.ts` — Branding fetch + cache
- `app/settings/white-label/page.tsx` — White label settings
- `app/forgot-password/page.tsx` — Forgot password form
- `app/reset-password/page.tsx` — Reset password with token
- `components/onboarding/branding-step.tsx` — Onboarding branding step
- `app/costs/page.tsx` — Cost dashboard (spend by agent, daily chart, top tasks)
- `app/tasks/[id]/traces/page.tsx` — Execution trace viewer (timeline of LLM steps per task)
- `components/trace-viewer.tsx` — Trace detail component (header + step timeline)
- `components/trace-step.tsx` — Individual trace step (reasoning, tool_call, tool_result, error, system)
- `components/delegation-tree.tsx` — Recursive delegation tree viewer (parent → sub-tasks, max 3 levels, click to navigate)
- `components/delegation-badge.tsx` — Badge component for task cards (sub-task count on parents, "Delegated by" on children)

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
11. Goal context injects into agent prompts at dispatch time — same pattern as skills (resolve → build context → prepend to prompt)

---

## 8. Known Issues

- ~~Board permissions not enforced~~ — **FIXED** (default-closed model, enforced on all endpoints)
- ~~Activity feed lacks department colors~~ — **FIXED** (colorized by department and action type)
- Frontend health check occasionally shows unhealthy (cosmetic)
- Billing history is placeholder (links to Stripe Portal)
- ~~No way to activate license key post-onboarding~~ — **FIXED** (activation card on billing page)
- ~~Gateway config sync from DB to container needs restart~~ — **FIXED** (backend syncs model config from DB to openclaw.json on startup)
- ~~Gateway sync had apiKey in models section + wrong API types for moonshot/anthropic~~ — **FIXED** (apiKey removed from provider config, OpenClaw api type map added: moonshot/anthropic → `anthropic-messages`)
- ~~Gateway sync only wrote auth-profiles.json to existing agent dirs~~ — **FIXED** (now creates dirs from openclaw.json agents.list + existing on disk, writes auth-profiles.json to all)
- ~~OPENCLAW_CONFIG_PATH in docker-compose.yml used host `${HOME}` path~~ — **FIXED** (must use container path, not host path — the env var is read inside the container)

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

### April 6, 2026 — Gateway sync writes correct OpenClaw config schema

**Bug — `backend/app/services/gateway.py` `sync_model_config_from_db()`:**

Four issues fixed in how the backend syncs model config from DB to the gateway container:

1. **`apiKey` leaked into models section** — Removed `apiKey` from `config["models"]["providers"][provider]`. API keys belong only in per-agent `auth-profiles.json`, not in `openclaw.json` provider config.

2. **Wrong API type for some providers** — Added explicit OpenClaw API type mapping (`openclaw_api_map`) instead of using `model_providers.py` registry values. Key differences: moonshot → `anthropic-messages` (was `openai-completions`), anthropic → `anthropic-messages` (was `anthropic`).

3. **Agent defaults missing model alias** — Added `config["agents"]["defaults"]["models"]` with `{provider/model: {"alias": display_name}}` alongside the existing `model.primary` setting.

4. **auth-profiles.json only written to existing agent dirs** — Now collects agent IDs from both `openclaw.json` `agents.list` AND existing directories on disk. Creates `agents/{id}/agent/` directories with `os.makedirs(exist_ok=True)` before writing auth-profiles.json. Previously skipped agents whose directories didn't exist yet.

### April 6, 2026 — Fix trial flag lost on license validation

**Bug — `services/license_service.py` `validate()`:**
- When `validate()` called the license server's `/v1/licenses/validate`, the response didn't include a `trial` field
- `_cache_response()` defaulted `data.get("trial", False)` → `False`, overwriting the `trial=True` set during trial creation
- This happened on every backend startup (lifespan) and every 24h (periodic_license_check), so trial users' billing page lost the "Upgrade with License Key" section and showed incorrect plan status
- Fix: before caching, if the validate response has no `trial` key, preserve the existing `trial` and `trial_ends_at` values from the cache

### April 6, 2026 — Trial user license key upgrade input

**Enhancement — Billing page** (`frontend/src/app/settings/billing/page.tsx`):
- Added "Upgrade with License Key" inline section shown when user is on a trial (`plan.trial === true`)
- Compact horizontal layout: label + license key input + Activate button
- Placed between Feature Access card and Available Plans section
- Reuses existing `handleActivateKey` logic, `licenseKey` state, and validation
- Fixes gap where trial users who later received a paid license key had no way to enter it without the full activation card

### April 6, 2026 — Billing API port detection fix

**Fix — billingRequest() uses getApiBase()** (`frontend/src/lib/billing.ts`, `frontend/src/lib/api.ts`):
- `billingRequest()` had its own API base logic (`process.env.NEXT_PUBLIC_API_BASE_URL || ""`) that bypassed `getApiBase()` port detection
- On macOS Docker Desktop (port 3000), billing calls went to `localhost:3000/api/billing/...` instead of `localhost:8000/api/billing/...`
- Fixed by exporting `getApiBase()` from `api.ts` and importing it in `billing.ts`
- All billing calls (activate, getPlan, getUsage, validate, startTrial) now correctly route to port 8000

### April 6, 2026 — Pre-v1.4.0 Fixes

**Fix 1 — Onboarding health check fallback** (`backend/app/routers/health.py`):
- `/api/health/setup` now considers onboarding complete if org + admin + active license exist, regardless of `onboarding_state` table
- Fixes false "onboarding not completed" for pre-existing installations

**Fix 2 — Billing expiry warning** (`frontend/src/app/settings/billing/page.tsx`):
- Amber banner when trial/subscription expires within 7 days
- Red banner when expires within 2 days or already expired
- Grace period countdown when expired

**Fix 3 — Docs redeployed** (helixnode-docs):
- Verified docs already deployed with setup-env, setup-check, troubleshooting content

**Fix 4 — Setup-check license link** (`frontend/src/app/setup-check/page.tsx`):
- Changed fixUrl from `/settings/license` (404) to `/settings/billing` (correct route)

**Fix 5 — Billing page license activation** (`frontend/src/app/settings/billing/page.tsx`):
- Added "Activate License" card shown when no active license (plan is null, status not active, or no plan set)
- License key input with HLX-XXXX-XXXX-XXXX-XXXX format, live validation indicator (check/X icon)
- Activate button calls `billingApi.activate()`, same logic as onboarding license-step
- Free trial section with email + org name inputs, calls `billingApi.startTrial()`
- On success, calls `refreshPlan()` + `refreshUsage()` to update page in-place
- Fixes gap where users who skipped/failed license activation during onboarding had no way to activate post-onboarding

**Diagnostic findings (macOS install issues reported by Joe & Allen):**
- Billing page route, Dockerfile static copies, DNS config, API endpoints all verified correct on v1.3.2
- Root cause of reported "billing 404" was pre-v1.3.2 DNS failure — containers couldn't resolve api.helixnode.tech, causing billing API calls to fail silently
- No additional code fixes needed for DNS — v1.3.2's `dns: [8.8.8.8, 1.1.1.1]` on all services resolves it
- The missing license activation input on the billing page (Fix 5) was a real gap discovered during diagnosis

**Fix 4 — install.sh verified** — already synced to web server

### April 6, 2026 — v1.3.2 Installation Reliability Overhaul

**Problem:** Fresh installs (both script-based and manual) were broken — frontend couldn't reach backend, gateway never started without model key, missing env vars caused warnings.

**Fix 1 — Smart API base detection** (`frontend/src/lib/api.ts`):
- `getApiBase()` rewritten: port 3000 → auto-redirect to port 8000 on same host; port 80/443 → relative path (reverse proxy); SSR → `http://backend:8000`
- Handles all scenarios: behind Nginx/Caddy, direct Docker access, custom domains

**Fix 2 — Dockerfile cleanup** (`frontend/Dockerfile`):
- Removed hardcoded `ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` that overwrote build arg

**Fix 3 — next.config.mjs simplified** (`frontend/next.config.mjs`):
- Removed `rewrites()` proxy rules — no longer needed with smart `getApiBase()`

**Fix 4 — docker-compose.yml defaults** (`docker-compose.yml`):
- Removed `NEXT_PUBLIC_API_URL`, `BACKEND_URL` from frontend env
- Added `GATEWAY_TOKEN` default for fresh installs
- Changed `GENERATE_CONFIG` default to `true` (production overrides via `.env`)
- Gateway volumes use `${HOME:-.}/.openclaw` for portability

**Fix 5 — Gateway starts without model key** (`gateway/entrypoint.sh`):
- Instead of polling forever, creates minimal config and starts OpenClaw in waiting mode
- Accepts connections but can't process AI until model configured

**Fix 6 — Setup health check endpoint** (`backend/app/routers/health.py`):
- `GET /api/health/setup` — public (no auth) diagnostic endpoint
- Checks: database, redis, gateway, model_configured, license, admin_exists, onboarding
- Returns ready status and next_step recommendation

**Fix 7 — Setup check page** (`frontend/src/app/setup-check/page.tsx`):
- Public diagnostic page at `/setup-check` showing all service statuses
- Fix links for each failing check
- Dashboard banner when setup is incomplete

**Fix 8 — Complete .env.example** (`.env.example`):
- Rewritten with working defaults (Gemini free tier as default provider)
- All vars documented, no legacy vars

**Fix 9 — setup-env.sh script** (`scripts/setup-env.sh`):
- Auto-generates `.env` from `.env.example` with random secrets

**Fix 10 — install.sh updated** (`install.sh`):
- Removed non-existent Alembic migration call
- Updated frontend env vars (removed legacy `NEXT_PUBLIC_API_URL`)
- Version bumped to 1.3.2

**Fix 11 — Manual install docs updated** (`helixnode-docs/getting-started/installation.md`):
- Step-by-step with `setup-env.sh`, optional model config, setup-check verification

### April 1, 2026 — Add Google Gemini and OpenRouter as native AI providers

Added two new AI model providers:
- **Google Gemini** — `gemini` provider, base URL `generativelanguage.googleapis.com/v1beta/openai`, key prefix `AIza`, models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite, gemini-3-flash-preview
- **OpenRouter** — `openrouter` provider, base URL `openrouter.ai/api/v1`, key prefix `sk-or-`, models: google/gemini-2.5-flash, google/gemini-2.5-pro, anthropic/claude-sonnet-4, openai/gpt-5.4, meta-llama/llama-4-maverick, deepseek/deepseek-r1

**Files changed:**
- `backend/app/services/model_providers.py` — Added gemini and openrouter to PROVIDERS dict
- `backend/app/services/gateway.py` — Added GEMINI_API_KEY and OPENROUTER_API_KEY to key_env_map
- `gateway/entrypoint.sh` — Added gemini and openrouter cases to provider switch
- `frontend/src/app/settings/models/page.tsx` — Added to all provider maps (URLs, labels, colors, suggestions, notes, key prefixes, provider list)
- `frontend/src/components/onboarding/ai-model-step.tsx` — Added help links for gemini (AI Studio) and openrouter

Both use `openai-completions` API type. Gemini keys (`AIza...`) work as Bearer tokens — no `sk-` validation anywhere in the pipeline.

Applied to both production (`~/helix-mission-control/`) and staging (`~/helix-staging/`).

### March 31, 2026 — Next.js API proxy rewrites for fresh installs without reverse proxy

**Problem:** On fresh installs (e.g., macOS Docker Desktop) without Nginx/Caddy, the frontend at port 3000 can't reach the backend at port 8000. Requests to `/api/...` hit Next.js and return 404.

**Fix:**
- `frontend/next.config.mjs` — Added `rewrites()` to proxy `/api/:path*` to backend via `BACKEND_URL` env var (defaults to `http://backend:8000`). In production with Nginx, the rewrites never trigger because Nginx intercepts `/api/*` first.
- `docker-compose.yml` — Added `BACKEND_URL=http://backend:8000` to frontend service environment.
- `install.sh` — Added macOS root guard, changed log path from `/var/log/helix-install.log` to `$HOME/.helix/install.log`, added `mkdir -p ~/.openclaw` before `docker compose up`.

Applied to both production (`~/helix-mission-control/`) and staging (`~/helix-staging/`).

### March 29, 2026 — Landing page: remove waitlist, add launch CTAs and install command

**Context:** HELIX is now launched and selling. Landing page at `landing/index.html` still had pre-launch "early access" and "waitlist" messaging.

**Changes — `landing/index.html`:**
- Hero badge: "Now accepting early access signups" → "Now available — deploy in 10 minutes"
- Hero CTA: "Join the Waitlist" (#waitlist) → "Get Started" (docs install page)
- Self-hosted pricing buttons: Starter "Start Free Trial", Pro/Scale "Get Started" — all link to docs install page (users install first, activate from inside app)
- Managed Cloud pricing buttons: "Get Started" → mailto:hello@helixnode.tech with plan name in subject (not self-serve yet)
- Enterprise buttons: unchanged (already mailto:)
- Bottom section: replaced entire waitlist form (email input, submit JS, success/error states) with "Deploy Your AI Team Today" section featuring install command (Linux/macOS tab switcher), "Read the Docs" CTA, and "View on GitHub" link
- Removed `submitWaitlist()` JavaScript function and waitlist form CSS
- No changes to Marketplace, Features, How It Works, White Label, or Footer sections
### March 30, 2026 — Agent-to-Agent Delegation

**Feature:** Agents can delegate sub-tasks to other specialist agents during task execution. Parent agent includes `[DELEGATE: AgentName | Title | Description]` markers in its response, which are parsed and stored as pending_delegations. Upon human approval, sub-tasks are created and auto-dispatched. Delegation tree shows full parent→child hierarchy (max 3 levels, max 5 sub-tasks per parent).

**New files:**
- `backend/app/services/delegation_service.py` — Core delegation logic: create_delegation, get_sub_tasks, get_delegation_tree, get_delegation_depth, complete_delegation, get_sub_tasks_count
- `backend/app/routers/delegations.py` — POST /tasks/{id}/delegate, GET /tasks/{id}/subtasks, GET /tasks/{id}/delegation-tree
- `frontend/src/components/delegation-tree.tsx` — Recursive tree viewer for delegation hierarchy
- `frontend/src/components/delegation-badge.tsx` — Badge component for parent/child delegation indicators

**Modified files:**
- `backend/app/models/task.py` — Added parent_task_id, delegation_status, delegated_by_agent_id columns + parent_task/delegated_by_agent relationships
- `backend/app/schemas/task.py` — Added delegation fields to TaskOut/TaskCreate, new DelegationRequest and DelegationTreeNode schemas
- `backend/app/services/gateway.py` — Delegation context injection in dispatch_task() (available agents list), delegation instructions in _build_task_prompt(), [DELEGATE:...] marker parsing in _process_task_result()
- `backend/app/routers/tasks.py` — Delegation approval hook (create+dispatch sub-tasks on approve/done), delegation_status transitions (completed/failed on sub-task status change), sub_tasks_count in responses, delegated_by_agent eager loading
- `backend/app/main.py` — ALTER TABLE tasks ADD COLUMN for delegation columns, CREATE INDEX, register delegations router
- `frontend/src/lib/api.ts` — Added delegation fields to Task type, DelegationRequest/DelegationTreeNode types, createDelegation/getSubTasks/getDelegationTree methods
- `frontend/src/app/boards/[id]/page.tsx` — Delegation badges on task cards, delegation tree in task detail, styled delegation request cards in result, parent task link on sub-tasks
- `frontend/src/app/tasks/[id]/traces/page.tsx` — Delegation tree section for tasks with sub-tasks

**Delegation flow:** Agent response → parse [DELEGATE:...] → store pending_delegations in metadata → human reviews → on approve → create_delegation() → auto-dispatch sub-tasks → sub-task completes → delegation_status updated → parent metadata updated when all done.

### March 30, 2026 — Deep Execution Tracing

**Feature:** Log every LLM reasoning step, tool call, and tool result during agent task execution. Drill-down trace viewer on task detail shows exactly what the agent did, why, and at what cost.

**New files:**
- `backend/app/models/execution_trace.py` — SQLAlchemy models for execution_traces and execution_trace_steps
- `backend/app/schemas/execution_trace.py` — TraceOut, TraceStepOut, TraceDetailOut, TraceStatsOut
- `backend/app/routers/traces.py` — GET /tasks/{id}/traces, GET /traces/{id}, GET /agents/{id}/traces, GET /traces/stats
- `backend/app/services/trace_service.py` — create_trace, add_trace_step, complete_trace, get_trace, get_traces_for_task/agent, get_trace_stats
- `frontend/src/app/tasks/[id]/traces/page.tsx` — Trace viewer page (auto-expand single trace, list for retries)
- `frontend/src/app/tasks/[id]/traces/layout.tsx` — Layout with sidebar
- `frontend/src/components/trace-viewer.tsx` — Trace detail (header + timeline of steps)
- `frontend/src/components/trace-step.tsx` — Individual step rendering (reasoning/tool_call/tool_result/error/system)

**Modified files:**
- `backend/app/main.py` — CREATE TABLE for execution_traces + execution_trace_steps, register traces router
- `backend/app/services/gateway.py` — Trace creation before dispatch, step buffering during streaming, non-blocking flush on completion/error
- `backend/app/schemas/task.py` — Added traces_count field to TaskOut
- `backend/app/routers/tasks.py` — Attach traces_count in get_task endpoint
- `frontend/src/lib/api.ts` — Trace/TraceStep/TraceDetail/TraceStats types, getTaskTraces/getTraceDetail/getAgentTraces/getTraceStats methods, traces_count on Task
- `frontend/src/app/boards/[id]/page.tsx` — "View Execution Trace" button on task detail when traces exist
- `frontend/src/app/agents/[id]/page.tsx` — "Traces" tab showing recent traces for the agent
- `frontend/src/app/costs/page.tsx` — "traces" link next to each agent in spend-by-agent section

### March 30, 2026 — Goal Hierarchy (Mission → Objectives → Key Results)

**Feature:** Strategic goal layer above department → board → task structure. Goals cascade context into agent prompts at dispatch time so agents know the strategic purpose behind their work.

**New files:**
- `backend/app/models/goal.py` — SQLAlchemy model for goals table (3-level hierarchy: mission → objective → key_result)
- `backend/app/schemas/goal.py` — GoalCreate, GoalUpdate, GoalOut, GoalTree, GoalContext, GoalProgressUpdate schemas
- `backend/app/routers/goals.py` — CRUD endpoints (list, tree, get, create, update, delete), progress (manual + auto-calculate), task linking (link, unlink, list tasks)
- `backend/app/services/goal_service.py` — get_goal_context_for_task (walk up tree), auto_calculate_progress, get_goal_tree (WITH RECURSIVE CTE), build_goal_prompt_context
- `frontend/src/app/goals/page.tsx` — Goals management page with tree view (expand/collapse) and list view toggle, create/edit/delete dialogs
- `frontend/src/app/goals/layout.tsx` — Layout with sidebar (same pattern as costs/schedules)

**Modified files:**
- `backend/app/models/task.py` — Added goal_id (FK goals SET NULL) column and goal relationship
- `backend/app/schemas/task.py` — Added goal_id to TaskCreate/TaskUpdate, goal_id + goal_title to TaskOut with model_validator
- `backend/app/services/gateway.py` — Goal context injection in dispatch_task() after skill injection, _build_task_prompt() accepts goal_context parameter
- `backend/app/routers/tasks.py` — Added selectinload(Task.goal) to all queries, goal attribute to refresh calls
- `backend/app/main.py` — CREATE TABLE goals migration, ALTER TABLE tasks ADD goal_id, goals router registration
- `frontend/src/components/sidebar.tsx` — Added "Goals" nav item with Target icon in admin section
- `frontend/src/app/boards/[id]/page.tsx` — Board goal banner, goal dropdown in task creation, Target icon on goal-linked tasks
- `frontend/src/app/dashboard/page.tsx` — "Active Goals" section showing missions with progress and objectives
- `frontend/src/lib/api.ts` — Goal/GoalTree types, goal_id on Task/TaskCreate, 10 goal API methods

**New table:** `goals` — Hierarchical goal storage with parent_goal_id self-reference, polymorphic owner, optional board/department scoping

**Goal context injection:** When a task has goal_id set, dispatch_task() walks up the goal tree and prepends "## Strategic Context" with mission/objective/key_result titles to the agent prompt.

---

### March 30, 2026 — Scheduled Recurring Tasks for Agents

**Feature:** Admins can configure recurring schedules on agents that automatically create and dispatch tasks on a cron-like schedule (daily, weekly, monthly, or interval).

**New files:**
- `backend/app/services/schedule_service.py` — Core scheduling logic: calculate_next_run, format_task_title, execute_schedule, check_and_run_due_schedules
- `backend/app/routers/schedules.py` — CRUD endpoints for agent schedules (list, create, update, delete, toggle, run-now, list-all)
- `frontend/src/app/schedules/page.tsx` — Global schedules overview page (admin)

**Modified files:**
- `backend/app/main.py` — CREATE TABLE agent_schedules migration, periodic_schedule_checker background task (60s), register schedules router
- `frontend/src/app/agents/[id]/page.tsx` — Added "Schedules" tab with create/edit dialog, toggle, run-now, delete
- `frontend/src/components/sidebar.tsx` — Added "Schedules" nav item with CalendarClock icon in admin section
- `frontend/src/lib/api.ts` — Added AgentSchedule types and 7 schedule API methods

**New table:** `agent_schedules` — Stores schedule config, pre-calculated next_run_at (indexed), retry tracking

---

### March 30, 2026 — Agent Token Budgets with Auto-Pause and Cost Dashboard

**Feature:** Per-agent monthly token budgets with automatic pause at limit, admin override, and cost dashboard.

**New files:**
- `backend/app/services/budget_service.py` — Budget calculation (get_agent_spend_this_period, check_budget), pause/unpause, daily reset, cost estimation
- `frontend/src/app/costs/page.tsx` — Cost dashboard: KPI cards, spend by agent with progress bars, daily spend bar chart, top expensive tasks table

**Modified files:**
- `backend/app/models/agent.py` — Added monthly_budget_usd, budget_warning_threshold, budget_paused, budget_pause_reason, budget_reset_day columns
- `backend/app/models/token_usage.py` — Added estimated_cost_usd column (DECIMAL 10,6)
- `backend/app/schemas/agent.py` — Added budget fields to AgentOut, new BudgetStatus and BudgetUpdate schemas
- `backend/app/services/gateway.py` — Pre-dispatch budget check (blocks if exceeded), post-dispatch budget check (pauses if exceeded), cost estimation on token logging
- `backend/app/routers/tasks.py` — Catch BudgetExceededError in _maybe_auto_dispatch and execute_task
- `backend/app/routers/agents.py` — GET/PUT /agents/{id}/budget, POST /agents/{id}/budget/override endpoints
- `backend/app/routers/dashboard.py` — GET /dashboard/costs endpoint (org-wide cost data)
- `backend/app/main.py` — ALTER TABLE migrations for budget columns, periodic_budget_reset background task
- `frontend/src/lib/api.ts` — BudgetStatus, CostDashboard types, budget API methods, Agent type updated
- `frontend/src/components/sidebar.tsx` — Added "Costs" (DollarSign icon) to admin nav
- `frontend/src/app/agents/[id]/page.tsx` — Budget card with progress bar, set/edit budget dialog, paused banner with override
- `frontend/src/app/agents/page.tsx` — Budget indicator badges on agent cards

**Budget flow:** NULL monthly_budget_usd = unlimited. Pre-dispatch check blocks tasks if exceeded. Post-dispatch check pauses agent after task pushes over budget. Daily reset unpauses agents on budget_reset_day.

### March 26, 2026 — Update OpenAI provider models to GPT-5.x series

**Problem:** OpenAI provider model list only included gpt-4o, gpt-4o-mini, and o1 — missing the entire GPT-5.x series.

**backend/app/services/model_providers.py:**
- OpenAI `models` list updated to: gpt-5.4 (256k/32k), gpt-5.4-mini (256k/32k), gpt-5.4-nano (128k/16k), gpt-5.2 (256k/32k), gpt-4o (128k/16k), gpt-4o-mini (128k/16k). Removed o1.
- `default_model` remains `gpt-4o` (cheapest reliable option for default).

**frontend/src/app/settings/models/page.tsx:**
- `PROVIDER_SUGGESTIONS` for openai updated to match: `["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-4o", "gpt-4o-mini"]`. Removed outdated gpt-4-turbo and gpt-3.5-turbo.

### March 26, 2026 — Strengthen sync_model_config_from_db guard

**Problem:** `sync_model_config_from_db()` overwrote GALADO's working `openclaw.json` despite existing guards (auth key, agents.list). The existing `models.providers` section with a valid kimi-coding/k2p5 config was replaced by moonshot/kimi-k2.5 with an invalid API key from the DB.

**Backend — `services/gateway.py` — `sync_model_config_from_db()`:**
- Added `GENERATE_CONFIG=false` env var kill-switch — skips sync entirely (GALADO already has this in `.env`)
- Added `models.providers` guard — if openclaw.json has any providers configured, skip sync
- Existing guards preserved: `MODEL_API_KEY` env var, `auth` key, `agents.list` entries
- Sync now only runs on truly fresh installs with empty/minimal openclaw.json

### March 25, 2026 — Allow agent rename in edit form

**Problem:** Backend PATCH `/api/agents/{id}` already supports name changes but the frontend agent detail page (`app/agents/[id]/page.tsx`) displayed the name as static text with no way to edit it.

**Fix — `frontend/src/app/agents/[id]/page.tsx`:**
- Added inline-editable name: admin users see a pencil icon next to the agent name
- Clicking pencil opens an input field pre-filled with current name, with save/cancel buttons
- Submits via `api.updateAgent()` PATCH call; shows backend validation errors (e.g. duplicate name)
- Non-admin users see the name as read-only (no pencil icon)

### March 25, 2026 — Moonshot as default Kimi provider, Kimi Code as advanced option

**Problem:** `kimi_code` provider uses OpenClaw's built-in kimi-coding provider with credentials in OpenClaw's credential store (set up via `openclaw onboard`). This can't be automated by `sync_model_config_from_db()`. Fresh installs need a provider that works automatically.

**Backend — `services/model_providers.py`:**
- `moonshot` provider updated: name "Moonshot (Kimi K2.5)", `base_url` `https://api.moonshot.ai/v1`, `default_model` `kimi-k2.5`, models `kimi-k2.5/k2/k2-thinking/k2-turbo-preview`, `help_url` for platform.moonshot.ai
- `kimi_code` provider kept as advanced: name "Kimi Code (Advanced)", `base_url` `https://api.kimi.com/coding/`, `api_type` `anthropic-messages`, `default_model` `k2p5`, `note` field warning about manual setup

**Backend — `services/gateway.py` — `sync_model_config_from_db()`:**
- When provider is `kimi_code`, skips writing config and logs message about manual OpenClaw setup
- Removed `kimi_code` from `key_env_map` (can't sync automatically)

**Gateway — `entrypoint.sh`:**
- `kimi-coding`/`kimi_code` cases restored to `api_type` `anthropic-messages`, `base_url` `https://api.kimi.com/coding/`
- `moonshot` case unchanged (already `openai-completions`, `api.moonshot.ai/v1`)

**Frontend — `settings/models/page.tsx`:**
- Updated all provider maps: moonshot label "Moonshot (Kimi K2.5)" with Kimi model suggestions, kimi_code label "Kimi Code (Advanced)" with `k2p5` suggestion
- Added `PROVIDER_NOTES` map — shows amber warning for kimi_code in add/edit dialog

**Frontend — `components/onboarding/ai-model-step.tsx`:**
- Added help link to platform.moonshot.ai for moonshot provider
- Added amber warning for kimi_code about manual setup requirement

### March 25, 2026 — Kimi Code provider switch to Moonshot platform API

**Problem:** Kimi Code API (`api.kimi.com/coding/v1`) with model `kimi-for-coding` returns 403 "only available for Coding Agents" — restricted to CLI tools. The same `sk-kimi-` API keys work on the Moonshot platform API with model `kimi-k2.5`.

**Changes:**
- `backend/app/services/model_providers.py` — `kimi_code` provider: `base_url` changed to `https://api.moonshot.ai/v1`, `default_model` to `kimi-k2.5`, models list updated to `kimi-k2.5`, `kimi-k2`, `kimi-k2-thinking`, `kimi-k2-turbo-preview`
- `gateway/entrypoint.sh` — both `kimi-coding` and `kimi_code` cases: `BASE_URL` changed to `https://api.moonshot.ai/v1`
- `frontend/src/app/settings/models/page.tsx` — `PROVIDER_BASE_URLS.kimi_code` updated to `https://api.moonshot.ai/v1`, `PROVIDER_SUGGESTIONS.kimi_code` updated to new model list

### March 25, 2026 — Fix task creation crash on gateway dispatch failure

**Problem:** Creating a task assigned to an agent would save the task to DB, then call `_maybe_auto_dispatch()`. If the agent wasn't registered in the gateway, `dispatch_task()` raised `ValueError` which bubbled up as a 500 error. The task was already committed but the frontend got an error, so users clicked Create again causing duplicates.

**Backend — `routers/tasks.py`:**
- `create_task` endpoint: wrapped `_maybe_auto_dispatch()` call in try/except — on failure, logs warning and still returns the created task with 201 status (task stays in "todo" status)
- `_maybe_auto_dispatch()`: on `ValueError` (agent not in gateway), attempts on-demand registration via `gateway._register_single_agent()` then retries dispatch once. If retry fails, resets task/agent status and raises (caught by endpoint's try/except)

**Frontend — `app/boards/[id]/page.tsx`:**
- Added `creating` loading state to task creation form — button shows "Creating..." and is disabled during submission, preventing duplicate clicks
- Added try/catch with error alert on failure

**Note:** Dashboard task creation modal (`app/dashboard/page.tsx`) already had this loading pattern.

### March 25, 2026 — Department & Board CRUD

**Backend changes:**
- `models/board.py` — Added `description` field (Text, nullable)
- `schemas/department.py` — Added `DepartmentCreate`, `DepartmentUpdate` schemas; `DepartmentOut` now includes `emoji`, `sort_order`
- `schemas/board.py` — Added `BoardCreate`, `BoardUpdate` schemas; `BoardOut` now includes `description`
- `routers/departments.py` — Added `POST /departments/` (create), `PATCH /departments/{id}` (edit), `DELETE /departments/{id}` (cascade delete with boards/tasks/comments/attachments). Create/edit requires admin or manage permission; delete is admin-only.
- `routers/boards.py` — Added `POST /boards/` (create), `PATCH /boards/{id}` (edit), `DELETE /boards/{id}` (cascade delete with tasks/comments/attachments). Create/edit requires admin or manage permission; delete is admin-only.
- `main.py` — Added `ALTER TABLE boards ADD COLUMN IF NOT EXISTS description TEXT` migration
- Activity logging for all department/board CRUD operations

**Frontend changes:**
- `lib/api.ts` — Added `createDepartment`, `updateDepartment`, `deleteDepartment`, `createBoard`, `updateBoard`, `deleteBoard` API methods; updated `Department` type (emoji, sort_order) and `Board` type (description)
- `app/boards/page.tsx` — Full CRUD UI: Add Department button, Add Board card per department, edit/delete via dropdown menus on department headers and board cards, confirmation dialogs for deletes. Permission-gated (admin or manage permission).

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
- `components/billing/TrialLockScreen.tsx` — Now shows lock screen for `no_license` status (in addition to expired/trial-expired). Includes a "Start 7-Day Free Trial" section (email + org name inputs, calls `billingApi.startTrial()`) shown when `isNoLicense` is true, placed above the plan cards. Email is pre-filled from the logged-in user.
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

### March 25, 2026 — sync_model_config_from_db Guard for Existing Installs

**Problem:** `sync_model_config_from_db()` overwrote GALADO's full `openclaw.json` (agent list, auth profiles, wizard config) because the `MODEL_API_KEY` env check alone wasn't sufficient — GALADO's env var was empty but its config file was fully populated by the entrypoint.

**backend/app/services/gateway.py — `sync_model_config_from_db()`:**
- Added guard after loading `openclaw.json`: if the config has an `"auth"` key or `"agents.list"` array with entries, the sync is skipped entirely and logs the reason.
- Only proceeds on fresh installs where the config is minimal (empty `{}` or just gateway/tools scaffolding).
- Three-layer protection: (1) `MODEL_API_KEY` env set → skip, (2) config has auth profiles → skip, (3) config has registered agents → skip.

### March 25, 2026 — Kimi Code in Settings > AI Models Page

**Problem:** The Settings > AI Models page (`frontend/src/app/settings/models/page.tsx`) had hardcoded provider maps that didn't include Kimi Code.

**frontend/src/app/settings/models/page.tsx:**
- Added `kimi_code` to `PROVIDER_BASE_URLS` (`https://api.kimi.com/coding/v1`), `PROVIDER_LABELS` (`"Kimi Code"`), `PROVIDER_COLORS` (purple), `PROVIDER_SUGGESTIONS` (`["kimi-for-coding"]`), and `PROVIDERS` array (before `"custom"`).

### March 25, 2026 — Kimi Code API Format Fix (correct: OpenAI-completions)

**Problem:** Kimi Code returned HTTP 404 on fresh installs during onboarding AI model test. The previous fix (March 25 "Kimi Code API Format Fix") incorrectly switched to `anthropic-messages` format and removed `/v1` from the base URL. Kimi Code's third-party agent docs confirm the correct endpoint is `https://api.kimi.com/coding/v1` with OpenAI chat completions format.

**backend/app/services/model_providers.py:**
- `kimi_code` provider: `api_type` changed from `"anthropic-messages"` back to `"openai-completions"`, `base_url` corrected to `https://api.kimi.com/coding/v1`.

**gateway/entrypoint.sh:**
- Both `kimi-coding` and `kimi_code` cases: `API_TYPE` changed to `"openai-completions"`, `BASE_URL` corrected to `https://api.kimi.com/coding/v1`.

**frontend/src/app/settings/models/page.tsx:**
- `PROVIDER_BASE_URLS.kimi_code` updated to `https://api.kimi.com/coding/v1`.

### March 27, 2026 — Automated Backups with Dashboard Management

**Feature:** Pro plan and above get automated backups of PostgreSQL database, openclaw.json config, and agent workspace files. Stored locally on VPS with configurable schedule and retention.

**New files:**
- `backend/app/models/backup.py` — `Backup` SQLAlchemy model (id UUID, org_id, filename, file_path, file_size_bytes, backup_type, status, error_message, created_at)
- `backend/app/services/backup_service.py` — Core backup functions: `create_backup()` (pg_dump + openclaw.json + workspaces -> tar.gz), `cleanup_old_backups()`, `get_backup_list()`, `get_backup_by_id()`, `delete_backup()`
- `backend/app/routers/backups.py` — Admin-only endpoints: `GET /api/backups` (list, paginated), `POST /api/backups` (manual trigger), `GET /api/backups/{id}/download` (stream file), `DELETE /api/backups/{id}`, `GET /api/backups/settings`, `PUT /api/backups/settings`. All gated to Pro+ plans.
- `frontend/src/app/settings/backups/page.tsx` — Settings > Backups page with schedule config (enable toggle, daily/weekly, time picker, day picker, retention 1-90 days) and backup history (list with download/delete, manual create button, plan gate overlay for starter/trial)

**Modified files:**
- `backend/app/models/organization_settings.py` — Added backup_enabled (bool), backup_schedule, backup_time, backup_day, backup_retention_days columns
- `backend/app/main.py` — Added ALTER TABLE migrations for backup settings columns, registered backups router, added `periodic_backup_scheduler()` background task (hourly check, runs auto backups per schedule, cleans up old backups)
- `backend/Dockerfile` — Added `postgresql-client` to apt-get install for pg_dump
- `docker-compose.yml` — Added `./backups:/home/helix/backups` volume mount to backend service
- `frontend/src/components/sidebar.tsx` — Added "Backups" (HardDrive icon) to admin nav items
- `frontend/src/lib/api.ts` — Added backup API methods and TypeScript types (BackupItem, BackupListResponse, BackupSettings)

**Backup storage:** `/home/helix/backups/helix-backup-{timestamp}.tar.gz` — contains database.sql, openclaw.json, and workspaces/ directory

**Schema — backups table:** id (UUID PK), org_id (FK organizations), filename, file_path, file_size_bytes (BIGINT), backup_type (auto/manual), status (completed/failed/in_progress), error_message (TEXT nullable), created_at

**Schema — organization_settings additions:** backup_enabled (BOOLEAN DEFAULT false), backup_schedule (VARCHAR DEFAULT 'daily'), backup_time (VARCHAR DEFAULT '02:00'), backup_day (VARCHAR DEFAULT 'monday'), backup_retention_days (INTEGER DEFAULT 7)

### March 27, 2026 — Version System with Update Notifications and One-Click Update

**Feature:** Semantic versioning (v1.0.0), update notifications in sidebar, one-click update from Settings > System with auto-rollback on failure.

**New files — Mission Control:**
- `VERSION` — Repo root, contains "1.0.0". Committed to git, mounted read-only into backend container.
- `backend/app/services/version_service.py` — Reads VERSION file, calls `GET api.helixnode.tech/v1/version/latest`, 6h in-memory cache, semver comparison, reads/writes `.update-trigger`/`.update-result`/`.update-history`/`.update-cancel` files in `data/` directory.
- `backend/app/routers/version.py` — `GET /api/version` (public: current + latest version, update status with stage/message), `POST /api/version/check` (admin: force re-check), `POST /api/version/update` (admin: trigger update, requires password confirmation, 1-per-hour rate limit), `POST /api/version/cancel` (admin: cancel in-progress update, requires password), `GET /api/version/history` (admin: last 10 updates).
- `update-daemon.sh` — Host-level bash script (systemd service). Polls `data/.update-trigger` every 10s. On trigger: git pull, docker compose up --build (with 10-minute timeout via `timeout 600`), wait 90s, health check (3 attempts). Auto-rollback on failure or timeout. Writes progress stages (pulling_code → building → starting) to `data/.update-result`. Checks for `data/.update-cancel` file at each stage to support user-initiated cancellation. Writes JSON results to `data/.update-result` and `data/.update-history`.
- `frontend/src/app/settings/system/page.tsx` — Settings > System page: current/latest version display, check for updates, update now with password confirmation dialog, progress polling every 15s with stage display (Step 1/3, 2/3, 3/3), cancel update button with password confirmation, amber timeout warning after 5 minutes, update history list with status badges (including cancelled status).

**New files — License Server (~/helixnode-api):**
- `app/routes/version.py` — `GET /v1/version/latest` returns `{ version, release_date, changelog_url, min_version, message }` from env vars `LATEST_HELIX_VERSION` and `LATEST_HELIX_RELEASE_DATE`.

**Modified files:**
- `backend/app/main.py` — Registered version router.
- `docker-compose.yml` — Added `./VERSION:/app/VERSION:ro` and `./data:/app/data` volume mounts to backend.
- `.gitignore` — Added `.update-trigger`, `.update-result`, `.update-history`, `.pre-update-commit` and their `data/` equivalents.
- `install.sh` — Added update daemon setup: creates `data/` dir, installs `helix-updater.service` systemd unit (overwrites on each install to stay current).
- `frontend/src/components/sidebar.tsx` — Added "System" (Monitor icon) to admin nav items. Added version display (v1.0.0) in sidebar footer with blue dot for updates. Added update available banner linking to Settings > System.
- `frontend/src/lib/api.ts` — Added version API methods (getVersion, checkForUpdates, triggerUpdate, getUpdateHistory) and types (VersionInfo, UpdateTriggerResponse, UpdateHistoryItem).
- `helixnode-api/app/main.py` — Registered version router.
- `helixnode-api/docker-compose.yml` — Added `LATEST_HELIX_VERSION` and `LATEST_HELIX_RELEASE_DATE` env vars.

**Update flow:** Admin clicks "Update Now" in Settings > System → enters password → backend writes `data/.update-trigger` → host daemon detects trigger → writes progress stages → git pull → docker compose up --build (10min timeout) → wait 90s → health check → success or auto-rollback → writes result to `data/.update-result` → frontend polls `/api/version` every 15s and shows staged progress. Cancel: admin clicks "Cancel Update" → enters password → backend writes `data/.update-cancel` → daemon detects at next stage boundary → aborts and writes cancelled status.

**Systemd service:** `helix-updater.service` — runs `update-daemon.sh` as root, restarts on failure. Service unit includes `Requires=docker.service`, journal logging (`SyslogIdentifier=helix-updater`), and explicit `PATH`/`HOME` environment. `install.sh` creates the service automatically on Linux installs (overwrites on each install to stay current). For existing installs, the service file is at `~/helix-updater.service` — copy to `/etc/systemd/system/` and enable manually.

### March 27, 2026 — Agent Intelligence Skills Pack (Marketplace)

**Feature:** 4 agent intelligence skills + 1 department pack added to the HelixNode Marketplace. Available to all plans (min_plan: starter). These are prompt-injection skills that shape how agents think, learn, and improve.

**Marketplace templates added (license server DB):**
1. `hn-learning-loop` (skill) — Agents save rules from corrections and lessons from successes, accumulating knowledge over time
2. `hn-self-reflection` (skill) — Quality gate before task submission with checklist and confidence signals
3. `hn-task-context` (skill) — Maintains consistency with previous approved work, cross-agent awareness
4. `hn-feedback-loop` (skill) — Learns from approval/rejection patterns, trend detection, reviewer adaptation
5. `hn-agent-intelligence-pack` (department_pack) — Bundle of all 4 skills

**New marketplace category:** `intelligence` — "Intelligence" with 🧠 emoji, "Skills that make agents smarter over time"

**All templates:** is_official=true, is_featured=true, author=helixnode, status=published, min_plan=starter

**No Mission Control code changes** — skills are marketplace-only, installed by customers through the Marketplace page. Installed skills get injected into agent prompts at dispatch time via `resolve_active_skills()`.

### March 27, 2026 — Multi-OS Install Script

**install.sh:**
- Refactored from monolithic functions into modular OS-aware functions
- Added `detect_os()` — detects Ubuntu (20.04/22.04/24.04), Debian (11/12), and macOS (Apple Silicon + Intel)
- Docker repo setup now uses `$OS` variable (`ubuntu` or `debian`) instead of hardcoded `ubuntu` — works for both distros
- NodeSource setup unchanged (already supports both Ubuntu and Debian)
- Added full macOS installation path: requires Docker Desktop pre-installed, uses Homebrew for Node.js/git, installs to `~/helix-mission-control/`, skips user creation/swap/firewall/systemd
- OpenClaw dirs on macOS: no `chown 1001:1001` needed (Docker Desktop VM handles UID mapping)
- macOS skips helix-updater systemd service — manual update instructions printed instead
- All Linux behavior preserved identically for Ubuntu 24.04 (tested path)
- Version bumped to 1.1.0

**docker-compose.yml:**
- Removed `version: "3.9"` line — Docker Compose v2 doesn't need it and it generates a deprecation warning

### March 27, 2026 — Landing Page & Docs: macOS Install Command

**landing/index.html** (new file in repo, deployed to /var/www/helixnode.tech/):
- Install command section now has pill-style tab switcher: "Linux / VPS" (default) and "macOS"
- Linux tab: `curl -fsSL https://helixnode.tech/install.sh | sudo bash`
- macOS tab: `curl -fsSL https://helixnode.tech/install.sh | bash` (no sudo)
- Copy-to-clipboard copies whichever command is currently active
- Tabs use `.install-tabs` / `.install-tab` CSS, matching existing dark theme

**Docs updates (~/helixnode-docs/):**
- `getting-started/installation.md` — Split install command into Linux and macOS sections with headers
- `getting-started/beta-quickstart.md` — Added macOS as "Option B" in requirements, dual install commands
- `getting-started/requirements.md` — Complete rewrite: supported OS table (Ubuntu 20/22/24, Debian 11/12, macOS 12+), separate Linux vs macOS requirement tables, macOS differences callout

### March 28, 2026 — v1.1.1 Fixes merged to main
- All staging fixes (formatter, billing cache, gateway entrypoint, config isolation) merged to main and deployed to production
- Version bumped to v1.1.1, tag pushed, license server updated
- Staging continues as the development/testing environment

### March 28, 2026 — v1.1.1 Bug Fixes (merged from staging branch)

**New: Staging environment at ~/helix-staging/**
- Separate Docker Compose stack on staging branch
- Ports: Frontend 3100, Backend 8010, PostgreSQL 5435, Redis 6380
- Host OpenClaw staging gateway on port 18810 (systemd: openclaw-staging.service)
- URL: https://staging.helixnode.tech
- License: HLX-STG1-7F27-48F9-90C7 (Scale tier)
- All new development/testing happens on staging first, then merges to main

**Fix 1: License key formatter (frontend/src/lib/billing.ts)**
- formatLicenseKey() grouped all chars by 4, breaking the 3-char HLX prefix
- Fixed to keep HLX as first group, then groups of 4 for remaining chars

**Fix 2: Billing cache response format (backend/app/routers/billing.py)**
- License server returns status nested in billing.status, but _cache_response() expected top-level status
- Result: after activation, cache stored status:unknown, plan showed as invalid, locking users out
- Fixed by transforming activate/trial responses into flat BillingPlan format before caching

**Fix 3: Gateway entrypoint sk-kimi key extraction (gateway/entrypoint.sh)**
- sk-kimi keys stored in auth-profiles.json weren't being extracted due to broken control flow
- KIMI_API_KEY env var was empty, causing OpenClaw auth failure on task dispatch
- Fixed control flow to always extract key when auth profile exists

**Fix 4: Gateway config isolation (docker-compose, entrypoint)**
- Gateway container was mounting entire .openclaw directory, overwriting host config on startup
- Fixed to use isolated Docker volume for container config, read-only mounts for credentials only

### March 27, 2026 — Update Model Provider Lists to Current 2026 Lineups

**Problem:** Settings > Models page showed outdated model suggestions — Moonshot still listed deprecated moonshot-v1-* models, Anthropic still listed retired Claude 3.x models.

**backend/app/services/model_providers.py:**
- Moonshot models updated: kimi-k2.5 (flagship), kimi-k2-0905-preview (enhanced coding), kimi-k2-turbo-preview (fast), kimi-k2-0711-preview (original K2), kimi-k2-thinking (reasoning), kimi-k2-thinking-turbo (fast reasoning). Removed moonshot-v1-8k/32k/128k (deprecated).
- Anthropic models updated: claude-opus-4-6-20250205, claude-sonnet-4-6-20250217 (new default), claude-haiku-4-5-20251001, claude-sonnet-4-5-20250514, claude-opus-4-5-20251124. Removed retired claude-3.x models.
- OpenAI models verified current (gpt-5.4 series, already updated).

**frontend/src/app/settings/models/page.tsx:**
- PROVIDER_SUGGESTIONS updated for moonshot, anthropic, openai to match backend.

**frontend/src/components/onboarding/ai-model-step.tsx:**
- No changes needed — fetches provider data from backend API dynamically.

**Display-only change** — no impact on running agents, gateway, or API routing.

### March 28, 2026 — v1.1.2 Board Permissions + Marketplace Fixes

**Board Permission Tightening:**
- POST /tasks/{id}/execute — added check_board_access(create)
- POST /tasks/{id}/attachments — added check_board_access(create)
- GET /tasks/{id}/attachments — added check_board_access(view)
- GET /attachments/{id}/download — added org_id filter + check_board_access(view)
- DELETE /attachments/{id} — added org_id filter + check_board_access(create)
- GET /agents/{id}/tasks — added get_user_accessible_board_ids filtering
- check_board_access() returns 404 instead of 403

**Marketplace Fixes:**
- Added department_pack type support to install_service.py
- Added actual prompt content to 4 Agent Intelligence skill templates (hn-learning-loop, hn-self-reflection, hn-task-context, hn-feedback-loop)

### March 28, 2026 — White Label Batch 1: Backend Branding Engine

**New table: white_label_config**
- Stores per-org white label branding configuration
- Columns: product_name, product_short_name, company_name, logo_url, favicon_url, accent_color, accent_color_secondary, login_title, login_subtitle, footer_text, loading_animation_enabled, loading_animation_text, custom_css, docs_url, support_email, support_url, marketplace_visible
- One row per org (org_id UNIQUE FK organizations)

**New files:**
- backend/app/models/white_label.py — SQLAlchemy model WhiteLabelConfig
- backend/app/schemas/white_label.py — Pydantic schemas (BrandingPublic, WhiteLabelConfigOut, WhiteLabelConfigUpdate)
- backend/app/routers/white_label.py — 6 API endpoints
- backend/app/routers/white_label.py — 7 API endpoints

**New endpoints:**
- GET /api/branding — public (no auth), returns branding config with defaults
- GET /api/settings/white-label — admin only, returns full config for org
- PUT /api/settings/white-label — admin only, update config (gated to white_label license feature)
- POST /api/settings/white-label/logo — admin only, upload logo (png/jpg/svg, 2MB max)
- POST /api/settings/white-label/favicon — admin only, upload favicon (png/ico/svg, 500KB max)
- POST /api/settings/white-label/reset — admin only, reset all branding to defaults (deletes DB row, logs activity)
- GET /api/uploads/branding/{filename} — public, serve uploaded branding assets

**License gating:**
- LicenseService.has_feature() already existed — checks features list in cached plan
- PUT/POST write endpoints require features containing "white_label" (returns 403 otherwise)
- GET endpoints always work (return defaults for non-white-label plans)
- Currently always returns false since license server doesn't have white_label feature yet (Batch 4)

**Modified files:**
- backend/app/main.py — registered white_label router, added CREATE TABLE IF NOT EXISTS migration

### March 28, 2026 — White Label Batch 2: Frontend Branding Application

**Goal:** All frontend pages read branding from GET /api/branding instead of hardcoded strings.

**New files:**
- frontend/src/lib/branding.ts — Branding fetch utility with module-level cache, defaults, invalidation
- frontend/src/contexts/BrandingContext.tsx — React context provider, useBranding() hook, CSS variable injection, favicon updater, document title updater, custom CSS injection

**Modified files:**
- frontend/src/app/layout.tsx — Wrapped app with BrandingProvider
- frontend/src/app/login/page.tsx — Dynamic product name, login title, subtitle, footer, logo
- frontend/src/components/sidebar.tsx — Dynamic product short name, logo, marketplace visibility toggle
- frontend/src/components/HelixLoadingScreen.tsx — Dynamic loading animation text, enable/disable support
- frontend/src/components/onboarding/welcome-step.tsx — Dynamic product name references
- frontend/src/components/onboarding/complete-step.tsx — Dynamic product name references
- frontend/src/components/onboarding/license-step.tsx — Dynamic product name references
- frontend/src/components/onboarding/team-step.tsx — Dynamic product name references

**Branding application:**
- Login page: logo_url, login_title, login_subtitle, footer_text, product_short_name
- Sidebar: logo_url, product_short_name, marketplace_visible
- Loading animation: loading_animation_enabled, loading_animation_text
- Page titles: document.title suffix updated to branding.product_name
- Favicon: dynamically set from branding.favicon_url
- CSS variables: --accent-color, --accent-color-secondary set on document root
- Custom CSS: injected via style tag from branding.custom_css

**Pattern:** Components use useBranding() hook -> falls back to DEFAULT_BRANDING if API fails -> app never breaks

### March 28, 2026 — White Label Batch 3: Settings UI

**New files:**
- frontend/src/app/settings/white-label/page.tsx — White label settings page (7 sections: Brand Identity, Colors, Login Page, Loading & Footer, Links & Support, Marketplace, Advanced/Custom CSS)

**Modified files:**
- frontend/src/components/sidebar.tsx — Added "White Label" (Palette icon) to admin settings nav
- frontend/src/lib/api.ts — Added WhiteLabelConfig type and 4 API methods (getWhiteLabelSettings, updateWhiteLabelSettings, uploadWhiteLabelLogo, uploadWhiteLabelFavicon)

**License gating:** Page always loads and shows current values. Save/upload returns 403 without white_label license feature. Info banner indicates preview mode.

### March 28, 2026 — White Label Batch 7: Marketplace Isolation

**Backend:** Marketplace browse/discover endpoints return empty results when white_label_config.marketplace_visible = false
- Install/uninstall endpoints NOT gated (existing installs keep working)
- Helper: _is_marketplace_visible() checks white_label_config for current org
- Gated endpoints: templates list, template detail, manifest, categories, featured, reviews, community feed, leaderboard, creators list, creator profile

**Frontend:** Marketplace page shows "not available" message when marketplace_visible = false
- Sidebar nav item already hidden (Batch 2)
- Direct URL access shows fallback message with Store icon

**Modified files:**
- backend/app/routers/marketplace.py — Added _is_marketplace_visible() helper, gated all browse/discover endpoints
- frontend/src/app/marketplace/page.tsx — Added marketplace_visible guard with fallback UI

### March 28, 2026 — White Label Batch 5: Email Template Branding

**New files:**
- backend/app/services/email_templates.py — get_email_branding(), render_email_html(), send_branded_email()

**Email service functions:**
- get_email_branding(db) — reads white_label_config for company_name, product_name, logo_url, accent_color, footer_text, support_email, docs_url; returns defaults if no config
- render_email_html(subject, body_html, branding) — responsive HTML email with branded header (accent color + logo + company), white body, gray footer; all inline CSS
- send_branded_email(db, to, subject, body_html) — fetches branding, renders template, sends via Resend API (httpx POST to api.resend.com); from name is dynamic from branding.product_name

**No existing email locations to update** — no Resend calls existed in the codebase yet. Service is ready for future email features.

**Notes:** From email stays noreply@helixnode.tech (FROM_EMAIL env var). Logo in emails requires PUBLIC_URL env var to construct absolute URL. Uses httpx (already a dependency) instead of resend package.

### March 28, 2026 — White Label Batch 4: License + Stripe

**License server (~/helixnode-api/) changes:**
- New plan tiers: agency (50 agents, 25 members, $499/mo) and partner (100 agents, 50 members, $999/mo)
- white_label feature flag added to all plans: agency/partner/enterprise = true, starter/pro/scale = false
- PLANS dict: added agency and partner entries with features lists including "white_label"
- PLAN_FEATURES dict: added white_label boolean flag for all plan tiers
- MARKETPLACE_LIMITS dict: added agency and partner entries
- config.py: added Stripe price env vars for agency/partner (monthly + annual)
- license_service.py: updated upgrade order to include agency and partner
- stripe-white-label-products.md: Stripe product creation reference doc

**Mission Control (~/helix-staging/) changes:**
- billing.ts: added agency/partner to PLAN_TIERS, PLAN_ORDER, FEATURE_MATRIX (white_label), FEATURE_LABELS
- PlanCard.tsx: added agency/partner feature lists
- billing/page.tsx: added Agency and Partner plan cards, grid changed to 3-col layout

**Feature flow (end-to-end):**
- License server returns "white_label" in limits.features list for agency/partner/enterprise
- MC caches limits.features as JSONB in license_cache.features
- has_feature("white_label") checks "white_label" in cached features list
- White label settings page PUT/POST endpoints check has_feature("white_label") — returns 403 without it

**Stripe:** Products must be created manually in Stripe Dashboard, price IDs added to .env

### March 28, 2026 — White Label Batch 6: Onboarding Branding Step

**New file:** frontend/src/components/onboarding/branding-step.tsx
- Optional onboarding step shown after license activation if license plan is agency/partner/enterprise
- Quick setup: product name, short name, logo upload, accent color
- "Skip for now" option — configure later in Settings > White Label
- Calls PUT /api/settings/white-label + POST logo upload on save, then invalidateBranding()

**Modified files:**
- frontend/src/app/onboarding/page.tsx — After license step, fetches billing plan; if white_label plan detected, inserts branding step (step 4) and shifts subsequent steps to total 10. Non-white-label plans keep the original 9-step flow.
- frontend/src/components/onboarding/stepper.tsx — Accepts optional `labels` prop for dynamic step labels (defaults to original 9 labels)

### March 29, 2026 — Password Reset Feature

**New endpoints:**
- POST /api/auth/forgot-password — public, sends reset email (if Resend configured)
- POST /api/auth/reset-password — public, reset password with token
- PUT /api/users/{id}/reset-password — admin only, reset any user's password

**New files:**
- frontend/src/app/forgot-password/page.tsx — forgot password form
- frontend/src/app/reset-password/page.tsx — reset password with token

**Modified files:**
- backend/app/core/security.py — create_reset_token(), verify_reset_token()
- backend/app/routers/auth.py — forgot-password, reset-password endpoints
- backend/app/routers/users.py — admin reset-password endpoint
- backend/app/schemas/auth.py — ForgotPasswordRequest, ResetPasswordRequest, AdminResetPasswordRequest
- frontend/src/app/login/page.tsx — "Forgot password?" link
- frontend/src/app/team/page.tsx — admin "Reset Password" action button + dialog
- frontend/src/lib/api.ts — forgotPassword, resetPassword, adminResetPassword methods

**Password reset flow:**
1. User clicks "Forgot password?" on login page
2. Enters email → POST /api/auth/forgot-password
3. If Resend configured: branded email with reset link (15min expiry JWT)
4. User clicks link → /reset-password?token=xxx
5. Enters new password → POST /api/auth/reset-password

**Admin reset flow:**
- Team page → key icon button → "Reset Password" dialog → enter new password → PUT /api/users/{id}/reset-password

**Change password (pre-existing):**
- Settings > Profile → "Change Password" section → POST /api/auth/me/change-password

### March 29, 2026 — Kimi/Moonshot Key Prefix Detection + Test Connection Fixes

**Problem:** Onboarding with Moonshot provider + sk-kimi- key returned "Invalid API key" because sk-kimi- keys are for the Kimi Code API (api.kimi.com), not Moonshot (api.moonshot.ai). Also, kimi_code base_url had trailing slash causing double-slash in /models URL.

**Backend — `services/model_providers.py`:**
- Fixed kimi_code `base_url` from `https://api.kimi.com/coding/` to `https://api.kimi.com/coding` (no trailing slash)

**Backend — `routers/settings.py` — `test_model_connection()`:**
- Added key prefix mismatch detection before API call. Finds all matching prefixes, picks the longest, and only suggests switching if exactly one provider matches at that length (unambiguous). Example: sk-kimi- (len 9) uniquely matches kimi_code; sk- (len 3) matches both moonshot and openai so no auto-suggestion.
- Fixed URL construction: `base_url.rstrip("/") + "/models"` prevents double-slash regardless of trailing slash.

**Frontend — `components/onboarding/ai-model-step.tsx`:**
- Added `handleApiKeyChange` with unambiguous longest-prefix auto-detection across all providers from API response
- Auto-switches provider, base URL, and default model when key prefix uniquely matches a different provider
- Shows blue info message on auto-switch (e.g. "Detected Kimi Code (Advanced) key — switched provider to Kimi Code (Advanced).")

**Frontend — `app/settings/models/page.tsx`:**
- Added `PROVIDER_KEY_PREFIXES` map and `handleFormApiKeyChange` with same unambiguous longest-prefix logic
- Auto-switches provider in Add/Edit Model dialog when pasting a key
- Fixed trailing slash in `PROVIDER_BASE_URLS.kimi_code`
- Shows blue info message below API key field on auto-switch

### March 29, 2026 — Billing Page Light Mode Fix

**Problem:** Billing page had hardcoded dark-mode colors (bg-gray-900, border-white/10, text-gray-400, etc.) that were invisible/ugly in light mode.

**Frontend — `app/settings/billing/page.tsx`:**
- Replaced all hardcoded dark backgrounds with shadcn/ui semantic tokens: `<Card>` default, `bg-muted`, `bg-card`, `bg-accent/30`, `bg-background`
- Replaced hardcoded text colors: `text-gray-400/500` → `text-muted-foreground`, `text-white` → `text-foreground`
- Replaced hardcoded borders: `border-white/10` → `border-border`
- Usage bar track: `bg-gray-700` → `bg-muted`
- License key code block: `bg-gray-800/50` → `bg-muted`
- Feature grid items: theme-aware border/background
- Interval toggle: `bg-white/10` → `bg-background shadow-sm`
- White label section: `border-white/[0.06] bg-gray-900/30` → `border-border bg-card`
- All colored text (emerald, blue, etc.) uses `text-X-500 dark:text-X-400` pattern

**Frontend — `components/billing/PlanCard.tsx`:**
- Card: `bg-gray-900/50` → `bg-card`, border: `border-white/10` → `border-border`
- Plan name/price: `text-white` → default foreground
- Feature text: `text-gray-300` → `text-muted-foreground`
- Price suffix: `text-gray-400` → `text-muted-foreground`

### March 29, 2026 — Gateway Config Isolation + Sync Fixes

**Problem:** Staging gateway was unreachable (handshake timeout), config sync wrote to production paths, and Docker file mounts had stale inode issues.

**Fixes:**

1. **Configurable OpenClaw config path** — gateway.py now reads from OPENCLAW_CONFIG_PATH env var instead of hardcoded /home/helix/.openclaw/openclaw.json. Enables staging and production to coexist on same host.

2. **Force sync on explicit settings change** — sync_model_config_from_db() accepts force=True parameter. Called from settings.py and onboarding.py when user explicitly saves model config. Bypasses GENERATE_CONFIG and existing-config guards. Startup sync still respects guards (fresh-install-only behavior preserved).

3. **Docker compose staging isolation** — Gateway volume points to ~/.openclaw-staging/, backend mounts full staging directory instead of individual file (avoids inode staleness). GATEWAY_URL defaults to ws://gateway:18789 (Docker network) instead of host.docker.internal.

4. **Compose dir configurable** — gateway_sync.py reads from COMPOSE_PROJECT_DIR env var instead of hardcoded production path.

5. **Kimi Code trailing slash** — gateway/entrypoint.sh fixed kimi_code base URL trailing slash.

**Modified files:**
- docker-compose.yml — volume mounts, env vars (OPENCLAW_CONFIG_PATH, COMPOSE_PROJECT_DIR)
- .env — removed GATEWAY_URL override, set GENERATE_CONFIG=true
- backend/app/services/gateway.py — configurable config path, force parameter
- backend/app/services/gateway_sync.py — configurable compose dir
- backend/app/routers/settings.py — force=True on model config save
- backend/app/routers/onboarding.py — force=True on model config save
- gateway/entrypoint.sh — kimi_code trailing slash fix

**Key principle:** Production uses GENERATE_CONFIG=false + hardcoded paths (unchanged). Staging/new installs use env vars for path configuration. force=True only runs on explicit user action (settings save, onboarding), never on startup.

### March 29, 2026 — v1.2.0 CODEBASE-CONTEXT Update, Landing Page Link Audit, Batch 8 White Label Docs + Landing Page Section

**CODEBASE-CONTEXT updates:**
- Header updated to v1.2.0
- Added white_label_config table to Section 3 (Database Schema)
- Added White Label and Email Templates services to Section 5
- Added Section 6b listing key frontend additions (BrandingContext, branding.ts, white-label settings, forgot/reset password, onboarding branding step)

**Landing page link audit (landing/index.html):**
- All links verified working: footer Docs → docs.helixnode.tech, GitHub → Xylement/helix-mission-control, all anchor links (#demo, #waitlist, #features, #how-it-works, #pricing) have matching IDs, install.sh exists at /var/www/helixnode.tech/install.sh
- All external URLs verified resolving (200 OK)

**Batch 8 — White Label docs + landing page section:**
- New docs page: ~/helixnode-docs/billing/white-label.md — overview, features, pricing (Agency/Partner/Enterprise), setup guide, FAQ
- Updated docs: ~/helixnode-docs/billing/plans.md — added Scale/Agency/Partner tiers, corrected Starter ($49) and Pro ($99) pricing, added white_label feature row, link to white-label page
- VitePress sidebar: added White Label under Billing section
- Landing page: added "Rebrand HELIX as Your Own" section between Pricing and Waitlist — feature bullets (full rebrand, your domain, invisible infrastructure, marketplace toggle), pricing cards (Agency $499, Partner $999, Enterprise custom), Contact Us CTA
- Docs built (~/helixnode-docs/dist/) — needs sudo to deploy to /var/www/docs.helixnode.tech/

**Staging VERSION updated to 1.2.0**

### March 30, 2026 — Update Daemon Hardening + White Label Reset

**Part 1: Update Daemon Hardening**
- `update-daemon.sh` — Added 10-minute build timeout (`timeout 600`), progress stages written to `.update-result` (pulling_code → building → starting), cancel support via `.update-cancel` file checked at each stage
- `backend/app/routers/version.py` — New `POST /api/version/cancel` endpoint (admin, password confirmation, writes `.update-cancel`)
- `backend/app/services/version_service.py` — Added `write_cancel_trigger()` and `UPDATE_CANCEL` path constant
- `frontend/src/app/settings/system/page.tsx` — Progress stage display (Step 1/3, 2/3, 3/3), Cancel Update button with password confirmation dialog, amber warning after 5 minutes, cancelled status badge, light mode warning banner contrast already fixed in prior commit
- `frontend/src/lib/api.ts` — Added `cancelUpdate()` method, `stage`/`started_at` fields to `UpdateHistoryItem`

**Part 2: White Label Reset to Defaults**
- `backend/app/routers/white_label.py` — New `POST /api/settings/white-label/reset` endpoint (admin, white_label feature required, deletes DB row, logs activity, returns BrandingPublic defaults)
- `frontend/src/app/settings/white-label/page.tsx` — "Reset to Defaults" button (red outline, RefreshCcw icon) at top-right, confirmation dialog, calls reset endpoint then reloads page
- `frontend/src/lib/api.ts` — Added `resetWhiteLabelSettings()` method

### April 6, 2026 — Gateway Entrypoint Config Fix

**Problem:** `gateway/entrypoint.sh` generated a minimal `openclaw.json` with a `"server"` key when no model key was configured. OpenClaw doesn't recognize `"server"` — only `gateway`, `env`, `models`, `agents`, `tools`, `channels` are valid top-level keys — causing the gateway to crash on fresh installs.

**Fix (`gateway/entrypoint.sh`):**
- Replaced invalid `"server"` block with a proper `"gateway"` section containing `mode`, `port`, `bind`, and `auth` fields
- Minimal config now matches the structure used by the full config generation path
- Gateway starts correctly in waiting mode on fresh installs until a model key is configured via onboarding

### April 6, 2026 — Backend OpenClaw Volume Mount Fix

**Problem:** Backend container mounted individual `~/.openclaw` sub-paths (openclaw.json file, workspaces/, identity/ read-only) instead of the full directory. The `sync_model_config_from_db()` function writes auth-profiles.json to `agents/*/agent/auth-profiles.json`, but the `agents/` directory was not mounted — writes went to the container filesystem and were invisible to the gateway container (which mounts the full `~/.openclaw` directory).

**Fix (`docker-compose.yml`):**
- Replaced three individual volume mounts (`workspaces`, `openclaw.json:rw`, `identity:ro`) with a single full-directory mount: `${HOME:-.}/.openclaw:/home/helix/.openclaw:rw`
- Backend now has read-write access to the entire `~/.openclaw` tree, matching the gateway container's mount strategy
- auth-profiles.json writes from `sync_model_config_from_db()` now persist to the host and are visible to the gateway

### April 6, 2026 — AI Models Sync to OpenClaw Config

**Problem:** The `ai_models` table (`/api/models/*` endpoints in `ai_models.py`) was completely disconnected from `sync_model_config_from_db()`. Saving a model via `PATCH /api/models/{id}` updated the DB but never wrote to `openclaw.json` or `auth-profiles.json`. The sync function only read from the `organization_settings` legacy table.

**Fix (`backend/app/services/gateway.py` + `backend/app/routers/ai_models.py`):**
- `sync_model_config_from_db()` now checks `ai_models` table first for default active model (`is_default=True`, `is_active=True`), falls back to `organization_settings` legacy fields
- All `ai_models.py` mutation endpoints (create, update/PATCH, delete, set-default) now call `gateway.sync_model_config_from_db(force=True)` after DB commit
- Telegram config still reads from `organization_settings` (unchanged)

**Two model storage systems:**
- `ai_models` table — multi-model CRUD, `/api/models/*` endpoints, used by Settings > AI Models UI
- `organization_settings` table — legacy single-row config, `/api/settings/model-config` endpoint, used by onboarding
- Sync priority: `ai_models` default > `organization_settings` fallback

### April 6, 2026 — OPENCLAW_CONFIG_PATH Container Path Fix

**Problem:** `OPENCLAW_CONFIG_PATH` env var in `docker-compose.yml` was set to `${HOME:-.}/.openclaw/openclaw.json`, which resolves to the **host** path at compose-time. On this host it happened to match the container mount target (`/home/helix/.openclaw/openclaw.json`), but would break if `HOME` differs (e.g. different deploy user).

**Fix (`docker-compose.yml`):**
- Hardcoded to `/home/helix/.openclaw/openclaw.json` — the container path, not the host path
- Volume mount `${HOME:-.}/.openclaw:/home/helix/.openclaw:rw` maps host dir to this path regardless of host `HOME`

### April 6, 2026 — Gateway Entrypoint Preserves Existing Model Config

**Problem:** Race condition — backend `sync_model_config_from_db()` writes correct model config (e.g. gemini) to `openclaw.json`, but when the gateway container restarts, `entrypoint.sh` overwrites it with moonshot defaults regenerated from env vars. The `GENERATE_CONFIG` variable defaulted to `true`, so config was always regenerated on every restart.

**Fix (`gateway/entrypoint.sh`):**
- Added `config_has_model_providers()` check before the config generation block
- If `openclaw.json` already exists and has `models.providers` with at least one provider, the entrypoint logs "preserving config" and skips generation entirely
- Config is only generated on first run (file missing) or when the file has no model providers (empty/minimal config)
- Backend sync remains the authoritative source for model config after initial setup

### April 6, 2026 — Write Actual API Key in Providers Config

**Problem:** `sync_model_config_from_db()` wrote `"apiKey": "${GEMINI_API_KEY}"` (env var placeholder) in the `models.providers` section of `openclaw.json`. OpenClaw needs the actual decrypted key there, not an env var reference. The key was correctly placed in the `env` section but the providers section referenced it indirectly.

**Fix (`backend/app/services/gateway.py`):**
- Changed `"apiKey": f"${{{api_key_env}}}"` to `"apiKey": api_key` — writes the real decrypted key directly
- The `env` section still gets the key for backward compatibility with entrypoint-generated configs

### April 6, 2026 — Marketplace Agent Install Manifest Format Mismatch

**Problem:** Installing an agent template from the marketplace (api.helixnode.tech) failed with `null value in column "name" of relation "agents" violates not-null constraint`. The `role_title` and `system_prompt` columns were also empty strings. Root cause: the install service expected the nested `agent_config` format produced by the local export service, but the marketplace API returns a flat manifest structure.

**Manifest format difference:**
- Export/local format: `{ "name": "...", "agent_config": { "name": "...", "role_title": "...", "system_prompt": "...", ... } }`
- Marketplace API format: `{ "type": "agent_template", "role": "Creative Designer", "system_prompt": "...", "department": "Creative", "board": "Design Studio", "skills": [...], "soul_md": "..." }` — no `agent_config` wrapper, no `name` field (use `role` instead)

**Fix (`backend/app/services/install_service.py`):**
- Added `_normalize_agent_manifest()` function that bridges flat marketplace manifests to the nested `agent_config` format
- Maps: `role` → `agent_config.name` + `agent_config.role_title`, `system_prompt` → `agent_config.system_prompt`, `department` → `agent_config.department_suggestion`, `board` → `agent_config.board_suggestion`, `skills` → `agent_config.skills`, `soul_md` → `agent_config.memory_config.soul_md_template`
- Called in both `pre_install_check()` and `install_agent_template()` after fetching the manifest
- No-op when `agent_config` already exists (locally-exported templates still work)

### April 6, 2026 — Marketplace Skill, Workflow, Plugin Manifest Normalization

**Problem:** Same flat-vs-nested manifest mismatch as the agent fix above, but affecting skills, workflows, and plugins. Marketplace API returns flat manifests; install services expected nested wrapper objects (`skill_config`, `workflow_config`, `auth`/`setting_definitions`).

**Skill manifest mismatch:**
- API returns: `{type, title, content, activation_mode}` — no `name`, no `skill_config` wrapper
- Install expected: `skill_config.{name, slug, description, content, category, tags, activation}`
- Result: null skill name, empty content

**Workflow manifest mismatch:**
- API returns: `{name, type, steps: [...]}` — no `workflow_config` wrapper, no `required_agents`
- Install expected: `workflow_config.{trigger, steps, required_agents}`
- Result: no steps created, no agents mapped

**Plugin manifest mismatch:**
- API returns: `{name, type, auth_config, plugin_type, capabilities, settings_fields}`
- Runtime expected: `manifest.auth`, `manifest.setting_definitions`
- Result: auth headers not built, settings validation skipped

**Fix:**
- `_normalize_skill_manifest()` in `install_service.py` — bridges `title`→`name`, flat fields→`skill_config`
- `_normalize_workflow_manifest()` in `install_service.py` — wraps flat `steps`→`workflow_config`, derives `required_agents` from step `agent_template` refs
- `_normalize_plugin_manifest()` in `install_service.py` — maps `auth_config`→`auth`, `settings_fields`→`setting_definitions`
- Called in `install_skill_template()`, `WorkflowInstallService.install()`, and `plugins.py` install endpoint
- All normalizers are no-ops when the nested format already exists
