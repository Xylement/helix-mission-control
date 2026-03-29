# Claude Code Task Brief — March 29, 2026 Session
## HELIX Mission Control v1.2.0

---

## Context Files
- **CODEBASE-CONTEXT-mc.md** → ~/helix-mission-control/CODEBASE-CONTEXT-mc.md
- **CODEBASE-CONTEXT-staging.md** → ~/helix-staging/CODEBASE-CONTEXT-staging.md
- **Docs site** → ~/helixnode-docs/ (VitePress, deployed to docs.helixnode.tech)
- **Landing page** → /var/www/helixnode.tech/index.html (static HTML)
- **White label plan** → reference: ~/helix-mission-control/helix-white-label-plan.md

---

## TASK 1: Update CODEBASE-CONTEXT Files to v1.2.0

**Both files** (~/helix-mission-control/CODEBASE-CONTEXT-mc.md AND ~/helix-staging/CODEBASE-CONTEXT-staging.md) need the same updates:

### 1a. Header update
Change:
```
## Last updated: March 28, 2026 (v1.1.2 release)
```
To:
```
## Last updated: March 29, 2026 (v1.2.0 release)
```

### 1b. Add white_label_config table to Section 3 (Database Schema)

Add under "### Config Tables" (after `license_cache`):

```
### White Label Tables

**white_label_config** — id (UUID PK), org_id (FK organizations UNIQUE), product_name (VARCHAR 100, default "HELIX Mission Control"), product_short_name (VARCHAR 30, default "HELIX"), company_name (VARCHAR 100, default "HelixNode"), logo_url (TEXT nullable), favicon_url (TEXT nullable), accent_color (VARCHAR 7, default "#3b82f6"), accent_color_secondary (VARCHAR 7, default "#8b5cf6"), login_title (VARCHAR 200, default "Sign in to Mission Control"), login_subtitle (TEXT nullable), footer_text (VARCHAR 200, default "Powered by HelixNode"), loading_animation_enabled (BOOLEAN default true), loading_animation_text (VARCHAR 30, default "HELIX"), custom_css (TEXT nullable), docs_url (TEXT default "https://docs.helixnode.tech"), support_email (VARCHAR 200 nullable), support_url (TEXT nullable), marketplace_visible (BOOLEAN default true), created_at, updated_at
```

### 1c. Add new services to Section 5 (Backend Services)

Add to the services table:
```
| White Label | routers/white_label.py | Branding API (6 endpoints), license-gated |
| Email Templates | services/email_templates.py | Branded transactional emails via Resend |
```

### 1d. Add new frontend pages/contexts

Add a note somewhere appropriate (or create a new subsection) listing key frontend additions since v1.1.2:
- `contexts/BrandingContext.tsx` — React context for dynamic branding
- `lib/branding.ts` — Branding fetch + cache
- `app/settings/white-label/page.tsx` — White label settings
- `app/forgot-password/page.tsx` — Forgot password form
- `app/reset-password/page.tsx` — Reset password with token
- `components/onboarding/branding-step.tsx` — Onboarding branding step

### 1e. Update Section 8 (Known Issues)

The landing page footer links are partially fixed. Add:
```
- Landing page link audit pending (footer Docs/GitHub links fixed, full audit not yet done)
```

Remove this line once we complete Task 2 in this session.

### 1f. Version file

Update ~/helix-mission-control/VERSION to `1.2.0` if not already done.
Update ~/helix-staging/VERSION to `1.2.0` if not already done.

---

## TASK 2: Landing Page Full Link Audit + Fixes

**File:** /var/www/helixnode.tech/index.html

**Also check the source file in repo if it exists:** ~/helix-mission-control/landing/index.html

### Known issues from current page (fetched today):

1. **Footer "Docs" link** → currently `#` → should be `https://docs.helixnode.tech`
2. **Footer "GitHub" link** → currently `https://github.com` (generic) → should be `https://github.com/Xylement/helix-mission-control`
3. **Nav "Demo" link** → `#demo` — verify the #demo anchor exists on the page
4. **Nav "Get Started"** → `https://docs.helixnode.tech/getting-started/installation` — verify this works ✓
5. **"Browse Marketplace Docs" button** → `https://docs.helixnode.tech/marketplace/overview` — verify this works
6. **"Join the Waitlist" and "Get Started" CTAs** → all point to `#waitlist` — verify the anchor exists
7. **"Contact Us" mailto** → `mailto:hello@helixnode.tech` — verify this is intentional
8. **Install script URL** → `https://helixnode.tech/install.sh` — verify the file exists at /var/www/helixnode.tech/install.sh

### Audit process:
1. `cat /var/www/helixnode.tech/index.html` to see the raw HTML
2. `grep -n 'href=' /var/www/helixnode.tech/index.html` to find ALL links
3. For each external link, verify it resolves (curl -sI)
4. For each anchor link (#xxx), verify the id exists in the HTML
5. Fix any broken links
6. If a repo source exists at ~/helix-mission-control/landing/index.html, update BOTH files

### After fixing:
- Update CODEBASE-CONTEXT Known Issues to remove the landing page audit item

---

## TASK 3: Batch 8 — White Label Docs + Landing Page Section

### 3a. Docs Site: White Label Page

**Location:** ~/helixnode-docs/

Create a new docs page for white label. It should fit under the Billing section in the sidebar.

**File to create:** `~/helixnode-docs/billing/white-label.md`

**Content to include:**
- What is white labeling (brief overview)
- What you get: custom branding, logo, colors, login page, loading animation, email branding, marketplace toggle, custom CSS
- Pricing: Agency ($499/mo, up to 50 agents, 25 members), Partner ($999/mo, up to 100 agents, 50 members), Enterprise (custom)
- Setup guide: activate license → Settings > White Label → configure branding
- What your clients see (they never see "HELIX" or "HelixNode")
- FAQ: custom domain setup (they point their DNS to their VPS), email branding (from address stays noreply@helixnode.tech for now), marketplace toggle

**Sidebar config:** Edit `~/helixnode-docs/.vitepress/config.mts` to add the white-label page under the Billing sidebar section:
```
{ text: 'White Label', link: '/billing/white-label' }
```

### 3b. Landing Page: White Label Section

**File:** /var/www/helixnode.tech/index.html (and repo copy if exists)

Add a new section AFTER the Pricing section and BEFORE the Early Access/Waitlist section.

**Section content:**
- Heading: "White Label for Agencies" or "Rebrand HELIX as Your Own"
- Subheading: brief value prop (sell AI orchestration under your brand)
- 3-4 feature bullets: full rebrand, your domain, your clients never see HELIX, marketplace toggle
- Pricing summary: Agency $499/mo, Partner $999/mo, Enterprise custom
- CTA: "Contact Us" → mailto:hello@helixnode.tech (or a dedicated partner inquiry email)

**Design:** Match the existing landing page style (dark theme, same font sizes, gradients, card styling).

### 3c. Docs site: Update Plans & Pricing page

**File:** ~/helixnode-docs/billing/plans.md

The current Plans & Pricing page has outdated pricing (Starter $29, Pro $79) and is missing the Scale, Agency, and Partner tiers. Update:

| Plan | Price | Agents | Members |
|------|-------|--------|---------|
| Starter | $49/mo | 5 | 3 |
| Pro | $99/mo | 15 | 10 |
| Scale | $199/mo | 50 | 25 |
| Agency | $499/mo | 50 | 25 (+ white label) |
| Partner | $999/mo | 100 | 50 (+ white label) |
| Enterprise | Custom | Unlimited | Unlimited |

Also add a row/note for the white_label feature (Agency+Partner+Enterprise only).

Add a link to the new white-label.md page: "Learn more about White Label →"

### 3d. Build and deploy docs

After editing docs:
```bash
cd ~/helixnode-docs
npm run docs:build
# Copy built output to /var/www/docs.helixnode.tech/ (or wherever VitePress deploys)
```

Check existing deploy script or Nginx config to find the correct deploy path.

---

## Execution Order

1. **Task 1** — Update CODEBASE-CONTEXT files (quick, sets the stage)
2. **Task 2** — Landing page link audit (fix broken links before adding new content)
3. **Task 3** — Batch 8: docs + landing page white label section (build on clean foundation)

## After All Tasks

- Git commit and push changes
- Tag v1.2.0 if not already tagged
- Update CODEBASE-CONTEXT Recent Changes with a summary of this session
- Verify docs.helixnode.tech and helixnode.tech load correctly

---

## Important Reminders

- **helix user has no sudo** — can't edit Nginx or system files
- **Landing page is at /var/www/helixnode.tech/** — check if helix user has write access, otherwise the repo copy at ~/helix-mission-control/landing/index.html is the source of truth
- **Docs deploy path** — check how VitePress output gets to /var/www/docs.helixnode.tech/
- **Both CODEBASE-CONTEXT files should be identical** unless staging has specific divergences to note (staging ports, staging branch, etc.)
- **Don't touch production docker-compose** — this session is docs/landing only, no backend/frontend code changes
