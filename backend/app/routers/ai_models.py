import httpx
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_admin
from app.core.encryption import encrypt_value, decrypt_value
from app.models.ai_model import AIModel
from app.schemas.ai_model import AIModelCreate, AIModelUpdate, AIModelOut

router = APIRouter(prefix="/models", tags=["ai-models"])

PROVIDER_BASE_URLS = {
    "moonshot": "https://api.moonshot.ai/v1",
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "nvidia": "https://integrate.api.nvidia.com/v1",
}


def _model_to_out(model: AIModel) -> AIModelOut:
    return AIModelOut(
        id=model.id,
        provider=model.provider,
        model_name=model.model_name,
        display_name=model.display_name,
        base_url=model.base_url,
        is_default=model.is_default,
        is_active=model.is_active,
        has_api_key=model.api_key_encrypted is not None,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.get("/", response_model=list[AIModelOut])
async def list_models(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(
        select(AIModel).where(AIModel.org_id == org_id).order_by(AIModel.created_at.desc())
    )
    return [_model_to_out(m) for m in result.scalars().all()]


@router.post("/", response_model=AIModelOut, status_code=201)
async def create_model(
    body: AIModelCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    model = AIModel(
        org_id=org_id,
        provider=body.provider,
        model_name=body.model_name,
        display_name=body.display_name,
        api_key_encrypted=encrypt_value(body.api_key) if body.api_key else None,
        base_url=body.base_url,
        is_default=body.is_default,
    )
    if body.is_default:
        await _clear_default(db, org_id)
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return _model_to_out(model)


@router.patch("/{model_id}", response_model=AIModelOut)
async def update_model(
    model_id: int,
    body: AIModelUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(
        select(AIModel).where(AIModel.id == model_id, AIModel.org_id == org_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    updates = body.model_dump(exclude_unset=True)
    if "api_key" in updates:
        api_key = updates.pop("api_key")
        if api_key:
            model.api_key_encrypted = encrypt_value(api_key)
    for k, v in updates.items():
        setattr(model, k, v)
    await db.commit()
    await db.refresh(model)
    return _model_to_out(model)


@router.delete("/{model_id}", status_code=204)
async def delete_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(
        select(AIModel).where(AIModel.id == model_id, AIModel.org_id == org_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.delete(model)
    await db.commit()


@router.post("/{model_id}/test")
async def test_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(
        select(AIModel).where(AIModel.id == model_id, AIModel.org_id == org_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not model.api_key_encrypted:
        raise HTTPException(status_code=400, detail="No API key configured")

    api_key = decrypt_value(model.api_key_encrypted)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if model.provider == "anthropic":
                resp = await client.post(
                    f"{model.base_url}/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model.model_name,
                        "max_tokens": 10,
                        "messages": [{"role": "user", "content": "Hi"}],
                    },
                )
            else:
                resp = await client.post(
                    f"{model.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model.model_name,
                        "messages": [{"role": "user", "content": "Hi"}],
                        "max_tokens": 10,
                    },
                )
            if resp.status_code < 300:
                return {"success": True, "message": "Connection successful"}
            else:
                detail = resp.text[:200]
                return {"success": False, "message": f"API returned {resp.status_code}: {detail}"}
    except httpx.TimeoutException:
        return {"success": False, "message": "Connection timed out"}
    except Exception as e:
        return {"success": False, "message": str(e)[:200]}


@router.post("/{model_id}/set-default", response_model=AIModelOut)
async def set_default_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    org_id = user.org_id
    result = await db.execute(
        select(AIModel).where(AIModel.id == model_id, AIModel.org_id == org_id)
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await _clear_default(db, org_id)
    model.is_default = True
    await db.commit()
    await db.refresh(model)
    return _model_to_out(model)


async def _clear_default(db: AsyncSession, org_id: int):
    result = await db.execute(
        select(AIModel).where(AIModel.is_default == True, AIModel.org_id == org_id)
    )
    for m in result.scalars().all():
        m.is_default = False
