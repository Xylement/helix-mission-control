# Claude Code Prompt: Update Daemon Hardening + White Label Reset

Read CODEBASE-CONTEXT.md first.

Then read SPEC-update-hardening-wl-reset.md.

## Task

Two improvements for ~/helix-staging/ (staging branch):

### Part 1: Update Daemon Hardening

1. **Modified: `update-daemon.sh`**
   - Wrap `docker compose up -d --build` with `timeout 600` (10 min max). On timeout: rollback + write failed status.
   - Write progress stages to `data/.update-result` at each step: pulling_code → building → starting → success/failed. JSON format: `{"status": "in_progress", "stage": "building", "message": "Building containers..."}`
   - Check for `data/.update-cancel` file at each stage — if found, abort, clean up trigger files, write cancelled status.

2. **Modified: `backend/app/routers/version.py`**
   - New endpoint: `POST /api/version/cancel` — admin only, password confirmation, writes `data/.update-cancel` file
   - Existing `GET /api/version` — include `stage` and `message` from .update-result in response

3. **Modified: `frontend/src/app/settings/system/page.tsx`**
   - Show progress stage text during update (e.g., "Step 2/3: Building containers...")
   - Add "Cancel Update" button (red outline) during in_progress state — calls POST /api/version/cancel with password
   - If update in_progress > 5 minutes, show amber warning "Update is taking longer than expected"
   - Fix light mode warning banner contrast in update dialog: use text-amber-700 dark:text-amber-400, bg-amber-50 dark:bg-amber-900/20, border-amber-200 dark:border-amber-800

### Part 2: White Label Reset

4. **Modified: `backend/app/routers/white_label.py`**
   - New endpoint: `POST /api/settings/white-label/reset` — admin only, requires white_label license feature
   - DELETE the white_label_config row for the org (GET /api/branding already returns defaults when no row exists)
   - Log activity: "White label branding reset to defaults"
   - Return default branding config

5. **Modified: `frontend/src/app/settings/white-label/page.tsx`**
   - Add "Reset to Defaults" button (red outline, RefreshCcw icon) at top-right of page
   - Confirmation dialog: "Reset all branding to HELIX defaults?"
   - On confirm: call POST /api/settings/white-label/reset, invalidate branding, reload page

6. **Modified: `frontend/src/lib/api.ts`**
   - Add `resetWhiteLabelSettings()` method
   - Add `cancelUpdate()` method

## Key details

- update-daemon.sh runs as root via systemd — test the script logic but note Clement must deploy it manually (helix user has no sudo)
- Cancel mechanism is file-based: write data/.update-cancel, daemon checks for it between stages
- White label reset DELETEs the DB row rather than updating fields — simpler and future-proof
- The timeout command: `timeout 600 docker compose up -d --build` — returns exit code 124 on timeout
- Follow existing patterns: password confirmation for destructive actions, activity logging, dark theme styling

## After completion

Update CODEBASE-CONTEXT.md with changes, then:

```bash
git add -A && git commit -m "feat: update daemon hardening with cancel/timeout + white label reset to defaults" && git push
```
