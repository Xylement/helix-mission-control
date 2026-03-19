"""
Workflow CRUD, steps, execution, and marketplace install endpoints.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.agent import Agent
from app.models.workflow import Workflow, WorkflowStep, WorkflowExecution, WorkflowStepExecution
from app.schemas.workflow import (
    WorkflowCreate, WorkflowUpdate, WorkflowResponse, WorkflowDetailResponse,
    WorkflowStepCreate, WorkflowStepUpdate, WorkflowStepResponse,
    ExecutionStart, ExecutionResponse, ExecutionListItem, StepExecutionResponse,
    WorkflowInstallRequest,
)
from app.services.workflow_engine import WorkflowEngine
from app.services.license_service import LicenseService

logger = logging.getLogger("helix.workflows")

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _get_org_id(user):
    return getattr(user, "org_id", None)


# ─── Helpers ───

async def _workflow_to_response(db: AsyncSession, wf: Workflow) -> dict:
    """Build WorkflowResponse dict from a Workflow model."""
    # Step count + agent count
    step_q = select(sqlfunc.count()).select_from(WorkflowStep).where(
        WorkflowStep.workflow_id == wf.id
    )
    step_count = (await db.execute(step_q)).scalar() or 0

    agent_q = select(sqlfunc.count(sqlfunc.distinct(WorkflowStep.agent_id))).where(
        WorkflowStep.workflow_id == wf.id,
        WorkflowStep.agent_id.isnot(None),
    )
    agent_count = (await db.execute(agent_q)).scalar() or 0

    # Last execution
    last_exec_q = select(WorkflowExecution).where(
        WorkflowExecution.workflow_id == wf.id
    ).order_by(WorkflowExecution.started_at.desc()).limit(1)
    last_exec_r = await db.execute(last_exec_q)
    last_exec = last_exec_r.scalar_one_or_none()
    last_execution = None
    if last_exec:
        last_execution = {
            "id": last_exec.id,
            "status": last_exec.status,
            "started_at": last_exec.started_at.isoformat() if last_exec.started_at else None,
        }

    return {
        "id": wf.id,
        "name": wf.name,
        "description": wf.description,
        "trigger_type": wf.trigger_type,
        "trigger_config": wf.trigger_config,
        "is_active": wf.is_active,
        "marketplace_template_slug": wf.marketplace_template_slug,
        "step_count": step_count,
        "agent_count": agent_count,
        "last_execution": last_execution,
        "created_by": wf.created_by,
        "created_at": wf.created_at,
        "updated_at": wf.updated_at,
    }


async def _step_to_response(db: AsyncSession, step: WorkflowStep) -> dict:
    agent_name = None
    if step.agent_id:
        agent = await db.get(Agent, step.agent_id)
        if agent:
            agent_name = agent.name
    return {
        "id": step.id,
        "step_id": step.step_id,
        "name": step.name,
        "agent_id": step.agent_id,
        "agent_name": agent_name,
        "agent_emoji": None,
        "action_prompt": step.action_prompt,
        "depends_on": step.depends_on or [],
        "timeout_minutes": step.timeout_minutes,
        "requires_approval": step.requires_approval,
        "step_order": step.step_order,
        "position_x": step.position_x,
        "position_y": step.position_y,
        "config": step.config,
    }


WORKFLOW_PLANS = {"pro", "scale", "enterprise", "managed_business", "managed_enterprise"}


async def _check_workflow_feature(db: AsyncSession):
    """Check if workflow_builder feature is available (by feature flag or plan tier)."""
    svc = LicenseService(db)
    plan_info = await svc.get_plan()
    plan = plan_info.get("plan", "")
    features = plan_info.get("limits", {}).get("features", [])
    # Allow if feature explicitly listed OR plan tier is Pro+
    if "workflow_builder" in features or plan in WORKFLOW_PLANS:
        return
    raise HTTPException(
        status_code=403,
        detail={
            "error": "feature_not_available",
            "feature": "workflow_builder",
            "required_plan": "pro",
        },
    )


# ─── CRUD ───

@router.get("", response_model=list[WorkflowResponse])
async def list_workflows(
    is_active: Optional[bool] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    q = select(Workflow).where(Workflow.org_id == org_id).order_by(Workflow.updated_at.desc())
    if is_active is not None:
        q = q.where(Workflow.is_active == is_active)
    result = await db.execute(q)
    workflows = result.scalars().all()
    return [await _workflow_to_response(db, wf) for wf in workflows]


@router.post("", response_model=WorkflowDetailResponse, status_code=201)
async def create_workflow(
    body: WorkflowCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_workflow_feature(db)
    org_id = _get_org_id(user)

    wf = Workflow(
        org_id=org_id,
        name=body.name,
        description=body.description,
        trigger_type=body.trigger_type,
        trigger_config=body.trigger_config,
        created_by=user.id,
    )
    db.add(wf)
    await db.flush()

    steps_data = []
    if body.steps:
        for s in body.steps:
            step = WorkflowStep(
                workflow_id=wf.id,
                step_id=s.step_id,
                name=s.name,
                agent_id=s.agent_id,
                action_prompt=s.action_prompt,
                depends_on=s.depends_on,
                timeout_minutes=s.timeout_minutes,
                requires_approval=s.requires_approval,
                step_order=s.step_order,
                position_x=s.position_x,
                position_y=s.position_y,
                config=s.config,
            )
            db.add(step)
            await db.flush()
            steps_data.append(await _step_to_response(db, step))

    await db.commit()
    resp = await _workflow_to_response(db, wf)
    resp["steps"] = steps_data
    return resp


@router.get("/{workflow_id}", response_model=WorkflowDetailResponse)
async def get_workflow(
    workflow_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    wf = await db.get(Workflow, workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    resp = await _workflow_to_response(db, wf)

    steps_q = select(WorkflowStep).where(
        WorkflowStep.workflow_id == workflow_id
    ).order_by(WorkflowStep.step_order)
    steps_r = await db.execute(steps_q)
    steps = steps_r.scalars().all()
    resp["steps"] = [await _step_to_response(db, s) for s in steps]
    return resp


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: int,
    body: WorkflowUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    wf = await db.get(Workflow, workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(wf, k, v)
    db.add(wf)
    await db.commit()
    return await _workflow_to_response(db, wf)


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(
    workflow_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    wf = await db.get(Workflow, workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Cancel running executions first
    running_q = select(WorkflowExecution).where(
        WorkflowExecution.workflow_id == workflow_id,
        WorkflowExecution.status.in_(["running", "paused"]),
    )
    running_r = await db.execute(running_q)
    engine = WorkflowEngine(db)
    for exe in running_r.scalars().all():
        try:
            await engine.cancel_execution(exe.id, org_id)
        except Exception:
            pass

    await db.delete(wf)
    await db.commit()


# ─── Steps ───

@router.get("/{workflow_id}/steps", response_model=list[WorkflowStepResponse])
async def list_steps(
    workflow_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    wf = await db.get(Workflow, workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    q = select(WorkflowStep).where(
        WorkflowStep.workflow_id == workflow_id
    ).order_by(WorkflowStep.step_order)
    result = await db.execute(q)
    return [await _step_to_response(db, s) for s in result.scalars().all()]


@router.post("/{workflow_id}/steps", response_model=WorkflowStepResponse, status_code=201)
async def add_step(
    workflow_id: int,
    body: WorkflowStepCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    wf = await db.get(Workflow, workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    step = WorkflowStep(
        workflow_id=workflow_id,
        step_id=body.step_id,
        name=body.name,
        agent_id=body.agent_id,
        action_prompt=body.action_prompt,
        depends_on=body.depends_on,
        timeout_minutes=body.timeout_minutes,
        requires_approval=body.requires_approval,
        step_order=body.step_order,
        position_x=body.position_x,
        position_y=body.position_y,
        config=body.config,
    )
    db.add(step)
    await db.commit()
    return await _step_to_response(db, step)


# Step-level endpoints use /workflow-steps/ prefix
step_router = APIRouter(prefix="/workflow-steps", tags=["workflows"])


@step_router.patch("/{step_id}", response_model=WorkflowStepResponse)
async def update_step(
    step_id: int,
    body: WorkflowStepUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    step = await db.get(WorkflowStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    wf = await db.get(Workflow, step.workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Step not found")

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(step, k, v)
    db.add(step)
    await db.commit()
    return await _step_to_response(db, step)


@step_router.delete("/{step_id}", status_code=204)
async def delete_step(
    step_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    step = await db.get(WorkflowStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    wf = await db.get(Workflow, step.workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Step not found")

    deleted_step_id = step.step_id

    # Remove from other steps' depends_on
    other_q = select(WorkflowStep).where(WorkflowStep.workflow_id == wf.id)
    other_r = await db.execute(other_q)
    for other in other_r.scalars().all():
        if other.depends_on and deleted_step_id in other.depends_on:
            other.depends_on = [d for d in other.depends_on if d != deleted_step_id]
            db.add(other)

    await db.delete(step)
    await db.commit()


@router.put("/{workflow_id}/steps/bulk", response_model=list[WorkflowStepResponse])
async def bulk_update_steps(
    workflow_id: int,
    body: list[WorkflowStepCreate],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace all steps atomically (visual builder save). Validates DAG before saving."""
    org_id = _get_org_id(user)
    wf = await db.get(Workflow, workflow_id)
    if not wf or wf.org_id != org_id:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Validate DAG
    engine = WorkflowEngine(db)
    # Build temporary step objects for validation
    class _TempStep:
        def __init__(self, s):
            self.step_id = s.step_id
            self.depends_on = s.depends_on
    try:
        engine._validate_dag([_TempStep(s) for s in body])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Delete existing steps
    existing_q = select(WorkflowStep).where(WorkflowStep.workflow_id == workflow_id)
    existing_r = await db.execute(existing_q)
    for old in existing_r.scalars().all():
        await db.delete(old)
    await db.flush()

    # Create new steps
    results = []
    for s in body:
        step = WorkflowStep(
            workflow_id=workflow_id,
            step_id=s.step_id,
            name=s.name,
            agent_id=s.agent_id,
            action_prompt=s.action_prompt,
            depends_on=s.depends_on,
            timeout_minutes=s.timeout_minutes,
            requires_approval=s.requires_approval,
            step_order=s.step_order,
            position_x=s.position_x,
            position_y=s.position_y,
            config=s.config,
        )
        db.add(step)
        await db.flush()
        results.append(step)

    await db.commit()
    return [await _step_to_response(db, s) for s in results]


# ─── Execution ───

@router.post("/{workflow_id}/execute", response_model=ExecutionResponse)
async def start_execution(
    workflow_id: int,
    body: ExecutionStart,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_workflow_feature(db)
    org_id = _get_org_id(user)
    engine = WorkflowEngine(db)
    try:
        execution = await engine.start_execution(workflow_id, body.input_data, user.id, org_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await _execution_to_response(db, execution)


@router.get("/{workflow_id}/executions", response_model=list[ExecutionListItem])
async def list_executions(
    workflow_id: int,
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    q = select(WorkflowExecution).where(
        WorkflowExecution.workflow_id == workflow_id,
        WorkflowExecution.org_id == org_id,
    ).order_by(WorkflowExecution.started_at.desc())
    if status:
        q = q.where(WorkflowExecution.status == status)
    result = await db.execute(q)
    items = []
    for exe in result.scalars().all():
        progress = await _get_progress(db, exe.id)
        items.append({
            "id": exe.id,
            "workflow_id": exe.workflow_id,
            "status": exe.status,
            "started_by": exe.started_by,
            "started_at": exe.started_at,
            "completed_at": exe.completed_at,
            "progress": progress,
        })
    return items


# Execution-level endpoints
exec_router = APIRouter(prefix="/workflow-executions", tags=["workflows"])


@exec_router.get("/{execution_id}", response_model=ExecutionResponse)
async def get_execution(
    execution_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    exe = await db.get(WorkflowExecution, execution_id)
    if not exe or exe.org_id != org_id:
        raise HTTPException(status_code=404, detail="Execution not found")
    return await _execution_to_response(db, exe)


@exec_router.post("/{execution_id}/cancel")
async def cancel_execution(
    execution_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    engine = WorkflowEngine(db)
    try:
        await engine.cancel_execution(execution_id, org_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@exec_router.post("/{execution_id}/retry", response_model=ExecutionResponse)
async def retry_execution(
    execution_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    engine = WorkflowEngine(db)
    try:
        new_exe = await engine.retry_execution(execution_id, org_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await _execution_to_response(db, new_exe)


# ─── Marketplace Install ───

@router.post("/install")
async def install_workflow_from_marketplace(
    body: WorkflowInstallRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_workflow_feature(db)
    org_id = _get_org_id(user)

    from app.services.workflow_install_service import WorkflowInstallService
    from app.services.marketplace_service import MarketplaceService

    license_svc = LicenseService(db)
    marketplace_svc = MarketplaceService(db, license_svc)
    install_svc = WorkflowInstallService(db, marketplace_svc, license_svc)

    try:
        result = await install_svc.install(org_id, user.id, body.template_slug, body.agent_mapping)
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


# ─── Execution Helpers ───

async def _get_progress(db: AsyncSession, execution_id: int) -> dict:
    se_q = select(WorkflowStepExecution).where(
        WorkflowStepExecution.execution_id == execution_id
    )
    se_r = await db.execute(se_q)
    all_se = se_r.scalars().all()
    total = len(all_se)
    completed = sum(1 for se in all_se if se.status in ("completed", "failed", "skipped"))
    return {"completed": completed, "total": total}


async def _execution_to_response(db: AsyncSession, exe: WorkflowExecution) -> dict:
    wf = await db.get(Workflow, exe.workflow_id)
    wf_name = wf.name if wf else None

    se_q = select(WorkflowStepExecution).where(
        WorkflowStepExecution.execution_id == exe.id
    )
    se_r = await db.execute(se_q)
    all_se = se_r.scalars().all()

    # Get step names
    steps_q = select(WorkflowStep).where(WorkflowStep.workflow_id == exe.workflow_id)
    steps_r = await db.execute(steps_q)
    step_names = {s.step_id: s.name for s in steps_r.scalars().all()}

    step_execs = []
    for se in all_se:
        step_execs.append({
            "id": se.id,
            "step_id": se.step_id,
            "step_name": step_names.get(se.step_id),
            "task_id": se.task_id,
            "status": se.status,
            "input_data": se.input_data,
            "output_data": se.output_data,
            "started_at": se.started_at,
            "completed_at": se.completed_at,
            "error_message": se.error_message,
        })

    total = len(all_se)
    completed = sum(1 for se in all_se if se.status in ("completed", "failed", "skipped"))

    return {
        "id": exe.id,
        "workflow_id": exe.workflow_id,
        "workflow_name": wf_name,
        "status": exe.status,
        "input_data": exe.input_data,
        "output_data": exe.output_data,
        "started_by": exe.started_by,
        "started_at": exe.started_at,
        "completed_at": exe.completed_at,
        "error_message": exe.error_message,
        "step_executions": step_execs,
        "progress": {"completed": completed, "total": total},
    }
