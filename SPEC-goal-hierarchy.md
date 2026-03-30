# SPEC: Goal Hierarchy (Mission → Objectives → Tasks)

## Goal
Add a strategic goal layer to HELIX Mission Control. Currently tasks exist in a flat department → board → task structure with no "why." This feature adds company-level goals and board-level objectives that cascade context down to tasks and into agent prompts — so agents always know the strategic purpose behind their work.

---

## Context

- Codebase: `~/helix-staging/` (staging branch)
- Current structure: organizations → departments → boards → tasks (location-based, no purpose layer)
- Agent prompt injection: `resolve_active_skills()` in gateway.py already injects skills into prompts at dispatch time. Goals will follow the same pattern.
- GALADO example: Marketing department has 7 boards, 8 agents. Currently agents see "Write a social media post about phone cases" but don't know "we're trying to grow Instagram to 10K followers by Q3" or "our company mission is to become the #1 phone accessories brand in SE Asia."

---

## Data Model

### New table: `goals`

```sql
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  parent_goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  goal_type VARCHAR(20) NOT NULL DEFAULT 'objective',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  owner_type VARCHAR(10) DEFAULT NULL,
  owner_id UUID DEFAULT NULL,
  target_date DATE,
  progress INTEGER DEFAULT 0,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_goals_org ON goals(org_id);
CREATE INDEX idx_goals_parent ON goals(parent_goal_id);
CREATE INDEX idx_goals_board ON goals(board_id);
```

Column details:
- `parent_goal_id` — NULL for top-level mission goals. Points to parent for sub-goals. Max 3 levels: mission → objective → key result.
- `goal_type` — `mission` (company-wide, max 1-3 per org), `objective` (department/team level), `key_result` (measurable outcome tied to a board or agent)
- `status` — `active` | `completed` | `paused` | `cancelled`
- `owner_type` — `user` | `agent` | NULL (unowned). Who's responsible for this goal.
- `owner_id` — FK to users or agents depending on owner_type. Not a DB-enforced FK (polymorphic).
- `progress` — 0-100 integer. Updated manually or auto-calculated from child goals/linked tasks.
- `department_id` — optional link to a department (for objective-level goals scoped to a department)
- `board_id` — optional link to a board (for key-result-level goals scoped to a board)

### Alter table: `tasks`

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_goal ON tasks(goal_id);
```

Tasks can optionally link to a goal. When linked, the goal context is injected into the agent prompt at dispatch time.

---

## Goal Hierarchy (3 levels max)

```
Mission: "Become the #1 phone accessories brand in SE Asia"
├── Objective: "Grow Instagram to 10K followers by Q3 2026"
│   ├── Key Result: "Post 5x/week consistently" (board: Social Media)
│   ├── Key Result: "Achieve 3% engagement rate" (board: Growth & Analytics)
│   └── Key Result: "Run 2 influencer collabs/month" (board: Social Media)
├── Objective: "Increase online revenue to RM50K/month"
│   ├── Key Result: "Optimize Meta ROAS to 4x" (board: Meta Ads)
│   ├── Key Result: "Launch 3 email flows in Klaviyo" (board: Email Marketing)
│   └── Key Result: "Improve SEO ranking for top 20 keywords" (board: SEO & Blog)
└── Objective: "Achieve <2hr average customer response time"
    ├── Key Result: "Auto-triage 80% of inbound emails" (board: CS Inbox)
    └── Key Result: "Build FAQ knowledge base" (board: CS Knowledge Base)
```

---

## Backend Changes

### New file: `backend/app/models/goal.py`

SQLAlchemy model for `goals` table.

### New file: `backend/app/schemas/goal.py`

Pydantic schemas:
- `GoalCreate` — title, description, goal_type, parent_goal_id, department_id, board_id, owner_type, owner_id, target_date
- `GoalUpdate` — all fields optional
- `GoalOut` — all fields + children count + linked tasks count + computed ancestry path
- `GoalTree` — recursive: goal + children[] (for tree view)
- `GoalContext` — lightweight: title + parent titles (for prompt injection)

### New file: `backend/app/routers/goals.py`

**CRUD endpoints:**

- `GET /api/goals` — List all goals for org. Optional filters: goal_type, status, department_id, board_id, parent_goal_id. Returns flat list with parent_goal_id for frontend to build tree.
- `GET /api/goals/tree` — Full goal tree for org. Returns nested structure (missions → objectives → key results). Cached for 60 seconds.
- `GET /api/goals/{id}` — Single goal with children, linked tasks count, ancestry path.
- `POST /api/goals` — Create goal. Admin only. Validates: parent exists and is correct type (mission can't be child of key_result), max 3 levels deep.
- `PUT /api/goals/{id}` — Update goal. Admin only. Can change parent (with depth validation), update progress, change status.
- `DELETE /api/goals/{id}` — Delete goal. Admin only. CASCADE deletes children. Unlinks tasks (sets goal_id = NULL, doesn't delete tasks).
- `POST /api/goals/{id}/progress` — Update progress. Accepts `{ progress: 75 }` or `{ auto: true }` to auto-calculate from children.

**Linking endpoints:**

- `POST /api/tasks/{task_id}/goal` — Link a task to a goal. Body: `{ goal_id: "uuid" }`. Any authenticated user with create permission on the task's board.
- `DELETE /api/tasks/{task_id}/goal` — Unlink task from goal.
- `GET /api/goals/{id}/tasks` — List all tasks linked to this goal. Includes tasks from child goals.

### New file: `backend/app/services/goal_service.py`

- `get_goal_context_for_task(db, task)` — If task has goal_id, walk up the goal tree to build full ancestry (key_result → objective → mission). Return dict with mission, objective, key_result titles. Cached per goal_id for 5 minutes.
- `auto_calculate_progress(db, goal_id)` — Calculate progress from children: if all children have progress, average them. If goal has linked tasks, calculate % completed.
- `get_goal_tree(db, org_id)` — Recursive query to build full tree. Use CTE (WITH RECURSIVE) for efficiency.

### Modified: `backend/app/services/gateway.py` — Goal context injection

In `dispatch_task()`, after resolving skills, also resolve goal context:

```python
# After skill injection, before sending to OpenClaw:
goal_context = await get_goal_context_for_task(db, task)
if goal_context:
    prompt_addition = f"\n\n## Strategic Context\n"
    prompt_addition += f"Company Mission: {goal_context['mission']}\n"
    if goal_context.get('objective'):
        prompt_addition += f"Current Objective: {goal_context['objective']}\n"
    if goal_context.get('key_result'):
        prompt_addition += f"Key Result: {goal_context['key_result']}\n"
    prompt_addition += f"\nKeep this strategic context in mind when executing this task. Your work should contribute toward these goals.\n"
    # Append to the task description sent to the agent
```

### Modified: `backend/app/routers/tasks.py`

- Task creation: accept optional `goal_id` in create request
- Task response: include `goal_id` and `goal_title` in TaskOut schema

### Modified: `backend/app/schemas/task.py`

- Add `goal_id: UUID | None` and `goal_title: str | None` to TaskOut

### Modified: `backend/app/main.py`

- CREATE TABLE migration for goals
- ALTER TABLE tasks ADD COLUMN goal_id
- Register goals router

---

## Frontend Changes

### New file: `frontend/src/app/goals/page.tsx` — Goals page

Main goals management page with two views:

**Tree view (default):**
- Visual tree showing mission → objectives → key results
- Each goal shows: title, type badge (mission/objective/key result), status, progress bar, owner avatar, target date, linked tasks count
- Expand/collapse children
- Click goal → side panel or detail page with full info

**List view (toggle):**
- Flat table with columns: Title, Type, Parent, Status, Progress, Owner, Target Date, Tasks
- Sortable and filterable

**Top actions:**
- "Add Mission" button (creates top-level goal)
- View toggle (tree / list)
- Filter by status (active / completed / all)

**Goal creation/edit dialog:**
- Title (text input, required)
- Description (textarea)
- Type (radio: Mission / Objective / Key Result) — auto-set based on parent depth
- Parent goal (dropdown, filtered by type — missions have no parent, objectives parent to mission, KRs parent to objective)
- Department (dropdown, optional — for scoping objectives)
- Board (dropdown, optional — for scoping key results)
- Owner (dropdown — users and agents from org)
- Target date (date picker)
- Status (dropdown: active / completed / paused / cancelled)

**Progress section in goal detail:**
- Progress bar (0-100)
- Manual set or "Auto-calculate from children" toggle
- List of linked tasks with status badges
- "Link Task" button → search/select tasks to link

### New file: `frontend/src/app/goals/layout.tsx`

Layout with sidebar (same pattern as costs/schedules).

### Modified: `frontend/src/components/sidebar.tsx`

- Add "Goals" nav item with Target icon (Lucide) above Departments/Boards — goals are strategic so they sit high in the nav

### Modified: `frontend/src/app/boards/[id]/page.tsx` — Board Kanban

- Show active goals linked to this board as a subtle banner at the top: "🎯 Board objective: Grow Instagram to 10K followers by Q3 2026"
- Task creation dialog: add optional "Goal" dropdown (goals scoped to this board + parent department + org-wide missions)
- Task cards: show small target icon if task is linked to a goal

### Modified: `frontend/src/app/dashboard/page.tsx` — Dashboard

- Add "Active Goals" section showing top-level missions with progress bars
- Quick overview: missions with their objectives and progress

### Modified: `frontend/src/lib/api.ts`

Add types and methods:
```typescript
interface Goal {
  id: string;
  parent_goal_id: string | null;
  title: string;
  description: string | null;
  goal_type: 'mission' | 'objective' | 'key_result';
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  owner_type: 'user' | 'agent' | null;
  owner_id: string | null;
  target_date: string | null;
  progress: number;
  department_id: string | null;
  board_id: string | null;
  children_count: number;
  tasks_count: number;
  created_at: string;
}

interface GoalTree extends Goal {
  children: GoalTree[];
}

// Methods
getGoals(filters?: {goal_type?: string; status?: string}): Promise<Goal[]>
getGoalTree(): Promise<GoalTree[]>
getGoal(id: string): Promise<Goal>
createGoal(data: Partial<Goal>): Promise<Goal>
updateGoal(id: string, data: Partial<Goal>): Promise<Goal>
deleteGoal(id: string): Promise<void>
updateGoalProgress(id: string, progress: number): Promise<void>
linkTaskToGoal(taskId: string, goalId: string): Promise<void>
unlinkTaskFromGoal(taskId: string): Promise<void>
getGoalTasks(goalId: string): Promise<Task[]>
```

---

## Goal Context in Agent Prompts

When an agent receives a task linked to a goal, this is prepended to the task description:

```
## Strategic Context
Company Mission: Become the #1 phone accessories brand in SE Asia
Current Objective: Grow Instagram to 10K followers by Q3 2026
Key Result: Post 5x/week on Instagram

Keep this strategic context in mind when executing this task. Your work should contribute toward these goals.

---

[Original task description follows]
```

If the task has no goal linked, no strategic context is injected (backward compatible).

Full chain shown: key_result → objective → mission. Partial chains if goal is only an objective or mission.

---

## Auto-Progress Calculation

When auto-calculate is enabled on a goal:

- **Goals with children:** progress = average of children's progress
- **Goals with linked tasks (no children):** progress = (completed tasks / total tasks) × 100
- **Goals with both:** children's average takes priority

Task status mapping for progress:
- `todo` = 0%, `in_progress` = 25%, `review` = 75%, `approved`/`done` = 100%, `rejected` = 25%, `cancelled` = excluded

---

## Important Notes

1. **Max 3 levels:** mission → objective → key_result. Backend validates depth.
2. **Goals are org-scoped.** All queries filter by org_id.
3. **Goals are optional.** Fully backward compatible. Tasks/boards work without goals.
4. **Goal context injection follows the skills pattern** — injected at dispatch time in gateway.py.
5. **Progress is a simple 0-100 integer.** Not a complex OKR scoring system.
6. **Owner is polymorphic.** owner_type + owner_id.
7. **The tree view is the key UX.** Users see their entire goal hierarchy at a glance.
8. **goals/layout.tsx must include the sidebar** — follow the pattern from costs and schedules pages.
