"""
Workflow execution engine — resolves DAG dependencies, creates MC tasks per step,
advances workflow when tasks complete.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import Workflow, WorkflowStep, WorkflowExecution, WorkflowStepExecution
from app.models.task import Task
from app.models.agent import Agent

logger = logging.getLogger("helix.workflow_engine")


class WorkflowEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Start Execution ───

    async def start_execution(
        self, workflow_id: int, input_data: dict | None, started_by: int, org_id: int
    ) -> WorkflowExecution:
        workflow = await self.db.get(Workflow, workflow_id)
        if not workflow or workflow.org_id != org_id:
            raise ValueError("Workflow not found")
        if not workflow.is_active:
            raise ValueError("Workflow is not active")

        stmt = select(WorkflowStep).where(
            WorkflowStep.workflow_id == workflow_id
        ).order_by(WorkflowStep.step_order)
        result = await self.db.execute(stmt)
        steps = result.scalars().all()

        if not steps:
            raise ValueError("Workflow has no steps")

        self._validate_dag(steps)

        execution = WorkflowExecution(
            workflow_id=workflow_id,
            org_id=org_id,
            status="running",
            input_data=input_data or {},
            started_by=started_by,
        )
        self.db.add(execution)
        await self.db.flush()

        step_execs = {}
        for step in steps:
            se = WorkflowStepExecution(
                execution_id=execution.id,
                step_id=step.step_id,
                status="pending",
            )
            self.db.add(se)
            step_execs[step.step_id] = se

        await self.db.flush()

        root_steps = [s for s in steps if not s.depends_on or len(s.depends_on) == 0]
        for step in root_steps:
            await self._execute_step(execution, step, step_execs[step.step_id], input_data or {})

        await self.db.commit()
        return execution

    # ─── Execute Step ───

    async def _execute_step(
        self,
        execution: WorkflowExecution,
        step: WorkflowStep,
        step_exec: WorkflowStepExecution,
        initial_input: dict,
    ):
        """Create MC task for this step."""
        gathered = {}
        if step.depends_on:
            for dep_id in step.depends_on:
                dep_stmt = select(WorkflowStepExecution).where(
                    WorkflowStepExecution.execution_id == execution.id,
                    WorkflowStepExecution.step_id == dep_id,
                )
                dep_r = await self.db.execute(dep_stmt)
                dep_se = dep_r.scalar_one_or_none()
                if dep_se and dep_se.output_data:
                    gathered[dep_id] = dep_se.output_data
        else:
            gathered["user_input"] = initial_input

        step_exec.input_data = gathered
        step_exec.started_at = datetime.now(timezone.utc)

        # Build description
        parts = []
        if step.action_prompt:
            parts.append(step.action_prompt)
        if gathered:
            parts.append("\n\n---\n**Input from previous steps:**")
            for key, val in gathered.items():
                summary = val.get("summary", str(val))[:500] if isinstance(val, dict) else str(val)[:500]
                parts.append(f"\n**{key}:** {summary}")

        # Task status
        if step.requires_approval and not step.agent_id:
            task_status = "todo"
            step_exec.status = "waiting_approval"
        else:
            task_status = "todo"
            step_exec.status = "running"

        # Get board from agent
        board_id = None
        if step.agent_id:
            agent = await self.db.get(Agent, step.agent_id)
            if agent:
                board_id = agent.primary_board_id

        if not board_id:
            # Fallback: get any board in the org
            from app.models.board import Board
            from app.models.department import Department
            fallback = await self.db.execute(
                select(Board).join(Department).where(Department.org_id == execution.org_id).limit(1)
            )
            fb = fallback.scalar_one_or_none()
            if fb:
                board_id = fb.id

        if not board_id:
            raise ValueError("No board available for workflow task")

        task = Task(
            title=f"[Workflow] {step.name}",
            description="\n".join(parts),
            status=task_status,
            priority="medium",
            assigned_agent_id=step.agent_id,
            board_id=board_id,
            created_by_user_id=execution.started_by,
            metadata_={
                "workflow_execution_id": execution.id,
                "workflow_step_id": step.step_id,
            },
        )
        self.db.add(task)
        await self.db.flush()

        step_exec.task_id = task.id
        self.db.add(step_exec)

        logger.info(
            "Workflow step '%s' started — task #%d created (exec=%d)",
            step.step_id, task.id, execution.id,
        )

    # ─── Task Completion Hook ───

    async def on_task_completed(self, task_id: int) -> bool:
        """Called when any MC task completes. Returns True if it was a workflow task."""
        stmt = select(WorkflowStepExecution).where(WorkflowStepExecution.task_id == task_id)
        result = await self.db.execute(stmt)
        step_exec = result.scalar_one_or_none()

        if not step_exec:
            return False
        if step_exec.status in ("completed", "failed", "skipped"):
            return True

        execution = await self.db.get(WorkflowExecution, step_exec.execution_id)
        if not execution or execution.status != "running":
            return True

        task = await self.db.get(Task, task_id)

        step_exec.status = "completed"
        step_exec.completed_at = datetime.now(timezone.utc)
        step_exec.output_data = {
            "task_id": task_id,
            "summary": task.description[:500] if task and task.description else "",
            "result": task.result if task and hasattr(task, "result") else None,
        }
        self.db.add(step_exec)

        await self._advance_execution(execution)
        await self.db.commit()
        return True

    async def on_task_approved(self, task_id: int) -> bool:
        """For approval steps — approving means step is done."""
        return await self.on_task_completed(task_id)

    # ─── Advance Execution ───

    async def _advance_execution(self, execution: WorkflowExecution):
        """Find steps that can now run. If all done, mark execution complete."""
        steps_stmt = select(WorkflowStep).where(WorkflowStep.workflow_id == execution.workflow_id)
        steps_r = await self.db.execute(steps_stmt)
        all_steps = steps_r.scalars().all()

        se_stmt = select(WorkflowStepExecution).where(
            WorkflowStepExecution.execution_id == execution.id
        )
        se_r = await self.db.execute(se_stmt)
        all_se = {se.step_id: se for se in se_r.scalars().all()}

        for step in all_steps:
            se = all_se.get(step.step_id)
            if not se or se.status != "pending":
                continue
            if step.depends_on:
                all_deps_done = all(
                    all_se.get(d) and all_se[d].status == "completed"
                    for d in step.depends_on
                )
                if not all_deps_done:
                    continue
            await self._execute_step(execution, step, se, execution.input_data or {})

        # Check completion
        terminal = {"completed", "failed", "skipped"}
        if all(se.status in terminal for se in all_se.values()):
            output = {sid: se.output_data for sid, se in all_se.items() if se.output_data}
            any_failed = any(se.status == "failed" for se in all_se.values())
            execution.status = "failed" if any_failed else "completed"
            execution.completed_at = datetime.now(timezone.utc)
            execution.output_data = output
            if any_failed:
                failed = [sid for sid, se in all_se.items() if se.status == "failed"]
                execution.error_message = f"Steps failed: {', '.join(failed)}"
            self.db.add(execution)
            logger.info("Workflow execution %d %s", execution.id, execution.status)

    # ─── Cancel ───

    async def cancel_execution(self, execution_id: int, org_id: int) -> WorkflowExecution:
        execution = await self.db.get(WorkflowExecution, execution_id)
        if not execution or execution.org_id != org_id:
            raise ValueError("Execution not found")
        if execution.status not in ("running", "paused"):
            raise ValueError(f"Cannot cancel execution in '{execution.status}' state")

        se_stmt = select(WorkflowStepExecution).where(
            WorkflowStepExecution.execution_id == execution_id
        )
        se_r = await self.db.execute(se_stmt)
        for se in se_r.scalars().all():
            if se.status in ("pending", "running", "waiting_approval"):
                se.status = "skipped"
                se.completed_at = datetime.now(timezone.utc)
                se.error_message = "Cancelled by user"
                self.db.add(se)

        execution.status = "cancelled"
        execution.completed_at = datetime.now(timezone.utc)
        self.db.add(execution)
        await self.db.commit()
        return execution

    # ─── Retry ───

    async def retry_execution(
        self, execution_id: int, org_id: int, user_id: int
    ) -> WorkflowExecution:
        old = await self.db.get(WorkflowExecution, execution_id)
        if not old or old.org_id != org_id:
            raise ValueError("Execution not found")
        if old.status != "failed":
            raise ValueError("Can only retry failed executions")
        return await self.start_execution(old.workflow_id, old.input_data, user_id, org_id)

    # ─── DAG Validation ───

    def _validate_dag(self, steps: list):
        step_ids = {s.step_id for s in steps}
        visited, in_stack = set(), set()

        def has_cycle(sid):
            if sid in in_stack:
                return True
            if sid in visited:
                return False
            visited.add(sid)
            in_stack.add(sid)
            step = next((s for s in steps if s.step_id == sid), None)
            if step and step.depends_on:
                for dep in step.depends_on:
                    if dep not in step_ids:
                        raise ValueError(f"Step '{sid}' depends on unknown step '{dep}'")
                    if has_cycle(dep):
                        return True
            in_stack.discard(sid)
            return False

        for s in steps:
            if has_cycle(s.step_id):
                raise ValueError(f"Circular dependency detected involving step '{s.step_id}'")
