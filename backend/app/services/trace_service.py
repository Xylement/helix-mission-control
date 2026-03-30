import logging
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.execution_trace import ExecutionTrace, ExecutionTraceStep

logger = logging.getLogger("helix.traces")


async def create_trace(
    db: AsyncSession,
    org_id: int,
    task_id: int,
    agent_id: int,
    model_provider: str | None = None,
    model_name: str | None = None,
) -> str:
    trace = ExecutionTrace(
        org_id=org_id,
        task_id=task_id,
        agent_id=agent_id,
        model_provider=model_provider,
        model_name=model_name,
        trace_status="running",
    )
    db.add(trace)
    await db.flush()
    return trace.id


async def add_trace_step(
    db: AsyncSession,
    trace_id: str,
    step_number: int,
    step_type: str,
    content: str | None = None,
    tool_name: str | None = None,
    tool_input: dict | None = None,
    tool_output: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost: float = 0,
    duration_ms: int = 0,
):
    step = ExecutionTraceStep(
        trace_id=trace_id,
        step_number=step_number,
        step_type=step_type,
        content=content,
        tool_name=tool_name,
        tool_input=tool_input,
        tool_output=tool_output,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost_usd=cost,
        duration_ms=duration_ms,
    )
    db.add(step)
    await db.flush()


async def complete_trace(
    db: AsyncSession,
    trace_id: str,
    status: str = "completed",
    error_message: str | None = None,
):
    trace = (await db.execute(
        select(ExecutionTrace).where(ExecutionTrace.id == trace_id)
    )).scalar_one_or_none()
    if not trace:
        return

    trace.trace_status = status
    trace.error_message = error_message
    trace.completed_at = datetime.now(timezone.utc)

    if trace.started_at:
        delta = trace.completed_at - trace.started_at
        trace.duration_ms = int(delta.total_seconds() * 1000)

    # Sum totals from steps
    result = await db.execute(
        select(
            func.count(ExecutionTraceStep.id),
            func.coalesce(func.sum(ExecutionTraceStep.input_tokens), 0),
            func.coalesce(func.sum(ExecutionTraceStep.output_tokens), 0),
            func.coalesce(func.sum(ExecutionTraceStep.estimated_cost_usd), 0),
        ).where(ExecutionTraceStep.trace_id == trace_id)
    )
    row = result.one()
    trace.total_steps = row[0]
    trace.total_input_tokens = row[1]
    trace.total_output_tokens = row[2]
    trace.total_estimated_cost_usd = float(row[3])

    await db.flush()


async def get_trace(db: AsyncSession, trace_id: str, org_id: int):
    result = await db.execute(
        select(ExecutionTrace)
        .options(selectinload(ExecutionTrace.steps))
        .where(ExecutionTrace.id == trace_id, ExecutionTrace.org_id == org_id)
    )
    return result.scalar_one_or_none()


async def get_traces_for_task(db: AsyncSession, task_id: int, org_id: int):
    result = await db.execute(
        select(ExecutionTrace)
        .where(ExecutionTrace.task_id == task_id, ExecutionTrace.org_id == org_id)
        .order_by(ExecutionTrace.created_at.desc())
    )
    return result.scalars().all()


async def get_traces_for_agent(db: AsyncSession, agent_id: int, org_id: int, limit: int = 50):
    result = await db.execute(
        select(ExecutionTrace)
        .where(ExecutionTrace.agent_id == agent_id, ExecutionTrace.org_id == org_id)
        .order_by(ExecutionTrace.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def get_trace_stats(db: AsyncSession, org_id: int, days: int = 30):
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.count(ExecutionTrace.id),
            func.coalesce(func.avg(ExecutionTrace.total_steps), 0),
            func.coalesce(func.avg(ExecutionTrace.total_estimated_cost_usd), 0),
            func.coalesce(func.avg(ExecutionTrace.duration_ms), 0),
        ).where(
            ExecutionTrace.org_id == org_id,
            ExecutionTrace.created_at >= since,
        )
    )
    row = result.one()
    return {
        "total_traces": row[0],
        "avg_steps": float(row[1]),
        "avg_cost_usd": float(row[2]),
        "avg_duration_ms": float(row[3]),
    }


async def get_traces_count_for_task(db: AsyncSession, task_id: int, org_id: int) -> int:
    result = await db.execute(
        select(func.count(ExecutionTrace.id))
        .where(ExecutionTrace.task_id == task_id, ExecutionTrace.org_id == org_id)
    )
    return result.scalar() or 0
