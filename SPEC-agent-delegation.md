# SPEC: Agent-to-Agent Delegation
## HELIX Mission Control — v1.3.0-staging
## Target: ~/helix-staging/ (staging branch)

---

## Read CODEBASE-CONTEXT.md first.

---

## Overview

Agents can delegate sub-tasks to other agents during task execution. A parent agent working on a complex task can break it down, assign pieces to specialist agents, and incorporate their results. Sub-tasks go through the normal task lifecycle (execute → review → approve) and their results feed back to the parent.

This is NOT automated orchestration — it's agent-initiated delegation that humans can still review and approve at each step.

---

## 1. Database Changes

### tasks table — new columns

```sql
ALTER TABLE tasks ADD COLUMN parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN delegation_status VARCHAR(20);  -- NULL for non-delegated tasks, 'pending' | 'in_progress' | 'completed' | 'failed'
ALTER TABLE tasks ADD COLUMN delegated_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
```

- `parent_task_id` — links to the parent task that spawned this sub-task
- `delegation_status` — tracks the sub-task's delegation lifecycle (separate from task status)
- `delegated_by_agent_id` — which agent created this delegation

---

## 2. Backend — New Files

### backend/app/services/delegation_service.py

Core delegation logic:

**create_delegation(db, org_id, parent_task_id, delegating_agent_id, target_agent_id, title, description, priority, board_id, tags, requires_approval) -> Task**
- Validates parent task exists and belongs to org
- Validates target agent exists, is online, and belongs to org
- Validates target agent != delegating agent (no self-delegation)
- Validates max delegation depth (max 3 levels deep — prevent infinite chains)
- Creates new task with:
  - parent_task_id set
  - delegation_status = 'pending'
  - delegated_by_agent_id set
  - assigned_agent_id = target_agent_id
  - created_by_user_id = NULL (system-created)
  - board_id = target agent's primary_board_id (or specified board_id)
  - metadata = {"delegated": true, "parent_task_id": str(parent_task_id), "delegated_by": agent_name}
- Logs activity: "Agent X delegated sub-task to Agent Y"
- Creates notification for admins: "Agent X delegated a sub-task to Agent Y"
- Returns the created task

**get_sub_tasks(db, parent_task_id, org_id) -> list[Task]**
- Returns all tasks where parent_task_id matches, ordered by created_at

**get_delegation_tree(db, task_id, org_id) -> dict**
- Recursive query (WITH RECURSIVE CTE) to build full delegation tree
- Returns {task, sub_tasks: [{task, sub_tasks: [...]}]}
- Max depth 3

**get_delegation_depth(db, task_id) -> int**
- Walk up parent_task_id chain, return depth (0 = root task)

**complete_delegation(db, task_id, org_id)**
- Called when a sub-task reaches 'done' status
- Updates delegation_status to 'completed'
- Checks if all sibling sub-tasks of the parent are completed
- If all complete, updates parent task metadata with sub-task results summary

### backend/app/routers/delegations.py

Endpoints:

- `POST /api/tasks/{task_id}/delegate` — create a delegation from a task
  - Body: {target_agent_id, title, description, priority?, board_id?, tags?, requires_approval?}
  - Auth: requires admin role OR service token (agents delegate via gateway)
  - Returns: created sub-task

- `GET /api/tasks/{task_id}/subtasks` — list sub-tasks of a task
  - Auth: standard user auth + org scope
  - Returns: list of tasks with delegation_status

- `GET /api/tasks/{task_id}/delegation-tree` — full delegation tree
  - Auth: standard user auth + org scope
  - Returns: nested tree structure

Register router in main.py.

---

## 3. Backend — Modified Files

### backend/app/models/task.py

Add columns:
- `parent_task_id = Column(UUID, ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True, index=True)`
- `delegation_status = Column(String(20), nullable=True)`
- `delegated_by_agent_id = Column(UUID, ForeignKey('agents.id', ondelete='SET NULL'), nullable=True)`

Add relationships:
- `parent_task = relationship('Task', remote_side=[id], backref='sub_tasks')`
- `delegated_by_agent = relationship('Agent', foreign_keys=[delegated_by_agent_id])`

### backend/app/schemas/task.py

Add to TaskOut:
- `parent_task_id: Optional[str] = None`
- `delegation_status: Optional[str] = None`
- `delegated_by_agent_id: Optional[str] = None`
- `delegated_by_agent_name: Optional[str] = None`
- `sub_tasks_count: int = 0`

Add to TaskCreate:
- `parent_task_id: Optional[str] = None`
- `delegated_by_agent_id: Optional[str] = None`

New schemas:
- `DelegationRequest` — target_agent_id (required), title (required), description (required), priority (optional, default "medium"), board_id (optional), tags (optional), requires_approval (optional, default True)
- `DelegationTreeNode` — task: TaskOut, sub_tasks: list[DelegationTreeNode]

### backend/app/services/gateway.py

This is the critical integration. When an agent wants to delegate during execution:

**Option A (Simpler — recommended for v1):** Delegation happens AFTER task completion, not during.
- When an agent's response contains a special marker like `[DELEGATE: agent_name | task_title | task_description]` in the result text, the system parses it and creates sub-tasks automatically.
- The agent's task moves to "review" as normal.
- The human reviewer sees the delegation requests in the task result.
- Upon approving the parent task, sub-tasks are created and dispatched.

**Option B (Advanced — future):** Real-time delegation during execution via tool calls.

**Implement Option A for now:**

In `_process_task_result()` or wherever the final task result is saved:
1. Parse the result text for delegation markers: `[DELEGATE: target_agent_name | sub_task_title | sub_task_description]`
2. Store parsed delegations in task metadata as `pending_delegations` list
3. Do NOT auto-create sub-tasks — let the human review first
4. When task is approved (status → approved/done), check for pending_delegations in metadata
5. For each pending delegation, call create_delegation() and dispatch the sub-task

### backend/app/routers/tasks.py

In the task status update endpoint (where status changes to approved/done):
- After status update, check task.metadata for `pending_delegations`
- If present, create and dispatch each delegation
- Add `sub_tasks_count` to task detail responses (count of tasks where parent_task_id = this task)
- Add `parent_task` info to task detail (title + id of parent if parent_task_id is set)

### backend/app/services/task_status.py

Add delegation_status transitions:
- When sub-task status → 'done': update delegation_status → 'completed', call complete_delegation()
- When sub-task status → 'cancelled': update delegation_status → 'failed'

### backend/app/main.py

- ALTER TABLE tasks ADD COLUMN statements for parent_task_id, delegation_status, delegated_by_agent_id
- CREATE INDEX for parent_task_id
- Register delegations router

---

## 4. Agent Prompt Injection

### backend/app/services/gateway.py — _build_task_prompt()

Add delegation instructions to the agent's prompt when building the task prompt. After skills and goal context, add:

```
## Delegation
If this task is too complex for you alone, you can delegate sub-tasks to other agents.
To delegate, include this marker in your response:
[DELEGATE: AgentName | Sub-task Title | Detailed description of what the agent should do]

Available agents you can delegate to:
- AgentName1 (Role) — specializes in X
- AgentName2 (Role) — specializes in Y

Rules:
- Only delegate if the task genuinely requires another specialist
- You can include multiple [DELEGATE:...] markers
- Your human reviewer will approve delegations before they execute
- Continue with your own part of the task in your response
```

Query available agents (same org, online, excluding self) and include their names + roles.

---

## 5. Frontend — New Components

### frontend/src/components/delegation-tree.tsx

Visual tree showing parent → sub-tasks hierarchy:
- Indented list with connecting lines (similar to goal tree)
- Each node shows: task title, assigned agent avatar+name, status badge, delegation_status badge
- Click navigates to task detail
- Max 3 levels deep

### frontend/src/components/delegation-badge.tsx

Small badge component for task cards:
- Shows on parent tasks: "3 sub-tasks" with branching icon (GitBranch from lucide)
- Shows on sub-tasks: "Delegated by AgentName" with arrow icon
- Color-coded: pending=amber, in_progress=blue, completed=green, failed=red

---

## 6. Frontend — Modified Files

### frontend/src/lib/api.ts

New types:
- `DelegationRequest` — target_agent_id, title, description, priority?, board_id?, tags?
- `DelegationTreeNode` — task: Task, sub_tasks: DelegationTreeNode[]

New methods:
- `createDelegation(taskId: string, data: DelegationRequest): Promise<Task>`
- `getSubTasks(taskId: string): Promise<Task[]>`
- `getDelegationTree(taskId: string): Promise<DelegationTreeNode>`

Updated Task type:
- Add parent_task_id, delegation_status, delegated_by_agent_id, delegated_by_agent_name, sub_tasks_count

### frontend/src/app/boards/[id]/page.tsx

On task cards (Kanban board):
- Show delegation-badge on tasks that have sub_tasks_count > 0 (parent tasks)
- Show delegation-badge on tasks that have parent_task_id (sub-tasks)
- In task detail modal: show "Sub-tasks" section with delegation-tree if sub_tasks_count > 0
- In task detail modal: show "Delegated by" info if parent_task_id is set with link to parent task

On task detail when viewing a task result that contains [DELEGATE:...] markers:
- Parse and display delegation requests in a styled box (not raw text)
- Show target agent name, sub-task title, description
- These become real sub-tasks when the task is approved

### frontend/src/app/tasks/[id]/traces/page.tsx

On the trace page, if the task has sub-tasks:
- Show delegation tree below the trace timeline
- Label: "Delegated Sub-tasks"

---

## 7. Delegation Display in Task Results

When rendering task results (the agent's output), parse [DELEGATE:...] markers and render them as styled cards instead of raw text:

```
┌─────────────────────────────────────────┐
│ 📋 Delegation Request                    │
│ To: Agent MarketingMaven                │
│ Task: "Write social media copy"         │
│ Description: Create 3 Instagram posts...│
│ Status: Pending approval                │
└─────────────────────────────────────────┘
```

After the parent task is approved, these cards update to show the actual created sub-tasks with links.

---

## 8. Safety & Limits

- **Max delegation depth: 3** — prevents infinite delegation chains
- **Max sub-tasks per parent: 5** — prevents task explosion
- **No self-delegation** — agent cannot delegate to itself
- **Human approval required** — delegations only execute after human approves parent task
- **Delegation requires admin review** — sub-tasks default to requires_approval=true
- **Budget check** — delegation respects the target agent's token budget
- **Offline agents** — delegation to offline agents is allowed but sub-task stays in 'todo' until agent comes online

---

## 9. Testing Checklist

1. Create a task, agent responds with [DELEGATE:...] marker → verify delegation cards render in result
2. Approve parent task → verify sub-tasks are created and assigned to correct agents
3. Sub-task completes → verify delegation_status updates, parent sees results
4. Test max depth (3 levels) → verify 4th level is rejected
5. Test max sub-tasks (5) → verify 6th delegation is rejected  
6. Test self-delegation → verify rejected
7. Test delegation to offline agent → verify sub-task created in 'todo'
8. Board view → verify delegation badges on parent and sub-task cards
9. Task detail → verify delegation tree renders
10. Delete parent task → verify sub-tasks have parent_task_id set to NULL (not cascaded)

---

## 10. End of Session

After implementing:
1. Update CODEBASE-CONTEXT.md:
   - Add parent_task_id, delegation_status, delegated_by_agent_id columns to tasks table in Section 3
   - Add delegation_service.py to Section 5
   - Add delegation components to Section 6b
   - Add "Agent-to-Agent Delegation" to Section 11 Recent Changes
2. `git add -A && git commit -m "feat: agent-to-agent delegation — sub-tasks, delegation tree, prompt injection" && git push`
