import logging
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin, get_current_user
from app.core.encryption import encrypt_value, decrypt_value
from app.models.organization_settings import OrganizationSettings
from app.models.token_usage import TokenUsage
from app.services.model_providers import PROVIDERS, get_provider_config
from app.services.gateway_sync import sync_gateway_config

logger = logging.getLogger("helix.settings")

router = APIRouter(prefix="/settings", tags=["settings"])


# ── Schemas ──

class ModelConfigOut(BaseModel):
    provider: str | None = None
    model_name: str | None = None
    model_display_name: str | None = None
    base_url: str | None = None
    context_window: int | None = None
    max_tokens: int | None = None
    has_api_key: bool = False
    api_key_masked: str | None = None


class ModelConfigUpdate(BaseModel):
    provider: str
    model_name: str
    api_key: str | None = None
    base_url: str | None = None
    display_name: str | None = None
    context_window: int | None = None
    max_tokens: int | None = None


class ModelTestRequest(BaseModel):
    provider: str
    api_key: str
    base_url: str | None = None


def _mask_api_key(api_key: str) -> str:
    if len(api_key) <= 8:
        return "****"
    return api_key[:3] + "..." + api_key[-4:]


# ── Endpoints ──

@router.get("/model")
async def get_model_config(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get current org model config. Key is always masked."""
    org_id = user.org_id
    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == org_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        return ModelConfigOut()

    api_key_masked = None
    if settings.model_api_key_encrypted:
        try:
            decrypted = decrypt_value(settings.model_api_key_encrypted)
            api_key_masked = _mask_api_key(decrypted)
        except Exception:
            api_key_masked = "****"

    return ModelConfigOut(
        provider=settings.model_provider,
        model_name=settings.model_name,
        model_display_name=settings.model_display_name,
        base_url=settings.model_base_url,
        context_window=settings.model_context_window,
        max_tokens=settings.model_max_tokens,
        has_api_key=settings.model_api_key_encrypted is not None,
        api_key_masked=api_key_masked,
    )


@router.put("/model")
async def update_model_config(
    body: ModelConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Update org model config. Admin only."""
    org_id = user.org_id
    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == org_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = OrganizationSettings(org_id=org_id)
        db.add(settings)

    settings.model_provider = body.provider
    settings.model_name = body.model_name
    if body.api_key:
        settings.model_api_key_encrypted = encrypt_value(body.api_key)
    if body.base_url is not None:
        settings.model_base_url = body.base_url
    if body.display_name is not None:
        settings.model_display_name = body.display_name
    if body.context_window is not None:
        settings.model_context_window = body.context_window
    if body.max_tokens is not None:
        settings.model_max_tokens = body.max_tokens

    await db.commit()
    await db.refresh(settings)

    # Sync to gateway in background
    try:
        await sync_gateway_config(db, org_id)
    except Exception as e:
        logger.error("Gateway sync failed: %s", e)

    api_key_masked = None
    if settings.model_api_key_encrypted:
        try:
            decrypted = decrypt_value(settings.model_api_key_encrypted)
            api_key_masked = _mask_api_key(decrypted)
        except Exception:
            api_key_masked = "****"

    return ModelConfigOut(
        provider=settings.model_provider,
        model_name=settings.model_name,
        model_display_name=settings.model_display_name,
        base_url=settings.model_base_url,
        context_window=settings.model_context_window,
        max_tokens=settings.model_max_tokens,
        has_api_key=settings.model_api_key_encrypted is not None,
        api_key_masked=api_key_masked,
    )


@router.post("/model/test")
async def test_model_connection(
    body: ModelTestRequest,
    _user=Depends(require_admin),
):
    """Test connection with given credentials."""
    provider_config = get_provider_config(body.provider)
    base_url = body.base_url or provider_config["base_url"]

    if not base_url:
        raise HTTPException(400, "Base URL required for custom provider")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if body.provider == "anthropic":
                response = await client.get(f"{base_url}/models", headers={
                    "x-api-key": body.api_key,
                    "anthropic-version": "2023-06-01",
                })
            else:
                response = await client.get(f"{base_url}/models", headers={
                    "Authorization": f"Bearer {body.api_key}"
                })

            if response.status_code == 200:
                data = response.json()
                models = []
                if "data" in data:
                    models = [{"id": m["id"], "name": m.get("id", "")} for m in data["data"][:20]]
                return {"status": "success", "message": "Connection successful", "models": models}
            elif response.status_code == 401:
                return {"status": "error", "message": "Invalid API key"}
            else:
                return {"status": "error", "message": f"Provider returned HTTP {response.status_code}"}
    except httpx.TimeoutException:
        return {"status": "error", "message": "Connection timed out"}
    except httpx.ConnectError:
        return {"status": "error", "message": "Cannot connect — check base URL"}
    except Exception as e:
        return {"status": "error", "message": f"Connection failed: {str(e)}"}


@router.get("/model/providers")
async def list_providers(_user=Depends(get_current_user)):
    """List supported providers with their defaults."""
    return {
        name: {
            "name": config["name"],
            "base_url": config["base_url"],
            "api_type": config["api_type"],
            "key_prefix": config["key_prefix"],
            "default_model": config["default_model"],
            "models": config["models"],
        }
        for name, config in PROVIDERS.items()
    }


@router.get("/model/usage")
async def get_token_usage(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Token usage stats for the last N days."""
    org_id = user.org_id
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Total usage
    totals = await db.execute(
        select(
            func.sum(TokenUsage.input_tokens),
            func.sum(TokenUsage.output_tokens),
            func.sum(TokenUsage.total_tokens),
            func.count(TokenUsage.id),
        ).where(
            TokenUsage.org_id == org_id,
            TokenUsage.created_at >= since,
        )
    )
    row = totals.one()
    total_input = row[0] or 0
    total_output = row[1] or 0
    total_tokens = row[2] or 0
    total_requests = row[3] or 0

    # Daily breakdown
    daily_result = await db.execute(
        select(
            func.date_trunc('day', TokenUsage.created_at).label("day"),
            func.sum(TokenUsage.total_tokens).label("tokens"),
            func.count(TokenUsage.id).label("requests"),
        ).where(
            TokenUsage.org_id == org_id,
            TokenUsage.created_at >= since,
        ).group_by("day").order_by("day")
    )
    daily = [
        {
            "date": row.day.isoformat() if row.day else None,
            "tokens": row.tokens or 0,
            "requests": row.requests or 0,
        }
        for row in daily_result.all()
    ]

    # Per-agent breakdown
    from app.models.agent import Agent
    agent_result = await db.execute(
        select(
            TokenUsage.agent_id,
            Agent.name,
            func.sum(TokenUsage.total_tokens).label("tokens"),
            func.count(TokenUsage.id).label("requests"),
        )
        .outerjoin(Agent, TokenUsage.agent_id == Agent.id)
        .where(
            TokenUsage.org_id == org_id,
            TokenUsage.created_at >= since,
        )
        .group_by(TokenUsage.agent_id, Agent.name)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
    )
    per_agent = [
        {
            "agent_id": row.agent_id,
            "agent_name": row.name or "Unknown",
            "tokens": row.tokens or 0,
            "requests": row.requests or 0,
        }
        for row in agent_result.all()
    ]

    return {
        "period_days": days,
        "total": {
            "input_tokens": total_input,
            "output_tokens": total_output,
            "total_tokens": total_tokens,
            "requests": total_requests,
        },
        "daily": daily,
        "per_agent": per_agent,
    }
