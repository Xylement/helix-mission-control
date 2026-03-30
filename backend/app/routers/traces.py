import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user
from app.schemas.execution_trace import TraceOut, TraceDetailOut, TraceStatsOut
from app.services import trace_service

logger = logging.getLogger("helix.traces")

router = APIRouter(tags=["traces"])


def _get_org_id(user):
    return getattr(user, "org_id", None)


@router.get("/tasks/{task_id}/traces", response_model=list[TraceOut])
async def get_task_traces(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    traces = await trace_service.get_traces_for_task(db, task_id, org_id)
    return [TraceOut.model_validate(t) for t in traces]


@router.get("/traces/{trace_id}", response_model=TraceDetailOut)
async def get_trace_detail(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    trace = await trace_service.get_trace(db, trace_id, org_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return TraceDetailOut.model_validate(trace)


@router.get("/agents/{agent_id}/traces", response_model=list[TraceOut])
async def get_agent_traces(
    agent_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    traces = await trace_service.get_traces_for_agent(db, agent_id, org_id, limit)
    return [TraceOut.model_validate(t) for t in traces]


@router.get("/traces/stats", response_model=TraceStatsOut)
async def get_trace_stats(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    stats = await trace_service.get_trace_stats(db, org_id, days)
    return TraceStatsOut(**stats)
