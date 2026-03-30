"""Agent token budget enforcement service."""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent

logger = logging.getLogger("helix.budget")

# Approximate cost per 1M tokens by provider (input/output)
# Used when estimated_cost_usd is not available on token_usage rows
MODEL_COSTS_PER_1M = {
    "moonshot": {"input": 0.60, "output": 2.40},
    "openai": {"input": 3.00, "output": 15.00},
    "anthropic": {"input": 3.00, "output": 15.00},
    "nvidia": {"input": 0.50, "output": 1.50},
    "kimi_code": {"input": 0.60, "output": 2.40},
    "custom": {"input": 1.00, "output": 3.00},
}
DEFAULT_COST = {"input": 1.00, "output": 3.00}


class BudgetExceededError(Exception):
    """Raised when an agent's token budget has been exceeded."""
    pass


def estimate_cost(input_tokens: int, output_tokens: int, model_provider: str) -> float:
    """Estimate cost in USD for a token usage record."""
    costs = MODEL_COSTS_PER_1M.get(model_provider, DEFAULT_COST)
    return (input_tokens * costs["input"] + output_tokens * costs["output"]) / 1_000_000


def _get_period_start(reset_day: int, now: datetime) -> datetime:
    """Calculate the start of the current billing period based on reset_day."""
    reset_day = max(1, min(28, reset_day))
    if now.day >= reset_day:
        period_start = now.replace(day=reset_day, hour=0, minute=0, second=0, microsecond=0)
    else:
        # Go to previous month
        if now.month == 1:
            period_start = now.replace(year=now.year - 1, month=12, day=reset_day,
                                       hour=0, minute=0, second=0, microsecond=0)
        else:
            period_start = now.replace(month=now.month - 1, day=reset_day,
                                       hour=0, minute=0, second=0, microsecond=0)
    return period_start


async def get_agent_spend_this_period(db: AsyncSession, agent_id: int, reset_day: int = 1) -> float:
    """Get total estimated spend for an agent in the current billing period."""
    now = datetime.now(timezone.utc)
    period_start = _get_period_start(reset_day, now)

    result = await db.execute(text("""
        SELECT COALESCE(SUM(
            CASE WHEN estimated_cost_usd IS NOT NULL THEN estimated_cost_usd
            ELSE (input_tokens * 1.0 + output_tokens * 3.0) / 1000000.0
            END
        ), 0) as total_cost
        FROM token_usage
        WHERE agent_id = :agent_id AND created_at >= :period_start
    """), {"agent_id": agent_id, "period_start": period_start})
    row = result.first()
    return float(row.total_cost) if row else 0.0


async def check_budget(db: AsyncSession, agent_id: int) -> dict:
    """Check an agent's budget status. Returns budget info dict."""
    agent = (await db.execute(
        select(Agent).where(Agent.id == agent_id)
    )).scalar_one_or_none()
    if not agent:
        return {"allowed": False, "error": "Agent not found"}

    budget = agent.monthly_budget_usd
    if budget is None:
        return {
            "allowed": True,
            "unlimited": True,
            "budget_usd": None,
            "spent_usd": 0.0,
            "remaining_usd": 0.0,
            "percentage": 0.0,
            "warning": False,
            "exceeded": False,
        }

    budget = float(budget)
    reset_day = agent.budget_reset_day or 1
    warning_threshold = float(agent.budget_warning_threshold or Decimal("0.80"))
    spent = await get_agent_spend_this_period(db, agent_id, reset_day)
    percentage = min(100.0, (spent / budget * 100)) if budget > 0 else 0.0

    return {
        "allowed": spent < budget,
        "unlimited": False,
        "budget_usd": budget,
        "spent_usd": round(spent, 4),
        "remaining_usd": round(max(0, budget - spent), 4),
        "percentage": round(percentage, 1),
        "warning": percentage >= warning_threshold * 100,
        "exceeded": spent >= budget,
    }


async def pause_agent_for_budget(db: AsyncSession, agent_id: int, reason: str):
    """Pause an agent due to budget exceeded."""
    agent = (await db.execute(
        select(Agent).where(Agent.id == agent_id)
    )).scalar_one_or_none()
    if not agent:
        return

    agent.budget_paused = True
    agent.budget_pause_reason = reason
    agent.status = "offline"

    # Log activity
    from app.services.activity import log_activity
    await log_activity(
        db, "system", None, "agent.budget_paused", "agent", agent.id,
        {"agent_name": agent.name, "reason": reason},
        org_id=agent.org_id,
    )

    # Notify all admin users in org
    from app.models.user import User
    from app.services.notifications import create_notification
    admins = (await db.execute(
        select(User).where(User.org_id == agent.org_id, User.role == "admin")
    )).scalars().all()
    for admin in admins:
        await create_notification(
            db, admin.id, "agent_budget_exceeded",
            f"Agent {agent.name} paused",
            f"Budget exceeded: {reason}",
            target_type="agent", target_id=agent.id, org_id=agent.org_id,
        )

    await db.commit()
    logger.info("Agent %s paused for budget: %s", agent.name, reason)


async def unpause_agent(db: AsyncSession, agent_id: int):
    """Unpause a budget-paused agent."""
    agent = (await db.execute(
        select(Agent).where(Agent.id == agent_id)
    )).scalar_one_or_none()
    if not agent:
        return

    agent.budget_paused = False
    agent.budget_pause_reason = None

    from app.services.activity import log_activity
    await log_activity(
        db, "system", None, "agent.budget_unpaused", "agent", agent.id,
        {"agent_name": agent.name},
        org_id=agent.org_id,
    )
    await db.commit()
    logger.info("Agent %s budget-unpause", agent.name)


async def reset_budgets_if_due(db: AsyncSession):
    """Reset budget-paused agents if their new billing period spend is under budget."""
    now = datetime.now(timezone.utc)
    today_day = now.day

    paused_agents = (await db.execute(
        select(Agent).where(
            Agent.budget_paused == True,
            Agent.budget_reset_day == today_day,
        )
    )).scalars().all()

    for agent in paused_agents:
        if agent.monthly_budget_usd is None:
            await unpause_agent(db, agent.id)
            continue

        spent = await get_agent_spend_this_period(db, agent.id, agent.budget_reset_day or 1)
        if spent < float(agent.monthly_budget_usd):
            await unpause_agent(db, agent.id)
            from app.services.activity import log_activity
            await log_activity(
                db, "system", None, "agent.budget_reset", "agent", agent.id,
                {"agent_name": agent.name, "message": "New billing period — budget reset"},
                org_id=agent.org_id,
            )
            await db.commit()
            logger.info("Agent %s budget reset — new billing period", agent.name)
