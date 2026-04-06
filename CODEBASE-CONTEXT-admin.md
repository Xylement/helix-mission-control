# HelixNode Admin Dashboard — Codebase Context

## Overview
Admin dashboard for HelixNode (admin.helixnode.tech). Manages customer licenses, revenue tracking, trial management, marketplace analytics, and admin user management.

## Tech Stack
- **Frontend**: Next.js 14.2 (App Router), React 18, TypeScript, Tailwind CSS, Recharts, Lucide React
- **Backend**: FastAPI (Python 3.11), SQLAlchemy async, asyncpg, Stripe SDK
- **Database**: PostgreSQL (helix_license DB) — READ/WRITE on license tables (licenses, license_events), WRITE to admin_users/admin_sessions
- **Deployment**: Docker Compose — backend:8101, frontend:3001

## Architecture
- Frontend fetches from `/api/*` endpoints with JWT Bearer auth
- Backend queries helix_license DB directly via raw SQL (SQLAlchemy text())
- Stripe API used for revenue calculations (5-min cache)
- Role-based access: owner > admin > viewer

## Key Files

### Backend
- `backend/app/main.py` — FastAPI app with lifespan (creates admin tables on startup)
- `backend/app/routers/dashboard.py` — Overview, revenue, trials, marketplace endpoints
- `backend/app/routers/customers.py` — Customer list/detail/export/summary endpoints
- `backend/app/routers/activity.py` — Activity feed endpoint
- `backend/app/routers/auth.py` — Login, logout, password change
- `backend/app/routers/admin_users.py` — Admin user CRUD
- `backend/app/routers/licenses.py` — License management: list all/expiring, update, extend, events, beta create/revoke/extend/send-welcome
- `backend/app/services/metrics_service.py` — Business metrics queries (overview, trials, marketplace, customer summary)
- `backend/app/services/stripe_service.py` — Revenue calculations from Stripe + plan prices
- `backend/app/services/auth_service.py` — JWT + password hashing

### Frontend
- `frontend/src/app/page.tsx` — Dashboard with KPIs, charts, activity feed, expiring soon
- `frontend/src/app/licenses/page.tsx` — Tabbed license management: "All Licenses" (filterable table with extend/status/events dialogs) + "Beta Licenses" (creation form, success modal with welcome email, beta table with extend/revoke)
- `frontend/src/app/customers/page.tsx` — Customer list with summary KPIs, filters, search, CSV export
- `frontend/src/app/customers/[id]/page.tsx` — Customer detail with 4 info cards + event timeline
- `frontend/src/app/trials/page.tsx` — Trial metrics, health dashboard, funnel chart, converted history
- `frontend/src/app/revenue/page.tsx` — Revenue KPIs, trend chart, revenue by plan, billing split
- `frontend/src/app/marketplace/page.tsx` — Marketplace stats, installs chart, category chart, top templates
- `frontend/src/app/settings/page.tsx` — System status, admin users, password change
- `frontend/src/components/kpi-card.tsx` — Reusable KPI card with optional sparkline
- `frontend/src/components/customers-table.tsx` — Enhanced table with version badges, status dots, actions menu
- `frontend/src/components/activity-feed.tsx` — Activity timeline with event-type icons
- `frontend/src/components/skeleton.tsx` — Skeleton loaders for cards, charts, tables
- `frontend/src/components/breadcrumb.tsx` — Breadcrumb navigation
- `frontend/src/components/sidebar.tsx` — Collapsible nav with active highlighting
- `frontend/src/components/topbar.tsx` — Dynamic page title, user info, logout
- `frontend/src/components/charts/` — Revenue, customer growth, plan donut, trial funnel, installs, category bar, revenue by plan, billing split charts
- `frontend/src/lib/api.ts` — Fetch wrapper with JWT auth
- `frontend/src/lib/utils.ts` — Formatting (currency, date, relative time), version/plan/status color helpers

## Recent Changes (2026-03-31)

### License Management Improvements (Latest)
- **License key prefix display**: Key prefix shown as first column in monospace with copy button; search now includes prefix
- **Delete licenses**: Owner-only DELETE `/api/licenses/{id}` endpoint — deletes license + all events, triggers instance revalidation
- **Instance revalidation**: After any license mutation (update, extend, delete), admin backend POSTs to `{instance_domain}/api/billing/validate` (best-effort, HTTPS then HTTP, 10s timeout). Response includes `instance_revalidated: boolean`. Frontend shows toast with revalidation result
- **Delete confirmation**: Destructive delete requires typing "DELETE" to confirm
- **Frontend toast system**: Success/warning/error toasts for license operations with auto-dismiss
- **Admin user delete**: Already existed — DELETE `/api/admin-users/{id}` (cannot delete self or last owner), frontend has trash icon per row in settings

### Enhanced License Management
- **New feature**: Full license management UI — view, filter, extend, edit expiry, change status, and view events for ALL licenses (not just beta)
- **Backend**: New endpoints in `licenses.py`:
  - GET `/api/licenses` — List all licenses with status/trial/search filters
  - GET `/api/licenses/expiring` — Licenses expiring within 7 days
  - PATCH `/api/licenses/{id}` — Update license fields (owner only), logs to license_events
  - POST `/api/licenses/{id}/extend-generic` — Extend trial_ends_at or current_period_end by N days
  - GET `/api/licenses/{id}/events` — License event history
- **Frontend**: Redesigned `/licenses` page with two tabs:
  - "All Licenses" tab: filterable table (status/trial/search) with columns for customer, plan, status, type, expiry, instance, agents, last seen; actions dropdown (extend, change status, view events); expiring-soon amber banner; extend dialog with quick buttons (+7/14/30 days) or exact date picker; status change dialog; events modal with timeline
  - "Beta Licenses" tab: existing beta license creation form and table (unchanged)
- **API types**: Added `License`, `LicenseEvent` interfaces and `getLicenses`, `updateLicense`, `extendLicenseGeneric`, `getLicenseEvents`, `getExpiringLicenses` methods
- **GALADO license**: Visually tagged as "Internal" in the all-licenses table (matched by HLX-O7SR prefix)

### Welcome Email for Beta Testers
- **New feature**: Send welcome email with license key to beta testers directly from success modal
- **Backend**: POST `/api/licenses/send-welcome` endpoint using Resend API (httpx), sends styled HTML email with license key, docs/install links, support contact
- **Frontend**: "Send Welcome Email" button in license creation success modal with loading/success/error states; only available while plaintext key is visible
- **Config**: Requires `RESEND_API_KEY` env var; `FROM_EMAIL` configurable (default: noreply@helixnode.tech)
- **Dependencies**: Added `httpx` to backend requirements

## Previous Changes (2026-03-30)

### Beta License Creation
- **New feature**: Create beta tester licenses directly from admin dashboard (first WRITE to licenses table)
- **Backend**: New `licenses.py` router with POST create/revoke/extend and GET beta list endpoints
- **Frontend**: New `/licenses` page with creation form, success modal (shows key once with copy), beta licenses table with extend/revoke actions
- **Sidebar**: Added "Licenses" nav item with KeyRound icon between Customers and Trials
- **API**: New types and methods in api.ts for license CRUD operations
- **License format**: `HLX-XXXX-XXXX-XXXX-XXXX`, hashed via SHA256, billing_interval='beta', trial=false
- **Auth**: Create/revoke/extend require owner or admin role (not viewer)

## Previous Changes (2026-03-29)

### Admin Dashboard UI/UX Overhaul
- **Dashboard**: Added sparklines on KPI cards, customer growth chart, expiring soon table, auto-refresh (5min), data freshness indicator, churn rate KPI
- **Customers**: Added summary KPI row (total/active/trial/churned/avg agents), version color badges (green=latest, amber=behind, red=old), relative "last seen" timestamps (red if stale >7d), status dots, actions dropdown (view/Stripe), CSV export, search across name/email/domain/plan, filter pills
- **Customer Detail**: 4-card layout (info/subscription/usage/instance health), progress bars for agent/member usage, version badges, relative timestamps, event timeline with typed icons
- **Trials**: Added expired unconverted KPI, trial health dashboard (green/amber/red), days remaining column, last active column, converted trials history table
- **Revenue**: Added MoM growth KPI, revenue by plan donut chart, monthly vs annual billing split chart
- **Marketplace**: Added avg rating KPI, installs by category horizontal bar chart, type badges on templates
- **Settings**: Added system status card (database/Stripe/last refresh health checks)
- **Navigation**: Breadcrumbs on all pages, dynamic page titles in topbar
- **Loading States**: Skeleton loaders for all cards, charts, and tables
- **Responsive**: Scrollable tables on mobile, hidden user info labels on small screens
- **Transitions**: Subtle fade-in animation on page changes
- **Charts**: Enhanced with gradient fills, better tooltips (formatted currency + month names), dot indicators

### Version Reporting Fix
- Fixed MC backend (`~/helix-mission-control/backend/app/services/license_service.py`) to read VERSION file instead of hardcoding "1.0.0"
- License server already correctly stores `instance_version` from validate request
- MC backend rebuilt — version will update on next validation cycle (startup or 24h)

### Backend Enhancements
- Added `/api/dashboard/customers/summary` endpoint (total/active/trial/churned/avg agents)
- Added `/api/dashboard/customers/export` endpoint (CSV download with filters)
- Enhanced search to include domain and plan fields
- Added customer growth timeline (12 months, paid vs trials)
- Added expiring soon data (trials 7d + subscriptions 14d)
- Added churn rate calculation
- Added trial health categorization (green/amber/red)
- Added converted trials history
- Added expired unconverted count
- Added revenue by plan breakdown, MoM growth, billing split data
- Added avg rating for marketplace

## Important Notes
- GALADO's license (HLX-O7SR-YT8U-1WEI-MFZU) excluded from revenue metrics (internal)
- Latest version is defined in `frontend/src/lib/utils.ts` as LATEST_VERSION = '1.2.0'
- Dark theme: bg #0a0a0f, cards rgba(255,255,255,0.03), accent #3b82f6
- Plan colors: starter=blue, pro=purple, scale=emerald, agency=amber, partner=rose, enterprise=slate
