# SPEC: Update Daemon Hardening + White Label Reset

## Two small features in one batch — both are polish/safety improvements.

---

## Part 1: Update Daemon Hardening

### Problem
The one-click update from Settings > System can hang indefinitely. If `docker compose up --build` stalls (slow npm install, network timeout, OOM during build), the daemon waits forever. The frontend shows "Updating..." with no way to cancel or know what's happening. Users must SSH in to recover.

### Changes to `update-daemon.sh`

1. **Build timeout: 10 minutes max**
   - Wrap the `docker compose up -d --build` command with `timeout 600`
   - If timeout triggers: write status "failed" with reason "Build timed out after 10 minutes" to `.update-result`, trigger rollback

2. **Progress stages written to `.update-result`**
   - Before git pull: write `{"status": "in_progress", "stage": "pulling_code", "message": "Pulling latest code..."}`
   - After git pull: write `{"status": "in_progress", "stage": "building", "message": "Building containers..."}`
   - After build, waiting for health: write `{"status": "in_progress", "stage": "starting", "message": "Starting services..."}`
   - After health check pass: write `{"status": "success", ...}` (existing)
   - After health check fail: write `{"status": "rolling_back", "message": "Health check failed, rolling back..."}` then proceed to rollback, then write `{"status": "failed", ...}` (existing)

3. **Cancel trigger**
   - Check for `data/.update-cancel` file at each stage
   - If found: stop current operation, delete trigger files, write `{"status": "cancelled", "message": "Update cancelled by user"}` to result
   - Delete the cancel file after processing

### Changes to `backend/app/routers/version.py`

4. **New endpoint: `POST /api/version/cancel`**
   - Admin only, requires password confirmation (same as update trigger)
   - Writes `data/.update-cancel` file
   - Returns 200 OK

5. **Updated `GET /api/version` response**
   - Already reads `.update-result` — now includes `stage` and `message` fields if present

### Changes to `frontend/src/app/settings/system/page.tsx`

6. **Progress stages in UI**
   - When status is "in_progress", show the `stage` and `message` from the API
   - Display as: a step indicator or just text below the progress spinner
   - E.g., "Step 1/3: Pulling latest code..." → "Step 2/3: Building containers..." → "Step 3/3: Starting services..."

7. **Cancel button**
   - Show "Cancel Update" button (red/outline) when update is in_progress
   - Calls `POST /api/version/cancel` with password confirmation
   - On success: status changes to "cancelled"

8. **Timeout indication**
   - If update has been in_progress for > 5 minutes, show amber warning: "Update is taking longer than expected. You can cancel and try again."

9. **Light mode fix for warning banner**
   - The update confirmation dialog warning text is invisible on light mode (yellow on yellow)
   - Fix: text-amber-700 dark:text-amber-400, bg-amber-50 dark:bg-amber-900/20, border-amber-200 dark:border-amber-800

---

## Part 2: White Label Reset to Defaults

### Problem
Agencies/partners who customise their branding have no quick way to restore everything back to default HELIX branding. They must manually reset each field one by one. Need a "Reset to Defaults" button.

### Backend Changes

**New endpoint: `POST /api/settings/white-label/reset`**
- Auth: admin only, requires white_label license feature
- Deletes the `white_label_config` row for the org (or UPDATE all fields to defaults)
- Deleting the row is cleaner — GET /api/branding already returns defaults when no row exists
- Also delete uploaded logo and favicon files if they exist (optional — files are small, can leave them)
- Invalidate any server-side branding cache
- Log activity: "White label branding reset to defaults"
- Returns the default branding config

In `backend/app/routers/white_label.py` — add the new endpoint.

### Frontend Changes

**Modified: `frontend/src/app/settings/white-label/page.tsx`**

Add "Reset to Defaults" button:
- Position: top-right corner of the page, or in a danger zone section at the bottom
- Style: red outline/ghost button with RefreshCcw icon
- Clicking opens a confirmation dialog: "Reset all branding to HELIX defaults? This will remove your custom product name, logo, colors, and all other branding customizations."
- Two buttons: "Cancel" and "Reset to Defaults" (red)
- On confirm: calls POST /api/settings/white-label/reset
- On success: invalidate branding cache, reload page to show defaults, show success toast

**Modified: `frontend/src/lib/api.ts`**

Add method:
```typescript
resetWhiteLabelSettings(): Promise<BrandingPublic>
```

---

## Important Notes

1. **update-daemon.sh runs as root** (systemd service). The helix user can't modify it directly — Clement must deploy changes manually or via the install.sh update path.
2. **The cancel mechanism is file-based** (same pattern as the trigger) — simple and reliable, no IPC needed.
3. **White label reset deletes the DB row** rather than updating all fields to defaults. This is intentional — the GET /api/branding endpoint already handles "no row = return defaults" gracefully. Simpler and guaranteed to match defaults even if defaults change in future versions.
4. **The light mode warning fix** is a CSS-only change in the system page — bundle it with the update UI changes since they're in the same file.
