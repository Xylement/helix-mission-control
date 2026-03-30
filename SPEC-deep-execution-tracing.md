# SPEC: Deep Execution Tracing
## HELIX Mission Control — v1.3.0-staging
## Target: ~/helix-staging/ (staging branch)

---

## Read CODEBASE-CONTEXT.md first.

---

## Overview

Log every LLM reasoning step, tool call, and tool result during agent task execution. Provide a drill-down UI on the task detail so humans can see exactly what the agent did, why, and how much it cost.

---

## 1. Database — New Tables

### execution_traces

```sql
CREATE TABLE IF NOT EXISTS execution_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    trace_status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running | completed | failed | cancelled
    total_steps INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
    model_provider VARCHAR(50),
    model_name VARCHAR(100),
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_execution_traces_task_id ON execution_traces(task_id);
CREATE INDEX idx_execution_traces_agent_id ON execution_traces(agent_id);
CREATE INDEX idx_execution_traces_org_id ON execution_traces(org_id);
```

### execution_trace_steps

```sql
CREATE TABLE IF NOT EXISTS execution_trace_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id UUID NOT NULL REFERENCES execution_traces(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    step_type VARCHAR(30) NOT NULL,  -- reasoning | tool_call | tool_result | error | system
    content TEXT,                     -- reasoning text, tool call JSON, tool result, error message
    tool_name VARCHAR(200),           -- only for tool_call/tool_result steps
    tool_input JSONB,                 -- only for tool_call steps
    tool_output TEXT,                 -- only for tool_result steps (can be large)
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_trace_steps_trace_id ON execution_trace_steps(trace_id);
```

---

## 2. Backend — New Files

### backend/app/models/execution_trace.py

SQLAlchemy models for `execution_traces` and `execution_trace_steps`.

### backend/app/schemas/execution_trace.py

Pydantic schemas:
- `TraceOut` — trace summary (id, task_id, agent_id, status, totals, timestamps)
- `TraceStepOut` — individual step (id, step_number, step_type, content, tool_name, tool_input, tool_output, tokens, cost, duration)
- `TraceDetailOut` — trace + list of steps
- `TraceListOut` — list of traces for an agent (without steps)

### backend/app/services/trace_service.py

Functions:
- `create_trace(db, org_id, task_id, agent_id, model_provider, model_name) -> trace_id`
- `add_trace_step(db, trace_id, step_number, step_type, content, tool_name=None, tool_input=None, tool_output=None, input_tokens=0, output_tokens=0, cost=0, duration_ms=0)`
- `complete_trace(db, trace_id, status="completed", error_message=None)` — sets completed_at, duration_ms, sums totals from steps
- `get_trace(db, trace_id, org_id) -> TraceDetailOut` — trace + all steps ordered by step_number
- `get_traces_for_task(db, task_id, org_id) -> list[TraceOut]` — all traces for a task (no steps)
- `get_traces_for_agent(db, agent_id, org_id, limit=50) -> list[TraceOut]` — recent traces for an agent
- `get_trace_stats(db, org_id, days=30) -> dict` — aggregate stats (total traces, avg steps, avg cost, avg duration)

### backend/app/routers/traces.py

Endpoints:
- `GET /api/tasks/{task_id}/traces` — list traces for a task
- `GET /api/traces/{trace_id}` — trace detail with all steps
- `GET /api/agents/{agent_id}/traces?limit=50` — recent traces for an agent
- `GET /api/traces/stats?days=30` — org-wide trace statistics

All endpoints require auth + org_id scoping.

Register router in `main.py`.

---

## 3. Backend — Modified Files

### backend/app/services/gateway.py — dispatch_task()

This is the critical integration point. The gateway dispatches tasks to OpenClaw and receives streaming responses. Modify `dispatch_task()` to:

1. **Before dispatch:** Call `create_trace()` to start a new trace.

2. **During streaming response parsing:** The OpenClaw gateway returns structured messages via WebSocket. Parse each message and call `add_trace_step()`:
   - Message type `thinking` / `reasoning` → step_type = `reasoning`
   - Message type `tool_use` → step_type = `tool_call`, extract tool_name + tool_input
   - Message type `tool_result` → step_type = `tool_result`, extract tool_name + tool_output
   - Message type `text` (final response) → step_type = `reasoning` (final answer)
   - Message type `error` → step_type = `error`
   - Track step_number as incrementing counter

3. **After completion:** Call `complete_trace()` with final status.

4. **On error/timeout:** Call `complete_trace(status="failed", error_message=...)`.

**IMPORTANT:** Trace logging must NOT block or slow down the main dispatch flow. Use background commits — accumulate steps in memory, flush to DB in batches or after completion. If DB write fails, log the error but don't fail the task.

**Token tracking:** If OpenClaw returns token usage in its response messages, capture input_tokens/output_tokens per step. If not available per-step, capture totals at the end and assign to the final step.

### backend/app/main.py

- Add CREATE TABLE statements for execution_traces and execution_trace_steps (same pattern as other tables)
- Register traces router

### backend/app/routers/tasks.py

- Add `traces_count` to task detail response — count of execution_traces for the task
- This helps the frontend show a "View Trace" button only when traces exist

---

## 4. Frontend — New Files

### frontend/src/app/tasks/[id]/traces/page.tsx

**NOT a separate page** — instead, add a "Trace" tab or expandable section on the existing task detail view. But since tasks are viewed in modals/slide-overs on the board page, we need a dedicated trace viewer:

**Route: /tasks/{id}/traces**
- Fetches traces for the task
- If single trace: auto-expand it
- If multiple traces (retries): show list, click to expand
- Each trace shows:
  - Header: status badge, model, duration, total cost, total tokens
  - Timeline of steps (vertical timeline, similar to activity feed pattern)

### frontend/src/components/trace-viewer.tsx

The main trace visualization component:

```
TraceViewer
├── TraceHeader (status, model, duration, cost summary)
└── TraceTimeline
    ├── TraceStep (reasoning) — collapsible text block, brain icon
    ├── TraceStep (tool_call) — tool name badge, collapsible JSON input, wrench icon
    ├── TraceStep (tool_result) — tool name badge, collapsible output, check icon
    ├── TraceStep (error) — red error block, alert icon
    └── TraceStep (system) — gray system message
```

**Step rendering rules:**
- `reasoning` — Show full text, collapsible if > 500 chars. Icon: Brain
- `tool_call` — Show tool name as badge, input as collapsible JSON (syntax highlighted). Icon: Wrench
- `tool_result` — Show tool name, output as collapsible pre-formatted text (truncate at 2000 chars with "Show more"). Icon: CheckCircle
- `error` — Red background, full error text. Icon: AlertTriangle
- `system` — Gray muted text. Icon: Info

**Cost display per step:** Show token count and cost inline (muted, right-aligned).

**Colors:** Use existing shadcn/ui color tokens. Tool names get colored badges (similar to tag styling).

### frontend/src/components/trace-step.tsx

Individual step component with:
- Expand/collapse toggle
- Copy button for content
- Duration display
- Token/cost display

---

## 5. Frontend — Modified Files

### frontend/src/app/boards/[id]/page.tsx

In the task detail modal/slide-over:
- Add a "Trace" button (Activity icon or Footprints icon from lucide-react) next to the task status
- Only show when task has been executed (status is review/approved/done and traces_count > 0)
- Clicking opens /tasks/{id}/traces in a new tab OR shows an inline expandable section

### frontend/src/lib/api.ts

Add types and methods:
- `Trace` type (matches TraceOut)
- `TraceStep` type (matches TraceStepOut)
- `TraceDetail` type (matches TraceDetailOut)
- `getTaskTraces(taskId: string): Promise<Trace[]>`
- `getTraceDetail(traceId: string): Promise<TraceDetail>`
- `getAgentTraces(agentId: string, limit?: number): Promise<Trace[]>`
- `getTraceStats(days?: number): Promise<TraceStats>`

### frontend/src/app/agents/[id]/page.tsx

On the agent detail page, add a "Recent Traces" section or tab:
- Shows last 10 traces with task title, status, duration, cost
- Click to navigate to /tasks/{taskId}/traces

### frontend/src/app/costs/page.tsx

On the cost dashboard, link agent cost entries to their traces:
- Add a small "View traces" link next to agent cost rows

---

## 6. Layout

### frontend/src/app/tasks/[id]/traces/layout.tsx

Standard layout with Sidebar (same pattern as /costs, /schedules, /goals).

### frontend/src/components/sidebar.tsx

NO new sidebar entry needed — traces are accessed from task/agent detail, not top-level nav.

---

## 7. Migration Safety

- All new tables, no column changes to existing tables (except adding traces_count as a computed/joined field in the tasks query — NOT a real column)
- Trace logging is non-blocking — task execution continues even if trace DB writes fail
- Traces are soft-coupled — deleting a task cascades deletes its traces

---

## 8. Testing Checklist

1. Create a task, assign to agent, dispatch → verify trace is created
2. View trace on task detail → verify steps render correctly
3. Check cost dashboard still works → verify no regressions
4. Delete a task → verify traces cascade delete
5. View agent detail → verify recent traces section
6. Check trace with tool calls → verify tool_call and tool_result steps render
7. Check failed task → verify error step renders red
8. Verify trace logging doesn't slow down task dispatch

---

## 9. End of Session

After implementing:
1. Update CODEBASE-CONTEXT.md:
   - Add execution_traces and execution_trace_steps tables to Section 3
   - Add trace_service.py to Section 5
   - Add new frontend files to Section 6b
   - Add "Deep Execution Tracing" to Section 11 Recent Changes
2. `git add -A && git commit -m "feat: deep execution tracing — log LLM steps, drill-down UI" && git push`
