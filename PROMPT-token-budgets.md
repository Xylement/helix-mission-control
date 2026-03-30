# Claude Code Prompt: Agent Token Budgets with Auto-Pause

Read CODEBASE-CONTEXT-mc.md first.

Then read the spec file: SPEC-token-budgets.md

## Task

Implement per-agent token budgets with auto-pause for HELIX Mission Control at ~/helix-staging/ (staging branch).

## What to build

### Backend (~/helix-staging/backend/)

1. **New file: `backend/app/services/budget_service.py`** — Budget calculation and enforcement:
   - `get_agent_spend_this_period()` — query token_usage_log for current billing period
   - `check_budget()` — return allowed/exceeded/warning status
   - `pause_agent_for_budget()` — set budget_paused=true, status=offline, notify admins
   - `unpause_agent()` — clear pause state
   - `reset_budgets_if_due()` — daily check to auto-reset on budget_reset_day

2. **Modified: `backend/app/services/gateway.py`** — Add budget check before dispatch in `dispatch_task()`. If budget exceeded, raise BudgetExceededError and pause agent.

3. **Modified: `backend/app/routers/tasks.py`** — Catch BudgetExceededError in `_maybe_auto_dispatch()`, let task stay in todo.

4. **Add budget endpoints** (in existing agents router or new budget router):
   - `GET /api/agents/{id}/budget` — current budget status
   - `PUT /api/agents/{id}/budget` — update budget settings (admin only)
   - `POST /api/agents/{id}/budget/override` — unpause + optional budget increase (admin only)
   - `GET /api/dashboard/costs` — org-wide cost dashboard data

5. **Modified: `backend/app/main.py`** — ALTER TABLE migrations for agents (monthly_budget_usd, budget_warning_threshold, budget_paused, budget_pause_reason, budget_reset_day) and organization_settings (default_agent_budget_usd, budget_notifications_enabled). Add daily budget reset background task. Register routers.

6. **Modified: `backend/app/schemas/agent.py`** — Add budget fields to AgentOut, new BudgetStatus and BudgetUpdate schemas.

### Frontend (~/helix-staging/frontend/)

7. **New file: `frontend/src/app/costs/page.tsx`** — Cost Dashboard page:
   - KPI cards: total spend this month, last month, MoM change
   - Spend by agent (bar chart or table with progress bars showing budget usage)
   - Daily spend line chart (last 30 days)
   - Most expensive tasks table (top 10)
   - Agents near/over budget highlighted

8. **Modified: `frontend/src/app/agents/[id]/page.tsx`** — Add Budget section:
   - Progress bar showing spend vs budget
   - Set/edit budget dialog (admin only)
   - Budget-paused warning banner with Override button

9. **Modified: `frontend/src/components/sidebar.tsx`** — Add "Costs" nav item with DollarSign icon

10. **Modified: `frontend/src/lib/api.ts`** — Add BudgetStatus, CostDashboard types and API methods

11. **Modified: `frontend/src/app/agents/page.tsx`** — Small budget indicator dots next to each agent in the list

## Key implementation details

- Budget check is PRE-dispatch — happens in gateway.py before sending to OpenClaw
- NULL monthly_budget_usd = unlimited (no enforcement)
- Budget period: from budget_reset_day of current month to budget_reset_day of next month
- Use org timezone from organization_settings.timezone for period calculations
- Agent paused state: budget_paused=true + status=offline + budget_pause_reason set
- token_usage_log already has estimated_cost_usd — SUM this for spend calculations
- Use existing patterns: raw SQL via text() for queries, same chart styles as other pages
- Follow existing dark theme styling (bg #0a0a0f, cards, accent blue)

## Testing

After implementation:
1. `cd ~/helix-staging && docker compose -f docker-compose.staging.yml up -d --build`
2. Login to staging.helixnode.tech
3. Set a budget of $0.01 on a test agent
4. Assign a task to that agent — it should execute once, then budget should be near/over
5. Assign another task — it should stay in "todo" and agent should show as budget-paused
6. Test admin override to unpause
7. Test the cost dashboard page loads with data
8. Verify: `docker compose -f docker-compose.staging.yml exec staging-db psql -U helix -d helix_mc_staging -c "SELECT name, monthly_budget_usd, budget_paused FROM agents"`

## After completion

Update CODEBASE-CONTEXT-mc.md:
- Add budget columns to agents schema in Section 3
- Add budget_service.py to Section 5 services table
- Add cost dashboard to frontend files
- Add a Recent Changes entry

Then: `git add -A && git commit -m "feat: agent token budgets with auto-pause and cost dashboard" && git push`
