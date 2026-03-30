"""
Scheduled recurring tasks for agents.

Provides logic to calculate next run times, format task titles with date
variables, execute schedules (create + dispatch tasks), and a checker that
runs every 60 seconds from the background loop in main.py.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("helix.schedules")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _get_org_timezone(tz_name: str):
    """Return a ZoneInfo for the org timezone, falling back to UTC."""
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.utc


def format_task_title(template: str, now: datetime) -> str:
    """Replace {date}, {week}, {month}, {day} in a task title template."""
    return (
        template
        .replace("{date}", now.strftime("%b %d, %Y"))
        .replace("{week}", str(now.isocalendar()[1]))
        .replace("{month}", now.strftime("%B"))
        .replace("{day}", now.strftime("%A"))
    )


def calculate_next_run(
    schedule_type: str,
    schedule_time: str,
    schedule_days: list[str] | None,
    schedule_interval_minutes: int | None,
    last_run_at: datetime | None,
    tz_name: str = "Asia/Kuala_Lumpur",
) -> datetime:
    """Return the next run time as a UTC datetime."""
    from zoneinfo import ZoneInfo

    tz = _get_org_timezone(tz_name)
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(tz)

    if schedule_type == "interval":
        interval = max(schedule_interval_minutes or 15, 15)
        base = last_run_at or now_utc
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        nxt = base + timedelta(minutes=interval)
        if nxt <= now_utc:
            # Catch up: next interval from now
            nxt = now_utc + timedelta(minutes=interval)
        return nxt

    # Parse HH:MM
    try:
        hour, minute = int(schedule_time.split(":")[0]), int(schedule_time.split(":")[1])
    except (ValueError, IndexError):
        hour, minute = 9, 0

    if schedule_type == "daily":
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= now_local:
            candidate += timedelta(days=1)
        return candidate.astimezone(timezone.utc)

    if schedule_type == "weekly":
        days = [d.lower().strip() for d in (schedule_days or [])]
        if not days:
            days = WEEKDAY_NAMES[:5]  # default weekdays
        target_weekdays = sorted(
            [WEEKDAY_NAMES.index(d) for d in days if d in WEEKDAY_NAMES]
        )
        if not target_weekdays:
            target_weekdays = [0]  # monday fallback

        for offset in range(8):
            candidate = now_local + timedelta(days=offset)
            candidate = candidate.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if candidate.weekday() in target_weekdays and candidate > now_local:
                return candidate.astimezone(timezone.utc)
        # Fallback — next week first target day
        candidate = now_local + timedelta(days=7)
        candidate = candidate.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return candidate.astimezone(timezone.utc)

    if schedule_type == "monthly":
        day_numbers = []
        for d in (schedule_days or []):
            try:
                day_numbers.append(int(d))
            except ValueError:
                pass
        if not day_numbers:
            day_numbers = [1]
        day_numbers.sort()

        for month_offset in range(3):
            year = now_local.year
            month = now_local.month + month_offset
            if month > 12:
                year += (month - 1) // 12
                month = ((month - 1) % 12) + 1
            for day_num in day_numbers:
                try:
                    candidate = now_local.replace(
                        year=year, month=month, day=day_num,
                        hour=hour, minute=minute, second=0, microsecond=0,
                    )
                    if candidate > now_local:
                        return candidate.astimezone(timezone.utc)
                except ValueError:
                    continue  # invalid day for this month

        # Fallback
        candidate = now_local + timedelta(days=30)
        candidate = candidate.replace(hour=hour, minute=minute, second=0, microsecond=0)
        return candidate.astimezone(timezone.utc)

    # Unknown type — default to tomorrow 09:00
    candidate = now_local.replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=1)
    return candidate.astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Execute a single schedule
# ---------------------------------------------------------------------------

async def execute_schedule(db: AsyncSession, schedule: dict) -> int | None:
    """Create a task from a schedule and auto-dispatch it. Returns task ID."""
    from app.models.task import Task
    from app.models.agent import Agent
    from app.models.board import Board
    from app.models.department import Department
    from app.services.activity import log_activity
    from app.services.gateway import gateway
    from sqlalchemy import select

    now_utc = datetime.now(timezone.utc)

    # Get org timezone for formatting
    tz_name = "Asia/Kuala_Lumpur"
    tz_row = await db.execute(
        text("SELECT timezone FROM organization_settings WHERE org_id = :oid"),
        {"oid": schedule["org_id"]},
    )
    row = tz_row.fetchone()
    if row and row[0]:
        tz_name = row[0]

    tz = _get_org_timezone(tz_name)
    now_local = now_utc.astimezone(tz)
    title = format_task_title(schedule["task_title_template"], now_local)

    # Create task
    task = Task(
        board_id=schedule["board_id"],
        title=title,
        description=schedule["task_prompt"],
        status="todo",
        priority=schedule.get("priority", "medium"),
        assigned_agent_id=schedule["agent_id"],
        created_by_user_id=schedule["created_by"],
        requires_approval=schedule.get("requires_approval", True),
        tags=schedule.get("tags") or [],
        metadata_={
            "scheduled": True,
            "schedule_id": str(schedule["id"]),
            "schedule_name": schedule["name"],
        },
    )
    db.add(task)
    await db.flush()

    # Log activity
    board = (await db.execute(select(Board).where(Board.id == schedule["board_id"]))).scalar_one_or_none()
    agent = (await db.execute(select(Agent).where(Agent.id == schedule["agent_id"]))).scalar_one_or_none()

    meta = {
        "task_title": title,
        "trigger": "schedule",
        "schedule_name": schedule["name"],
        "actor_name": "Scheduler",
    }
    if board:
        meta["board_name"] = board.name
        meta["board_id"] = board.id
        dept = (await db.execute(select(Department).where(Department.id == board.department_id))).scalar_one_or_none()
        if dept:
            meta["department_id"] = dept.id
            meta["department_name"] = dept.name
    if agent:
        meta["agent_name"] = agent.name

    await log_activity(db, "system", None, "task.created", "task", task.id, meta, org_id=schedule["org_id"])

    # Update schedule tracking
    await db.execute(
        text("""
            UPDATE agent_schedules
            SET last_run_at = :now, run_count = run_count + 1,
                next_run_at = :next_run, retry_count = 0, updated_at = :now
            WHERE id = :sid
        """),
        {
            "now": now_utc,
            "next_run": calculate_next_run(
                schedule["schedule_type"],
                schedule["schedule_time"],
                schedule.get("schedule_days") or [],
                schedule.get("schedule_interval_minutes"),
                now_utc,
                tz_name,
            ),
            "sid": schedule["id"],
        },
    )

    await db.commit()

    # Auto-dispatch if agent is in auto mode
    if agent and agent.execution_mode == "auto" and gateway.is_connected:
        try:
            from sqlalchemy.orm import selectinload
            # Refresh task with relationships
            result = await db.execute(
                select(Task).options(selectinload(Task.assigned_agent), selectinload(Task.created_by)).where(Task.id == task.id)
            )
            task = result.scalar_one()

            task.status = "in_progress"
            agent.status = "busy"
            dispatch_meta = {**meta, "trigger": "schedule_auto"}
            await log_activity(db, "system", None, "task.dispatched", "task", task.id, dispatch_meta, org_id=schedule["org_id"])
            await db.commit()

            await gateway.dispatch_task(task, agent)
            logger.info("Schedule '%s': created and dispatched task %d to agent %s", schedule["name"], task.id, agent.name)
        except Exception as e:
            logger.warning("Schedule '%s': task %d created but dispatch failed: %s", schedule["name"], task.id, e)
            task.status = "todo"
            if agent:
                agent.status = "online"
            await db.commit()
    else:
        logger.info("Schedule '%s': created task %d (manual dispatch)", schedule["name"], task.id)

    return task.id


# ---------------------------------------------------------------------------
# Background checker — called every 60s from main.py
# ---------------------------------------------------------------------------

MAX_RETRIES = 3
RETRY_MINUTES = 5


async def check_and_run_due_schedules(db: AsyncSession):
    """Find all due schedules and execute them."""
    now_utc = datetime.now(timezone.utc)

    result = await db.execute(
        text("""
            SELECT s.*, a.status as agent_status, a.budget_paused as agent_budget_paused
            FROM agent_schedules s
            JOIN agents a ON s.agent_id = a.id
            WHERE s.is_active = true AND s.next_run_at <= :now
            ORDER BY s.next_run_at ASC
        """),
        {"now": now_utc},
    )
    rows = result.mappings().all()

    for row in rows:
        schedule = dict(row)

        # Skip if agent is in error state
        if schedule.get("agent_status") == "error":
            logger.warning("Schedule '%s': skipping — agent is in error state", schedule["name"])
            continue

        # Skip if agent is budget-paused
        if schedule.get("agent_budget_paused"):
            logger.warning("Schedule '%s': skipping — agent budget paused", schedule["name"])
            # Still advance next_run_at so we don't retry every minute
            tz_name = "Asia/Kuala_Lumpur"
            tz_row = await db.execute(
                text("SELECT timezone FROM organization_settings WHERE org_id = :oid"),
                {"oid": schedule["org_id"]},
            )
            tz_r = tz_row.fetchone()
            if tz_r and tz_r[0]:
                tz_name = tz_r[0]
            await db.execute(
                text("UPDATE agent_schedules SET next_run_at = :nxt, updated_at = :now WHERE id = :sid"),
                {
                    "nxt": calculate_next_run(
                        schedule["schedule_type"], schedule["schedule_time"],
                        schedule.get("schedule_days") or [], schedule.get("schedule_interval_minutes"),
                        now_utc, tz_name,
                    ),
                    "now": now_utc,
                    "sid": schedule["id"],
                },
            )
            await db.commit()
            continue

        try:
            await execute_schedule(db, schedule)
        except Exception as e:
            logger.error("Schedule '%s' execution failed: %s", schedule["name"], e)
            retry_count = schedule.get("retry_count", 0) or 0
            if retry_count < MAX_RETRIES:
                # Retry in 5 minutes
                await db.execute(
                    text("UPDATE agent_schedules SET next_run_at = :nxt, retry_count = :rc, updated_at = :now WHERE id = :sid"),
                    {
                        "nxt": now_utc + timedelta(minutes=RETRY_MINUTES),
                        "rc": retry_count + 1,
                        "now": now_utc,
                        "sid": schedule["id"],
                    },
                )
            else:
                # Max retries reached — skip to next normal run
                logger.error("Schedule '%s': max retries reached, skipping to next run", schedule["name"])
                tz_name = "Asia/Kuala_Lumpur"
                tz_row = await db.execute(
                    text("SELECT timezone FROM organization_settings WHERE org_id = :oid"),
                    {"oid": schedule["org_id"]},
                )
                tz_r = tz_row.fetchone()
                if tz_r and tz_r[0]:
                    tz_name = tz_r[0]
                await db.execute(
                    text("UPDATE agent_schedules SET next_run_at = :nxt, retry_count = 0, updated_at = :now WHERE id = :sid"),
                    {
                        "nxt": calculate_next_run(
                            schedule["schedule_type"], schedule["schedule_time"],
                            schedule.get("schedule_days") or [], schedule.get("schedule_interval_minutes"),
                            now_utc, tz_name,
                        ),
                        "now": now_utc,
                        "sid": schedule["id"],
                    },
                )
            await db.commit()
