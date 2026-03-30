# Claude Code Prompt: Scheduled Recurring Tasks

Read CODEBASE-CONTEXT-mc.md first.

Then read the spec file: SPEC-scheduled-tasks.md

## Task

Implement scheduled recurring tasks for HELIX Mission Control at ~/helix-staging/ (staging branch). This lets admins configure agents with recurring schedules that automatically create and dispatch tasks.

## What to build

### Backend (~/helix-staging/backend/)

1. **New file: `backend/app/services/schedule_service.py`** — Core scheduling logic:
   - `calculate_next_run()` — compute next execution time based on schedule type/time/days + org timezone
   - `format_task_title()` — replace {date}, {week}, {month}, {day} in title template
   - `execute_schedule()` — create task, assign to agent, auto-dispatch (reuse existing task creation + _maybe_auto_dispatch pattern)
   - `check_and_run_due_schedules()` — query due schedules, execute each, handle errors with retry

2. **New file: `backend/app/routers/schedules.py`** — CRUD endpoints:
   - `GET /api/agents/{agent_id}/schedules` — list agent's schedules
   - `POST /api/agents/{agent_id}/schedules` — create schedule (admin only)
   - `PUT /api/agents/{agent_id}/schedules/{id}` — update (admin only)
   - `DELETE /api/agents/{agent_id}/schedules/{id}` — delete (admin only)
   - `POST /api/agents/{agent_id}/schedules/{id}/toggle` — enable/disable
   - `POST /api/agents/{agent_id}/schedules/{id}/run-now` — manual trigger
   - `GET /api/schedules` — list all schedules across agents (admin dashboard)

3. **Modified: `backend/app/main.py`** — CREATE TABLE agent_schedules migration, register schedules router, add `periodic_schedule_checker()` background task (runs every 60 seconds)

### Frontend (~/helix-staging/frontend/)

4. **Modified: `frontend/src/app/agents/[id]/page.tsx`** — Add "Schedules" section:
   - List of schedules with name, type, next run, last run, active toggle
   - "Add Schedule" button → dialog with: name, board, schedule type (daily/weekly/monthly/interval), time, days, task title template, task prompt, priority, requires_approval, tags
   - "Run Now" and edit/delete actions per schedule

5. **New file: `frontend/src/app/schedules/page.tsx`** — Schedules overview page:
   - Table of all schedules across all agents
   - Columns: Agent, Schedule Name, Type, Next Run, Last Run, Run Count, Active

6. **Modified: `frontend/src/components/sidebar.tsx`** — Add "Schedules" nav item with Clock icon

7. **Modified: `frontend/src/lib/api.ts`** — Add AgentSchedule type and all schedule API methods

8. **Modified: board task cards** — Show clock icon on tasks created by schedules (check metadata.scheduled)

## Key implementation details

- Follow existing background task pattern from `periodic_backup_scheduler()` in main.py
- Task creation reuses the same flow as routers/tasks.py create_task + _maybe_auto_dispatch
- Tasks created by schedules have metadata: `{"scheduled": true, "schedule_id": "...", "schedule_name": "..."}`
- All schedule times interpreted in org timezone (organization_settings.timezone), stored as UTC
- Minimum interval: 15 minutes (validate on create/update)
- requires_approval defaults to true (safety)
- next_run_at is pre-calculated and indexed for efficient polling
- Scheduler checks every 60 seconds (acceptable jitter)
- On execution failure: retry in 5 minutes, max 3 retries, then skip to next normal run
- Use raw SQL via text() — same pattern as existing routers
- Follow existing dark theme and component patterns

## Testing

After implementation:
1. `cd ~/helix-staging && docker compose -f docker-compose.staging.yml up -d --build`
2. Login to staging.helixnode.tech
3. Go to an agent's detail page → Schedules section
4. Create a daily schedule: "Test schedule" at current time + 2 minutes
5. Wait for it to fire — check the target board for the auto-created task
6. Verify task has "Scheduled" badge and metadata
7. Test "Run Now" button — should create and dispatch immediately
8. Test toggle (disable/enable)
9. Test the global Schedules page shows all schedules
10. Check logs: `docker compose -f docker-compose.staging.yml logs -f staging-backend | grep schedule`

## After completion

Update CODEBASE-CONTEXT-mc.md:
- Add agent_schedules table to Section 3 (Database Schema)
- Add schedule_service.py to Section 5 services table
- Add schedules router to backend key files
- Add schedules/page.tsx to frontend key files
- Add a Recent Changes entry

Then: `git add -A && git commit -m "feat: scheduled recurring tasks for agents" && git push`
