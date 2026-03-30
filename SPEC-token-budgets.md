# SPEC: Agent Token Budgets with Auto-Pause

## Goal
Add per-agent monthly token budgets with automatic pause at limit, cost dashboard visibility, and notifications. This prevents runaway API spend and gives HELIX users cost control over their AI agents.

---

## Context

- Codebase: `~/helix-staging/` (staging branch)
- Existing table: `token_usage_log` — already records per-task token usage with `estimated_cost_usd`
- Agents table: `agents` — needs new budget columns
- Dispatch flow: `routers/tasks.py` → `_maybe_auto_dispatch()` → `gateway.dispatch_task()`
- Gateway service: `services/gateway.py` — handles actual OpenClaw dispatch
- License gating: Budget feature available to Pro+ plans (use `license_service.has_feature()` pattern if needed, or make available to all plans)

---

## Database Changes

### Alter table: `agents`

Add columns:
```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS monthly_budget_usd DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_warning_threshold DECIMAL(3,2) DEFAULT 0.80;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_paused BOOLEAN DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_pause_reason VARCHAR(200) DEFAULT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS budget_reset_day INTEGER DEFAULT 1;
```

- `monthly_budget_usd` — NULL means unlimited (no budget). e.g., 10.00 = $10/month
- `budget_warning_threshold` — fraction at which to warn. Default 0.80 (80%)
- `budget_paused` — set to true when budget exceeded, blocks dispatch
- `budget_pause_reason` — e.g., "Monthly budget of $10.00 exceeded ($10.34 used)"
- `budget_reset_day` — day of month budgets reset (1-28, default 1st)

### Alter table: `organization_settings`

Add columns:
```sql
ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS default_agent_budget_usd DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS budget_notifications_enabled BOOLEAN DEFAULT true;
```

---

## Backend Changes

### New file: `backend/app/services/budget_service.py`

Core budget functions:

**`get_agent_spend_this_period(db, agent_id, reset_day) -> float`**
- Query `token_usage_log` WHERE agent_id = :id AND created_at >= period_start
- Period start = most recent occurrence of `reset_day` in current or previous month
- Return SUM(estimated_cost_usd) or 0.0

**`check_budget(db, agent_id) -> dict`**
- Get agent's `monthly_budget_usd` — if NULL, return `{"allowed": True, "unlimited": True}`
- Get current spend via `get_agent_spend_this_period()`
- Calculate percentage: spend / budget
- Return:
  ```python
  {
    "allowed": spend < budget,
    "unlimited": False,
    "budget_usd": budget,
    "spent_usd": spend,
    "remaining_usd": max(0, budget - spend),
    "percentage": min(100, (spend / budget) * 100),
    "warning": percentage >= warning_threshold * 100,
    "exceeded": spend >= budget
  }
  ```

**`pause_agent_for_budget(db, agent_id, reason)`**
- UPDATE agents SET budget_paused = true, budget_pause_reason = :reason, status = 'offline'
- Log activity: "Agent paused — budget exceeded"
- Create notification for all admin users in org

**`unpause_agent(db, agent_id)`**
- UPDATE agents SET budget_paused = false, budget_pause_reason = NULL
- Don't change status (admin sets it manually when resuming)
- Log activity

**`reset_budgets_if_due(db)`**
- Called by periodic scheduler (runs daily at midnight)
- For each agent where budget_paused = true AND budget_reset_day = today's day:
  - Check if new period spend is under budget
  - If so, unpause automatically
  - Log activity: "Agent budget reset — new billing period"

### Modified: `backend/app/services/gateway.py` — `dispatch_task()`

Before dispatching to OpenClaw, add budget check:

```python
# In dispatch_task(), before the actual dispatch:
from app.services.budget_service import check_budget, pause_agent_for_budget

budget = await check_budget(db, agent.id)
if not budget["allowed"]:
    reason = f"Monthly budget of ${budget['budget_usd']:.2f} exceeded (${budget['spent_usd']:.2f} used)"
    await pause_agent_for_budget(db, agent.id, reason)
    raise BudgetExceededError(reason)
```

Also after dispatch completes (in the callback/completion handler), check if the task's token cost pushed the agent over budget and send a warning notification if past the threshold.

### Modified: `backend/app/routers/tasks.py` — `_maybe_auto_dispatch()`

Catch `BudgetExceededError`:
```python
try:
    await _maybe_auto_dispatch(db, task, agent)
except BudgetExceededError as e:
    # Task stays in "todo" status, agent gets paused
    # Return task normally — frontend will see agent is paused
    logger.warning(f"Agent {agent.name} budget exceeded: {e}")
```

### New endpoints in `backend/app/routers/agents.py` (or new router)

**`GET /api/agents/{id}/budget`** — Get agent's current budget status
- Returns: budget_usd, spent_usd, remaining_usd, percentage, warning, exceeded, budget_paused, reset_day
- Auth: any authenticated user in org

**`PUT /api/agents/{id}/budget`** — Update agent's budget settings
- Body: `{ monthly_budget_usd: 10.00, budget_warning_threshold: 0.80, budget_reset_day: 1 }`
- Auth: admin only
- Setting monthly_budget_usd to null removes the budget (unlimited)

**`POST /api/agents/{id}/budget/override`** — Admin override to unpause a budget-paused agent
- Optionally accepts `{ increase_budget_usd: 5.00 }` to also bump the budget
- Auth: admin only
- Unpauses the agent and logs activity

**`GET /api/dashboard/costs`** — Org-wide cost dashboard data
- Returns:
  - total_spend_this_month (all agents combined)
  - total_spend_last_month
  - spend_by_agent: [{ agent_id, agent_name, spent_usd, budget_usd, percentage }]
  - spend_by_day: [{ date, total_usd }] (last 30 days for chart)
  - top_expensive_tasks: [{ task_id, task_title, agent_name, cost_usd, tokens }] (top 10)
- Auth: any authenticated user

### Modified: `backend/app/main.py`

- Add ALTER TABLE migrations for new columns
- Add `periodic_budget_checker()` background task (runs daily, resets budgets on reset_day)
- Register any new routers

### Modified: `backend/app/schemas/agent.py`

- Add budget fields to AgentOut schema: monthly_budget_usd, budget_paused, budget_pause_reason
- Add BudgetStatus schema for the budget endpoint response
- Add BudgetUpdate schema for PUT endpoint

---

## Frontend Changes

### Modified: `frontend/src/app/agents/[id]/page.tsx` — Agent detail page

Add a "Budget" section/card:
- Current spend / budget with progress bar (green < 60%, amber 60-80%, red > 80%)
- "Set Budget" button (admin only) — opens dialog with: monthly budget input, warning threshold slider, reset day picker
- "Remove Budget" option (sets to unlimited)
- If agent is budget-paused: red banner "This agent is paused — monthly budget exceeded" with "Override & Resume" button (admin only)

### New file: `frontend/src/app/costs/page.tsx` — Cost Dashboard

New page at `/costs`:
- Top KPIs: Total spend this month, Total spend last month, MoM change, # agents with budgets
- "Spend by Agent" bar chart or table showing each agent's spend vs budget
- "Daily Spend" line chart (last 30 days)
- "Most Expensive Tasks" table (top 10)
- Agents near/over budget highlighted in amber/red

### Modified: `frontend/src/components/sidebar.tsx`

- Add "Costs" nav item with DollarSign icon (Lucide) in the admin section

### Modified: `frontend/src/lib/api.ts`

Add types and methods:
```typescript
interface BudgetStatus {
  budget_usd: number | null;
  spent_usd: number;
  remaining_usd: number;
  percentage: number;
  warning: boolean;
  exceeded: boolean;
  budget_paused: boolean;
  budget_pause_reason: string | null;
  reset_day: number;
  unlimited: boolean;
}

interface CostDashboard {
  total_spend_this_month: number;
  total_spend_last_month: number;
  spend_by_agent: Array<{agent_id: string; agent_name: string; spent_usd: number; budget_usd: number | null; percentage: number}>;
  spend_by_day: Array<{date: string; total_usd: number}>;
  top_expensive_tasks: Array<{task_id: string; task_title: string; agent_name: string; cost_usd: number; tokens: number}>;
}

getAgentBudget(agentId: string): Promise<BudgetStatus>
updateAgentBudget(agentId: string, data: {monthly_budget_usd: number | null; budget_warning_threshold: number; budget_reset_day: number}): Promise<void>
overrideAgentBudget(agentId: string, increase?: number): Promise<void>
getCostDashboard(): Promise<CostDashboard>
```

### Modified: `frontend/src/app/agents/page.tsx` or agents list

- Show small budget indicator next to each agent: green dot = under budget, amber = warning, red = exceeded/paused, no dot = unlimited
- Tooltip on hover showing "$X.XX / $Y.YY"

---

## Agent Status Integration

When an agent is budget-paused:
- `budget_paused = true` on the agents table
- `status` set to `offline`
- Agent card shows "Budget Exceeded" badge in red
- Tasks assigned to this agent stay in "todo" (not dispatched)
- Admin can override via the agent detail page or cost dashboard
- Budget auto-resets on `budget_reset_day` of each month

---

## Important Notes

1. **Estimated cost accuracy** — `token_usage_log.estimated_cost_usd` is calculated at dispatch time based on model pricing. This is an estimate, not the actual API bill. Good enough for budgeting but note this in the UI.
2. **NULL budget = unlimited** — don't force budgets on all agents. Many users will want some agents unlimited.
3. **Budget check happens pre-dispatch** — if an agent completes a task that pushes them over budget, they're paused AFTER that task, not mid-task. The check prevents the NEXT task from starting.
4. **No plan gating needed** — token cost visibility benefits all plans. Makes HELIX stickier.
5. **Timezone** — use the org's timezone setting (`organization_settings.timezone`) for budget period calculations.
