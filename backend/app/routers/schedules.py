"""Agent schedule CRUD endpoints — admin-only for mutations, org-scoped."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user, require_admin
from app.models.user import User
from app.services.schedule_service import calculate_next_run, execute_schedule

logger = logging.getLogger("helix.schedules")

router = APIRouter(tags=["schedules"])


def _get_org_id(user) -> int:
    return getattr(user, "org_id", None)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ScheduleCreate(BaseModel):
    name: str = Field(max_length=200)
    description: str | None = None
    board_id: int
    task_title_template: str = Field(max_length=500)
    task_prompt: str
    schedule_type: str = "daily"
    schedule_time: str = "09:00"
    schedule_days: list[str] = []
    schedule_interval_minutes: int | None = None
    requires_approval: bool = True
    priority: str = "medium"
    tags: list[str] = []


class ScheduleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    board_id: int | None = None
    task_title_template: str | None = None
    task_prompt: str | None = None
    schedule_type: str | None = None
    schedule_time: str | None = None
    schedule_days: list[str] | None = None
    schedule_interval_minutes: int | None = None
    requires_approval: bool | None = None
    priority: str | None = None
    tags: list[str] | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    return {
        "id": str(row.id),
        "org_id": row.org_id,
        "agent_id": row.agent_id,
        "board_id": row.board_id,
        "name": row.name,
        "description": row.description,
        "task_title_template": row.task_title_template,
        "task_prompt": row.task_prompt,
        "schedule_type": row.schedule_type,
        "schedule_time": row.schedule_time,
        "schedule_days": row.schedule_days or [],
        "schedule_interval_minutes": row.schedule_interval_minutes,
        "is_active": row.is_active,
        "requires_approval": row.requires_approval,
        "priority": row.priority,
        "tags": row.tags or [],
        "last_run_at": row.last_run_at.isoformat() if row.last_run_at else None,
        "next_run_at": row.next_run_at.isoformat() if row.next_run_at else None,
        "run_count": row.run_count or 0,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _validate_schedule(body):
    """Validate schedule fields."""
    valid_types = {"daily", "weekly", "monthly", "interval"}
    stype = getattr(body, "schedule_type", None) or "daily"
    if stype not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid schedule_type. Must be one of: {', '.join(valid_types)}")

    stime = getattr(body, "schedule_time", None) or "09:00"
    try:
        parts = stime.split(":")
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="schedule_time must be HH:MM in 24h format")

    if stype == "interval":
        interval = getattr(body, "schedule_interval_minutes", None)
        if not interval or interval < 15:
            raise HTTPException(status_code=400, detail="Minimum interval is 15 minutes")

    priority = getattr(body, "priority", "medium")
    if priority and priority not in {"low", "medium", "high", "urgent"}:
        raise HTTPException(status_code=400, detail="Invalid priority")


async def _get_org_tz(db: AsyncSession, org_id: int) -> str:
    r = await db.execute(
        text("SELECT timezone FROM organization_settings WHERE org_id = :oid"),
        {"oid": org_id},
    )
    row = r.fetchone()
    return (row[0] if row and row[0] else "Asia/Kuala_Lumpur")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/agents/{agent_id}/schedules")
async def list_agent_schedules(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    org_id = _get_org_id(user)
    # Verify agent belongs to org
    agent = await db.execute(
        text("SELECT id FROM agents WHERE id = :aid AND org_id = :oid"),
        {"aid": agent_id, "oid": org_id},
    )
    if not agent.fetchone():
        raise HTTPException(status_code=404, detail="Agent not found")

    result = await db.execute(
        text("""
            SELECT * FROM agent_schedules
            WHERE agent_id = :aid AND org_id = :oid
            ORDER BY created_at DESC
        """),
        {"aid": agent_id, "oid": org_id},
    )
    return [_row_to_dict(r) for r in result.fetchall()]


@router.post("/agents/{agent_id}/schedules", status_code=201)
async def create_schedule(
    agent_id: int,
    body: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    org_id = _get_org_id(user)

    # Verify agent exists in org
    agent = await db.execute(
        text("SELECT id FROM agents WHERE id = :aid AND org_id = :oid"),
        {"aid": agent_id, "oid": org_id},
    )
    if not agent.fetchone():
        raise HTTPException(status_code=404, detail="Agent not found")

    # Verify board exists in org
    board = await db.execute(
        text("""
            SELECT b.id FROM boards b
            JOIN departments d ON b.department_id = d.id
            WHERE b.id = :bid AND d.org_id = :oid
        """),
        {"bid": body.board_id, "oid": org_id},
    )
    if not board.fetchone():
        raise HTTPException(status_code=404, detail="Board not found")

    _validate_schedule(body)

    tz_name = await _get_org_tz(db, org_id)
    next_run = calculate_next_run(
        body.schedule_type, body.schedule_time, body.schedule_days,
        body.schedule_interval_minutes, None, tz_name,
    )

    now = datetime.now(timezone.utc)
    result = await db.execute(
        text("""
            INSERT INTO agent_schedules
                (org_id, agent_id, board_id, name, description,
                 task_title_template, task_prompt, schedule_type, schedule_time,
                 schedule_days, schedule_interval_minutes, is_active,
                 requires_approval, priority, tags, next_run_at,
                 created_by, created_at, updated_at)
            VALUES
                (:org_id, :agent_id, :board_id, :name, :description,
                 :task_title_template, :task_prompt, :schedule_type, :schedule_time,
                 :schedule_days, :schedule_interval_minutes, true,
                 :requires_approval, :priority, :tags, :next_run_at,
                 :created_by, :now, :now)
            RETURNING *
        """),
        {
            "org_id": org_id,
            "agent_id": agent_id,
            "board_id": body.board_id,
            "name": body.name,
            "description": body.description,
            "task_title_template": body.task_title_template,
            "task_prompt": body.task_prompt,
            "schedule_type": body.schedule_type,
            "schedule_time": body.schedule_time,
            "schedule_days": body.schedule_days or [],
            "schedule_interval_minutes": body.schedule_interval_minutes,
            "requires_approval": body.requires_approval,
            "priority": body.priority,
            "tags": body.tags or [],
            "next_run_at": next_run,
            "created_by": user.id,
            "now": now,
        },
    )
    row = result.fetchone()
    await db.commit()
    return _row_to_dict(row)


@router.put("/agents/{agent_id}/schedules/{schedule_id}")
async def update_schedule(
    agent_id: int,
    schedule_id: str,
    body: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    org_id = _get_org_id(user)

    # Fetch existing
    existing = await db.execute(
        text("SELECT * FROM agent_schedules WHERE id = :sid AND agent_id = :aid AND org_id = :oid"),
        {"sid": schedule_id, "aid": agent_id, "oid": org_id},
    )
    row = existing.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return _row_to_dict(row)

    _validate_schedule(body)

    # If board changed, verify new board
    if "board_id" in updates:
        board = await db.execute(
            text("SELECT b.id FROM boards b JOIN departments d ON b.department_id = d.id WHERE b.id = :bid AND d.org_id = :oid"),
            {"bid": updates["board_id"], "oid": org_id},
        )
        if not board.fetchone():
            raise HTTPException(status_code=404, detail="Board not found")

    # Build SET clause
    set_parts = []
    params = {"sid": schedule_id}
    for key, value in updates.items():
        set_parts.append(f"{key} = :{key}")
        params[key] = value

    set_parts.append("updated_at = :now")
    params["now"] = datetime.now(timezone.utc)

    await db.execute(
        text(f"UPDATE agent_schedules SET {', '.join(set_parts)} WHERE id = :sid"),
        params,
    )

    # Recalculate next_run_at
    stype = updates.get("schedule_type", row.schedule_type)
    stime = updates.get("schedule_time", row.schedule_time)
    sdays = updates.get("schedule_days", row.schedule_days)
    sint = updates.get("schedule_interval_minutes", row.schedule_interval_minutes)
    tz_name = await _get_org_tz(db, org_id)

    next_run = calculate_next_run(stype, stime, sdays, sint, row.last_run_at, tz_name)
    await db.execute(
        text("UPDATE agent_schedules SET next_run_at = :nxt WHERE id = :sid"),
        {"nxt": next_run, "sid": schedule_id},
    )

    result = await db.execute(
        text("SELECT * FROM agent_schedules WHERE id = :sid"),
        {"sid": schedule_id},
    )
    updated = result.fetchone()
    await db.commit()
    return _row_to_dict(updated)


@router.delete("/agents/{agent_id}/schedules/{schedule_id}", status_code=204)
async def delete_schedule(
    agent_id: int,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    org_id = _get_org_id(user)
    result = await db.execute(
        text("DELETE FROM agent_schedules WHERE id = :sid AND agent_id = :aid AND org_id = :oid RETURNING id"),
        {"sid": schedule_id, "aid": agent_id, "oid": org_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.commit()


@router.post("/agents/{agent_id}/schedules/{schedule_id}/toggle")
async def toggle_schedule(
    agent_id: int,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    org_id = _get_org_id(user)

    existing = await db.execute(
        text("SELECT * FROM agent_schedules WHERE id = :sid AND agent_id = :aid AND org_id = :oid"),
        {"sid": schedule_id, "aid": agent_id, "oid": org_id},
    )
    row = existing.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")

    new_active = not row.is_active
    now = datetime.now(timezone.utc)

    if new_active:
        tz_name = await _get_org_tz(db, org_id)
        next_run = calculate_next_run(
            row.schedule_type, row.schedule_time, row.schedule_days,
            row.schedule_interval_minutes, row.last_run_at, tz_name,
        )
        await db.execute(
            text("UPDATE agent_schedules SET is_active = true, next_run_at = :nxt, updated_at = :now WHERE id = :sid"),
            {"nxt": next_run, "now": now, "sid": schedule_id},
        )
    else:
        await db.execute(
            text("UPDATE agent_schedules SET is_active = false, updated_at = :now WHERE id = :sid"),
            {"now": now, "sid": schedule_id},
        )

    result = await db.execute(
        text("SELECT * FROM agent_schedules WHERE id = :sid"),
        {"sid": schedule_id},
    )
    updated = result.fetchone()
    await db.commit()
    return _row_to_dict(updated)


@router.post("/agents/{agent_id}/schedules/{schedule_id}/run-now")
async def run_schedule_now(
    agent_id: int,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    org_id = _get_org_id(user)

    result = await db.execute(
        text("SELECT * FROM agent_schedules WHERE id = :sid AND agent_id = :aid AND org_id = :oid"),
        {"sid": schedule_id, "aid": agent_id, "oid": org_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")

    schedule = dict(row._mapping)
    try:
        task_id = await execute_schedule(db, schedule)
        return {"task_id": task_id, "message": "Schedule executed successfully"}
    except Exception as e:
        logger.error("Manual run failed for schedule %s: %s", schedule_id, e)
        raise HTTPException(status_code=500, detail=f"Schedule execution failed: {str(e)}")


@router.get("/schedules")
async def list_all_schedules(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    org_id = _get_org_id(user)

    result = await db.execute(
        text("""
            SELECT s.*, a.name as agent_name, a.status as agent_status
            FROM agent_schedules s
            JOIN agents a ON s.agent_id = a.id
            WHERE s.org_id = :oid
            ORDER BY s.next_run_at ASC NULLS LAST
        """),
        {"oid": org_id},
    )
    rows = result.fetchall()

    schedules = []
    for r in rows:
        d = _row_to_dict(r)
        d["agent_name"] = r.agent_name
        d["agent_status"] = r.agent_status
        schedules.append(d)

    return schedules
