from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.skill import Skill, AgentSkill
from app.models.agent import Agent
from app.schemas.skill import SkillCreate, SkillUpdate, SkillOut, AgentSkillOut, AssignSkillRequest

router = APIRouter(prefix="/skills", tags=["skills"])


def _skill_to_out(skill: Skill, agent_count: int = 0) -> SkillOut:
    return SkillOut(
        id=skill.id,
        name=skill.name,
        description=skill.description,
        source_type=skill.source_type,
        source_url=skill.source_url,
        version=skill.version,
        config=skill.config,
        created_by_user_id=skill.created_by_user_id,
        installed_at=skill.installed_at,
        updated_at=skill.updated_at,
        agent_count=agent_count,
    )


@router.get("/", response_model=list[SkillOut])
async def list_skills(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    org_id = getattr(_user, "org_id", None)
    result = await db.execute(
        select(Skill).where(Skill.org_id == org_id).order_by(Skill.name)
    )
    skills = result.scalars().all()
    out = []
    for s in skills:
        count = (await db.execute(
            select(func.count(AgentSkill.id)).where(AgentSkill.skill_id == s.id)
        )).scalar() or 0
        out.append(_skill_to_out(s, count))
    return out


@router.post("/", response_model=SkillOut, status_code=201)
async def create_skill(
    body: SkillCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    skill = Skill(
        name=body.name,
        description=body.description,
        source_type=body.source_type,
        source_url=body.source_url,
        version=body.version,
        config=body.config,
        created_by_user_id=user.id,
        org_id=user.org_id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return _skill_to_out(skill, 0)


@router.get("/{skill_id}", response_model=SkillOut)
async def get_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    count = (await db.execute(
        select(func.count(AgentSkill.id)).where(AgentSkill.skill_id == skill.id)
    )).scalar() or 0
    return _skill_to_out(skill, count)


@router.patch("/{skill_id}", response_model=SkillOut)
async def update_skill(
    skill_id: int,
    body: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(skill, k, v)
    await db.commit()
    await db.refresh(skill)
    count = (await db.execute(
        select(func.count(AgentSkill.id)).where(AgentSkill.skill_id == skill.id)
    )).scalar() or 0
    return _skill_to_out(skill, count)


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    await db.delete(skill)
    await db.commit()


@router.post("/{skill_id}/assign", response_model=list[AgentSkillOut])
async def assign_skill(
    skill_id: int,
    body: AssignSkillRequest,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    created = []
    for agent_id in body.agent_ids:
        agent = (await db.execute(select(Agent).where(Agent.id == agent_id))).scalar_one_or_none()
        if not agent:
            continue
        existing = (await db.execute(
            select(AgentSkill).where(AgentSkill.agent_id == agent_id, AgentSkill.skill_id == skill_id)
        )).scalar_one_or_none()
        if existing:
            continue
        agent_skill = AgentSkill(
            agent_id=agent_id,
            skill_id=skill_id,
            config_override=body.config_override,
        )
        db.add(agent_skill)
        await db.flush()
        created.append(AgentSkillOut(
            id=agent_skill.id,
            agent_id=agent_skill.agent_id,
            skill_id=agent_skill.skill_id,
            skill_name=skill.name,
            skill_description=skill.description,
            enabled=agent_skill.enabled,
            config_override=agent_skill.config_override,
            assigned_at=agent_skill.assigned_at,
        ))
    await db.commit()
    return created


@router.delete("/{skill_id}/unassign/{agent_id}", status_code=204)
async def unassign_skill(
    skill_id: int,
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_admin),
):
    result = await db.execute(
        select(AgentSkill).where(AgentSkill.skill_id == skill_id, AgentSkill.agent_id == agent_id)
    )
    agent_skill = result.scalar_one_or_none()
    if not agent_skill:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(agent_skill)
    await db.commit()


@router.get("/agents/{agent_id}/skills", response_model=list[AgentSkillOut])
async def get_agent_skills(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(AgentSkill)
        .options(selectinload(AgentSkill.skill))
        .where(AgentSkill.agent_id == agent_id)
        .order_by(AgentSkill.assigned_at.desc())
    )
    agent_skills = result.scalars().all()
    return [
        AgentSkillOut(
            id=a.id,
            agent_id=a.agent_id,
            skill_id=a.skill_id,
            skill_name=a.skill.name,
            skill_description=a.skill.description,
            enabled=a.enabled,
            config_override=a.config_override,
            assigned_at=a.assigned_at,
        )
        for a in agent_skills
    ]
