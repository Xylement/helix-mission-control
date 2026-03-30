# Claude Code Prompt — Agent-to-Agent Delegation

Read CODEBASE-CONTEXT.md first.
Then read SPEC-agent-delegation.md for the full feature specification.

Implement agent-to-agent delegation as specified. Work on the staging branch at ~/helix-staging/.

## Implementation Order

1. Database — ALTER TABLE tasks ADD parent_task_id, delegation_status, delegated_by_agent_id in main.py
2. Models — Update backend/app/models/task.py with new columns and relationships
3. Schemas — Update backend/app/schemas/task.py with new fields, add DelegationRequest schema
4. Delegation service — Create backend/app/services/delegation_service.py
5. Delegations router — Create backend/app/routers/delegations.py, register in main.py
6. Gateway prompt injection — Add delegation instructions and available agents list to _build_task_prompt() in gateway.py
7. Task result parsing — Parse [DELEGATE:...] markers from agent results, store as pending_delegations in task metadata
8. Task approval hook — When task approved, create and dispatch pending delegations
9. Task status hook — When sub-task reaches done/cancelled, update delegation_status
10. Task router updates — Add sub_tasks_count, parent task info to task responses
11. Frontend API — Add types and methods to api.ts
12. Delegation components — Create delegation-tree.tsx and delegation-badge.tsx
13. Board integration — Add badges to task cards, delegation tree to task detail, styled delegation cards in task results
14. Trace page — Show delegation tree if task has sub-tasks

## Key Constraints

- Staging only — ~/helix-staging/, staging branch
- Option A (marker-based) — NOT real-time tool calls. Agent writes [DELEGATE:...] in response, human approves, then sub-tasks execute.
- Max depth 3, max 5 sub-tasks per parent
- Human approval required — delegations only fire after parent task approved
- ON DELETE SET NULL for parent_task_id — don't cascade delete sub-tasks
- layout.tsx for any new route directories
- Non-blocking — delegation failures don't break parent task flow

## When Done

1. Update CODEBASE-CONTEXT.md (new columns Section 3, new service Section 5, new components Section 6b, recent changes Section 11)
2. git add -A && git commit -m "feat: agent-to-agent delegation — sub-tasks, delegation tree, prompt injection" && git push
