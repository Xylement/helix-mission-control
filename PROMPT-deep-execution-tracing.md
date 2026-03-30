# Claude Code Prompt — Deep Execution Tracing

Read CODEBASE-CONTEXT.md first.

Then read SPEC-deep-execution-tracing.md for the full feature specification.

Implement the deep execution tracing feature as specified. Work on the staging branch at ~/helix-staging/.

## Implementation Order

1. **Database tables** — Add CREATE TABLE for execution_traces and execution_trace_steps in main.py (same pattern as goals, agent_schedules)
2. **Models** — Create backend/app/models/execution_trace.py
3. **Schemas** — Create backend/app/schemas/execution_trace.py
4. **Service** — Create backend/app/services/trace_service.py
5. **Router** — Create backend/app/routers/traces.py, register in main.py
6. **Gateway integration** — Modify backend/app/services/gateway.py dispatch_task() to create traces and log steps during execution
7. **Task router** — Add traces_count to task detail queries in routers/tasks.py
8. **Frontend API** — Add types and methods to frontend/src/lib/api.ts
9. **Trace viewer components** — Create frontend/src/components/trace-viewer.tsx and trace-step.tsx
10. **Trace page** — Create frontend/src/app/tasks/[id]/traces/page.tsx and layout.tsx
11. **Board integration** — Add "View Trace" button to task detail on boards/[id]/page.tsx
12. **Agent detail** — Add recent traces section to agents/[id]/page.tsx
13. **Cost dashboard** — Add trace links to costs/page.tsx

## Key Constraints

- **Staging only** — all work on ~/helix-staging/, staging branch
- **ESLint** — no-unused-vars is "warn" not "error", but still clean up unused imports
- **Layout.tsx** — every new route directory needs layout.tsx with Sidebar
- **Non-blocking tracing** — trace DB writes must not block/fail task execution. Use try/except around all trace writes.
- **Org-scoped** — all trace queries must filter by org_id
- **CASCADE delete** — traces delete when task is deleted

## When Done

1. Update CODEBASE-CONTEXT.md (new tables in Section 3, new service in Section 5, new frontend files in Section 6b, new entry in Section 11)
2. `git add -A && git commit -m "feat: deep execution tracing — log LLM steps, drill-down UI" && git push`
