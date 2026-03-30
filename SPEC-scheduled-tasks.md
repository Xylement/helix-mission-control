# SPEC: Scheduled Recurring Tasks (Agent Schedules)

## Goal
Allow HELIX users to configure agents with recurring schedules — "every morning at 9am, create a task for this agent with this prompt." This turns HELIX from a purely reactive system (human assigns → agent acts) into a proactive one (agent has standing orders that fire on a schedule). The system creates and dispatches tasks automatically — agents still use instant dispatch, not heartbeat polling.

---

## Context

- Codebase: `~/helix-staging/` (staging branch)
- Existing pattern: GALADO already uses external crons for Crystal email polling and daily marketing standup. This feature makes that self-serve for customers.
- Existing background task pattern: `periodic_backup_scheduler()` in main.py runs hourly — follow this pattern
- Task creation flow: `routers/tasks.py` → `create_task()` → `_maybe_auto_dispatch()`
- Org timezone: `organization_settings.timezone` (default Asia/Kuala_Lumpur)

---

## How It Works

1. Admin configures a schedule on an agent: "Every day at 09:00, run this prompt on this board"
2. A background scheduler checks every minute for due schedules
3. When a schedule fires: system creates a task (title from template, description = the prompt), assigns it to the agent, and auto-dispatches immediately
4. The agent executes instantly (existing dispatch flow) — no heartbeat waiting
5. Task goes to review as normal — human approves/rejects

**This is NOT heartbeat polling.** The agent doesn't wake up and look around. The system creates a specific task with a specific prompt and dispatches it. The agent does exactly what it's told, just like any other task.

---

## Database Changes

### New table: `agent_schedules`

```sql
CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  task_title_template VARCHAR(500) NOT NULL,
  task_prompt TEXT NOT NULL,
  schedule_type VARCHAR(20) NOT NULL DEFAULT 'daily',
  schedule_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  schedule_days TEXT[] DEFAULT '{}',
  schedule_interval_minutes INTEGER DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,
  priority VARCHAR(20) DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  run_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_schedules_next_run ON agent_schedules(next_run_at) WHERE is_active = true;
```

Column details:
- `name` — human label, e.g., "Morning content check", "Weekly SEO audit"
- `task_title_template` — supports date variables: "Daily content review — {date}", "Weekly SEO audit — Week {week}"
- `task_prompt` — the full prompt/description for the created task
- `schedule_type` — one of: `interval` | `daily` | `weekly` | `monthly`
- `schedule_time` — HH:MM in 24h format, interpreted in org timezone
- `schedule_days` — for weekly: ['monday', 'wednesday', 'friday']. For monthly: ['1', '15'] (day numbers)
- `schedule_interval_minutes` — for interval type: e.g., 60 = every hour (minimum 15 minutes)
- `requires_approval` — whether created tasks need human approval (default true for safety)
- `priority` — default priority for created tasks
- `tags` — default tags for created tasks
- `next_run_at` — pre-calculated next execution time (UTC), updated after each run
- `last_run_at` — when last task was created
- `run_count` — total times this schedule has fired

---

## Backend Changes

### New file: `backend/app/services/schedule_service.py`

**`calculate_next_run(schedule) -> datetime`**
- Based on schedule_type, schedule_time, schedule_days, org timezone
- For `daily`: next occurrence of schedule_time in org timezone
- For `weekly`: next occurrence of schedule_time on one of schedule_days
- For `monthly`: next occurrence of schedule_time on one of schedule_days (day numbers)
- For `interval`: last_run_at + interval_minutes (or now + interval_minutes if never run)
- Always return UTC datetime

**`format_task_title(template, now) -> str`**
- Replace `{date}` with formatted date (e.g., "Mar 30, 2026")
- Replace `{week}` with ISO week number
- Replace `{month}` with month name
- Replace `{day}` with day of week name

**`execute_schedule(db, schedule) -> task_id`**
- Create task via the same logic as `routers/tasks.py` create_task:
  - board_id from schedule
  - title = format_task_title(schedule.task_title_template)
  - description = schedule.task_prompt
  - assigned_agent_id = schedule.agent_id
  - priority = schedule.priority
  - tags = schedule.tags
  - requires_approval = schedule.requires_approval
  - created_by_user_id = schedule.created_by (original creator)
  - metadata = {"scheduled": true, "schedule_id": str(schedule.id), "schedule_name": schedule.name}
- After task creation, call `_maybe_auto_dispatch()` (same as manual task creation)
- Update schedule: last_run_at = now, run_count += 1, next_run_at = calculate_next_run()
- Log activity: "Scheduled task created: {task_title} (schedule: {schedule_name})"
- Return task ID

**`check_and_run_due_schedules(db)`**
- Called by background scheduler every 60 seconds
- Query: SELECT * FROM agent_schedules WHERE is_active = true AND next_run_at <= NOW()
- For each due schedule:
  - Check agent is not budget_paused (if budget feature is deployed)
  - Check agent status is not 'error'
  - Execute schedule
  - On failure: log error, don't update last_run_at, set next_run_at to retry in 5 minutes (max 3 retries, then skip to next normal run)

### New file: `backend/app/routers/schedules.py`

**`GET /api/agents/{agent_id}/schedules`** — List all schedules for an agent
- Auth: any org member
- Returns array of schedules with budget status

**`POST /api/agents/{agent_id}/schedules`** — Create a new schedule
- Auth: admin only
- Body:
  ```json
  {
    "name": "Morning content check",
    "board_id": "uuid",
    "task_title_template": "Daily content review — {date}",
    "task_prompt": "Check trending topics in phone accessories and draft a social media post...",
    "schedule_type": "daily",
    "schedule_time": "09:00",
    "schedule_days": [],
    "requires_approval": true,
    "priority": "medium",
    "tags": ["content", "recurring"]
  }
  ```
- Validates: agent exists, board exists, schedule_time format, schedule_type valid
- Calculates initial next_run_at
- Returns created schedule

**`PUT /api/agents/{agent_id}/schedules/{schedule_id}`** — Update schedule
- Auth: admin only
- Recalculates next_run_at on any schedule change

**`DELETE /api/agents/{agent_id}/schedules/{schedule_id}`** — Delete schedule
- Auth: admin only

**`POST /api/agents/{agent_id}/schedules/{schedule_id}/toggle`** — Enable/disable
- Auth: admin only
- Toggles is_active, recalculates next_run_at if enabling

**`POST /api/agents/{agent_id}/schedules/{schedule_id}/run-now`** — Manually trigger
- Auth: admin only
- Immediately executes the schedule (creates and dispatches task)
- Updates last_run_at and next_run_at

**`GET /api/schedules`** — List all schedules across all agents (for dashboard)
- Auth: admin only
- Returns all schedules with agent name, next run time, last run time

### Modified: `backend/app/main.py`

- Add CREATE TABLE migration for agent_schedules
- Add `periodic_schedule_checker()` background task — runs every 60 seconds, calls `check_and_run_due_schedules()`
- Register schedules router

---

## Frontend Changes

### Modified: `frontend/src/app/agents/[id]/page.tsx` — Agent detail page

Add a "Schedules" tab or section:
- List of active schedules for this agent
- Each schedule shows: name, type (daily/weekly/monthly/interval), next run time, last run time, run count, active toggle
- "Add Schedule" button (admin only) → opens dialog
- "Run Now" button per schedule (admin only)
- Edit/Delete actions per schedule

**Add Schedule dialog:**
- Name (text input)
- Board (dropdown — boards this agent has access to)
- Schedule type (radio: Daily / Weekly / Monthly / Every X Minutes)
  - Daily: time picker
  - Weekly: day checkboxes + time picker
  - Monthly: day number inputs + time picker
  - Interval: minutes input (minimum 15)
- Task title template (text input, with hint about {date}, {week}, {month} variables)
- Task prompt (textarea — the actual instruction for the agent)
- Priority (dropdown: low/medium/high/urgent)
- Requires approval (checkbox, default checked)
- Tags (tag input)

### New file: `frontend/src/app/schedules/page.tsx` — Schedules Overview

Optional: a global schedules page showing all scheduled tasks across all agents. Table with: agent name, schedule name, type, next run, last run, status toggle. Useful for admins to see everything at a glance.

### Modified: `frontend/src/components/sidebar.tsx`

- Add "Schedules" nav item with Clock icon (Lucide) in the admin section

### Modified: `frontend/src/lib/api.ts`

Add types and methods:
```typescript
interface AgentSchedule {
  id: string;
  agent_id: string;
  board_id: string;
  name: string;
  description: string | null;
  task_title_template: string;
  task_prompt: string;
  schedule_type: 'daily' | 'weekly' | 'monthly' | 'interval';
  schedule_time: string;
  schedule_days: string[];
  schedule_interval_minutes: number | null;
  is_active: boolean;
  requires_approval: boolean;
  priority: string;
  tags: string[];
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
}

getAgentSchedules(agentId: string): Promise<AgentSchedule[]>
createAgentSchedule(agentId: string, data: Partial<AgentSchedule>): Promise<AgentSchedule>
updateAgentSchedule(agentId: string, scheduleId: string, data: Partial<AgentSchedule>): Promise<AgentSchedule>
deleteAgentSchedule(agentId: string, scheduleId: string): Promise<void>
toggleAgentSchedule(agentId: string, scheduleId: string): Promise<void>
runScheduleNow(agentId: string, scheduleId: string): Promise<{task_id: string}>
getAllSchedules(): Promise<AgentSchedule[]>
```

---

## Task Metadata

Tasks created by schedules have metadata marking them:
```json
{
  "scheduled": true,
  "schedule_id": "uuid",
  "schedule_name": "Morning content check"
}
```

This allows:
- Frontend to show a clock icon or "Scheduled" badge on these tasks
- Filtering scheduled vs manual tasks
- Tracing which schedule created which task

---

## UI for Scheduled Tasks on Boards

On the Kanban board, tasks created by schedules should show a small clock icon (⏰ or Lucide Clock) next to the title to distinguish them from manually created tasks. Tooltip: "Created by schedule: {schedule_name}".

---

## Example Schedules

For reference, these are the kinds of schedules HELIX users would create:

1. **Daily content check** — Every day at 09:00: "Check trending topics in our industry and draft a social media post for review"
2. **Weekly SEO audit** — Every Monday at 10:00: "Audit our docs site for broken links, missing meta descriptions, and keyword opportunities"
3. **Email inbox triage** — Every 30 minutes: "Check the support inbox for new emails and create tasks for genuine customer enquiries"
4. **Daily standup report** — Every day at 08:00: "Review all tasks completed yesterday and in progress today. Write a standup summary."
5. **Monthly analytics report** — 1st of every month at 09:00: "Compile last month's key metrics into a summary report"

---

## Important Notes

1. **This is NOT heartbeat polling.** The system creates a real task with a real prompt and dispatches it immediately. The agent doesn't "wake up and look around."
2. **Minimum interval: 15 minutes.** Prevent users from creating schedules that fire every minute (cost/performance).
3. **Requires approval defaults to true.** Scheduled tasks go to review just like manual ones. Safety first.
4. **Budget integration.** If the token budget feature is deployed, the scheduler should check budget before creating tasks. If agent is budget-paused, skip the schedule run and log it.
5. **Timezone handling.** All schedule_time values are in the org's timezone. Store next_run_at as UTC. Use the org's timezone from organization_settings.timezone for calculations.
6. **Background task interval.** Check every 60 seconds. This means schedules have up to 60 seconds of jitter, which is acceptable for the use cases (nobody needs exactly-on-the-second execution).
7. **Task title template variables** are simple string replacements — not a full template engine. Keep it simple: {date}, {week}, {month}, {day}.
