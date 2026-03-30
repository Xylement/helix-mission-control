# Claude Code Prompt: Goal Hierarchy (Mission → Objectives → Key Results)

Read CODEBASE-CONTEXT.md first.

Then read SPEC-goal-hierarchy.md.

## Task

Implement a goal hierarchy system for HELIX Mission Control at ~/helix-staging/ (staging branch). This adds a strategic layer (mission → objective → key result) above the existing department → board → task structure, with goal context injected into agent prompts at dispatch time.

## What to build

### Backend (~/helix-staging/backend/)

1. **New file: `backend/app/models/goal.py`** — SQLAlchemy model for goals table

2. **New file: `backend/app/schemas/goal.py`** — Pydantic schemas: GoalCreate, GoalUpdate, GoalOut, GoalTree, GoalContext

3. **New file: `backend/app/routers/goals.py`** — CRUD + tree + linking endpoints:
   - GET /api/goals — list with filters (goal_type, status, department_id, board_id)
   - GET /api/goals/tree — full nested tree (WITH RECURSIVE CTE)
   - GET /api/goals/{id} — single goal with children count, tasks count
   - POST /api/goals — create (admin only, validates depth max 3 levels, parent type hierarchy)
   - PUT /api/goals/{id} — update (admin only)
   - DELETE /api/goals/{id} — delete (admin only, CASCADE children, unlink tasks)
   - POST /api/goals/{id}/progress — update progress manually or auto-calculate
   - POST /api/tasks/{task_id}/goal — link task to goal
   - DELETE /api/tasks/{task_id}/goal — unlink
   - GET /api/goals/{id}/tasks — list linked tasks including child goals' tasks

4. **New file: `backend/app/services/goal_service.py`** — Core logic:
   - get_goal_context_for_task() — walk up tree to build mission/objective/key_result context
   - auto_calculate_progress() — average children or % completed tasks
   - get_goal_tree() — recursive CTE query

5. **Modified: `backend/app/services/gateway.py`** — In dispatch_task(), after skill injection, call get_goal_context_for_task(). If task has a goal, prepend "## Strategic Context" section with mission/objective/key_result titles to the task description.

6. **Modified: `backend/app/routers/tasks.py`** — Accept optional goal_id on task creation

7. **Modified: `backend/app/schemas/task.py`** — Add goal_id and goal_title to TaskOut

8. **Modified: `backend/app/main.py`** — CREATE TABLE goals migration, ALTER TABLE tasks ADD goal_id, register goals router

### Frontend (~/helix-staging/frontend/)

9. **New file: `frontend/src/app/goals/page.tsx`** — Goals management page:
   - Tree view (default): expandable tree with mission → objectives → key results
   - Each node: title, type badge, status, progress bar, owner, target date, tasks count
   - List view toggle: flat sortable table
   - Add Mission button, create/edit dialog with all fields
   - Goal detail: progress bar, linked tasks list, "Link Task" button

10. **New file: `frontend/src/app/goals/layout.tsx`** — Layout WITH sidebar (critical — use same pattern as costs/schedules pages so sidebar doesn't disappear)

11. **Modified: `frontend/src/components/sidebar.tsx`** — Add "Goals" nav item with Target icon (Lucide) in admin section, positioned above Departments

12. **Modified: `frontend/src/app/boards/[id]/page.tsx`** — Board banner showing active board-scoped goals. Task creation dialog: optional Goal dropdown. Task cards: target icon if linked to goal.

13. **Modified: `frontend/src/app/dashboard/page.tsx`** — "Active Goals" section with mission progress bars

14. **Modified: `frontend/src/lib/api.ts`** — Goal, GoalTree types + all goal API methods (CRUD, tree, link/unlink, progress)

## Key implementation details

- Goal context injected at dispatch time in gateway.py — same pattern as skills injection via resolve_active_skills()
- Max 3 depth levels enforced on create/update: mission (depth 0) → objective (depth 1) → key_result (depth 2)
- Use WITH RECURSIVE CTE for tree queries — efficient single query
- goals/layout.tsx MUST include sidebar — follow costs/page.tsx pattern exactly
- goal_id on tasks is optional — NULL means no goal linked (backward compatible)
- Progress auto-calculation: average children's progress, or % completed linked tasks
- Task status → progress mapping: todo=0, in_progress=25, review=75, approved/done=100, rejected=25, cancelled=excluded
- Follow existing patterns: raw SQL via text(), dark theme, existing component styles
- Use Lucide Target icon for goals throughout

## Testing

After implementation:
1. `cd ~/helix-staging && docker compose -f docker-compose.staging.yml down && docker compose -f docker-compose.staging.yml up -d --build`
2. Login to staging.helixnode.tech
3. Navigate to Goals page — should have sidebar
4. Create a mission: "Become #1 phone accessories brand"
5. Create an objective under it: "Grow Instagram to 10K followers"
6. Create a key result under that: "Post 5x/week" linked to Social Media board
7. Create a task on Social Media board, link it to the key result
8. Assign task to an agent — check backend logs for "Strategic Context" in dispatch
9. Test progress auto-calculation
10. Test tree view expand/collapse
11. Verify board banner shows active goals

## After completion

Update CODEBASE-CONTEXT.md:
- Add goals table to Section 3 (Database Schema)
- Add goal_id column to tasks table in Section 3
- Add goal_service.py to Section 5 services table
- Add goals router to backend key files
- Add goals/page.tsx to frontend key files
- Note the goal context injection pattern in Section 7 (Architecture Patterns)
- Add a Recent Changes entry

Then: `git add -A && git commit -m "feat: goal hierarchy with strategic context injection into agent prompts" && git push`
