import os
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, PlainTextResponse, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user_or_service as get_current_user, require_admin
from app.models.skill import Skill, AgentSkill, SkillAttachment
from app.models.agent import Agent
from app.schemas.skill import (
    SkillCreate, SkillUpdate, SkillOut, SkillSummary,
    AttachmentOut, AgentSkillOut, AssignSkillsRequest, SkillAgentOut,
)
from app.services.skill_service import SkillService

logger = logging.getLogger("helix.skills")

router = APIRouter(tags=["skills"])


# ===========================================================================
# Helpers
# ===========================================================================

def _attachment_out(a: SkillAttachment) -> AttachmentOut:
    return AttachmentOut(
        id=a.id,
        filename=a.filename,
        original_filename=a.original_filename,
        description=a.description,
        file_size=a.file_size,
        mime_type=a.mime_type,
        uploaded_at=a.uploaded_at,
        download_url=f"/api/skill-attachments/{a.id}/download",
    )


def _skill_summary(skill: Skill, agent_count: int) -> SkillSummary:
    att_count = len(skill.attachments) if hasattr(skill, "attachments") and skill.attachments else 0
    return SkillSummary(
        id=skill.id,
        name=skill.name,
        slug=skill.slug,
        version=skill.version,
        description=skill.description,
        category=skill.category,
        tags=skill.tags,
        activation_mode=skill.activation_mode,
        is_system=skill.is_system,
        created_at=skill.created_at,
        updated_at=skill.updated_at,
        agent_count=agent_count,
        attachment_count=att_count,
    )


def _skill_out(skill: Skill, agent_count: int) -> SkillOut:
    attachments = (
        [_attachment_out(a) for a in skill.attachments]
        if hasattr(skill, "attachments") and skill.attachments
        else []
    )
    return SkillOut(
        id=skill.id,
        name=skill.name,
        slug=skill.slug,
        version=skill.version,
        description=skill.description,
        category=skill.category,
        tags=skill.tags,
        content=skill.content,
        activation_mode=skill.activation_mode,
        activation_boards=skill.activation_boards,
        activation_tags=skill.activation_tags,
        is_system=skill.is_system,
        created_by=skill.created_by,
        created_at=skill.created_at,
        updated_at=skill.updated_at,
        agent_count=agent_count,
        attachment_count=len(attachments),
        attachments=attachments,
    )


async def _count_agents(db, skill_id: int) -> int:
    result = await db.execute(
        select(func.count(AgentSkill.id)).where(AgentSkill.skill_id == skill_id)
    )
    return result.scalar() or 0


# ===========================================================================
# Skill CRUD — /api/skills
# ===========================================================================

@router.get("/skills", response_model=list[SkillSummary])
async def list_skills(
    search: str | None = Query(None),
    category: str | None = Query(None),
    tag: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    svc = SkillService(db)
    skills = await svc.list_skills(user.org_id, search=search, category=category, tag=tag)
    out = []
    for s in skills:
        count = await _count_agents(db, s.id)
        out.append(_skill_summary(s, count))
    return out


@router.post("/skills", response_model=SkillOut, status_code=201)
async def create_skill(
    body: SkillCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    svc = SkillService(db)
    skill = await svc.create_skill(
        user.org_id,
        name=body.name,
        slug=body.slug,
        content=body.content,
        description=body.description,
        category=body.category,
        tags=body.tags,
        activation_mode=body.activation_mode,
        activation_boards=body.activation_boards,
        activation_tags=body.activation_tags,
        created_by=user.id,
    )
    await db.commit()
    skill = await svc.get_skill(skill.id)
    return _skill_out(skill, 0)


@router.post("/skills/import", response_model=SkillOut, status_code=201)
async def import_skill(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Import a skill from a .md or .txt file upload."""
    filename = file.filename or ""
    if not filename.endswith((".md", ".txt")):
        raise HTTPException(status_code=400, detail="Only .md and .txt files are supported")

    data = await file.read()
    if len(data) > 1 * 1024 * 1024:  # 1MB max for skill content
        raise HTTPException(status_code=400, detail="File too large (max 1MB)")

    content = data.decode("utf-8", errors="replace")
    svc = SkillService(db)
    skill = await svc.import_skill(user.org_id, content, created_by=user.id)
    await db.commit()
    skill = await svc.get_skill(skill.id)
    return _skill_out(skill, 0)


@router.get("/skills/{skill_id}", response_model=SkillOut)
async def get_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")
    count = await _count_agents(db, skill.id)
    return _skill_out(skill, count)


@router.patch("/skills/{skill_id}", response_model=SkillOut)
async def update_skill(
    skill_id: int,
    body: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    svc = SkillService(db)
    # Verify org ownership
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")

    updates = body.model_dump(exclude_unset=True)
    await svc.update_skill(skill_id, **updates)
    await db.commit()
    await svc.flush_workspace_syncs()
    skill = await svc.get_skill(skill_id)
    count = await _count_agents(db, skill.id)
    return _skill_out(skill, count)


@router.delete("/skills/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")
    try:
        await svc.delete_skill(skill_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.commit()
    await svc.flush_workspace_syncs()


@router.get("/skills/{skill_id}/content")
async def get_skill_content(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return raw markdown content only."""
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")
    return PlainTextResponse(skill.content, media_type="text/markdown")


@router.get("/skills/{skill_id}/export")
async def export_skill(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Export skill as a .md file with YAML frontmatter."""
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")

    content = await svc.export_skill(skill_id)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="{skill.slug}.md"',
        },
    )


@router.get("/skills/{skill_id}/agents", response_model=list[SkillAgentOut])
async def get_skill_agents(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List agents assigned to this skill."""
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")
    agents = await svc.get_skill_agents(skill_id)
    return [SkillAgentOut.model_validate(a) for a in agents]


# ===========================================================================
# Skill Attachments — /api/skills/:id/attachments, /api/skill-attachments/:id
# ===========================================================================

@router.get("/skills/{skill_id}/attachments", response_model=list[AttachmentOut])
async def list_skill_attachments(
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")
    attachments = await svc.list_attachments(skill_id)
    return [_attachment_out(a) for a in attachments]


@router.post("/skills/{skill_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_skill_attachment(
    skill_id: int,
    file: UploadFile = File(...),
    description: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Upload an attachment file to a skill."""
    svc = SkillService(db)
    skill = await svc.get_skill(skill_id)
    if skill.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Skill not found")

    filename = file.filename or "unnamed"
    data = await file.read()

    try:
        attachment = await svc.add_attachment(
            skill_id,
            filename=filename,
            original_filename=filename,
            file_data=data,
            mime_type=file.content_type,
            description=description,
            uploaded_by=user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.commit()
    await svc.flush_workspace_syncs()
    attachment = await svc.get_attachment(attachment.id)
    return _attachment_out(attachment)


@router.get("/skill-attachments/{attachment_id}/download")
async def download_skill_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Download a skill attachment file."""
    svc = SkillService(db)
    try:
        attachment = await svc.get_attachment(attachment_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if not os.path.isfile(attachment.storage_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=attachment.storage_path,
        filename=attachment.original_filename,
        media_type=attachment.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.original_filename}"',
        },
    )


@router.delete("/skill-attachments/{attachment_id}", status_code=204)
async def delete_skill_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    svc = SkillService(db)
    try:
        await svc.delete_attachment(attachment_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    await db.commit()
    await svc.flush_workspace_syncs()


# ===========================================================================
# Agent Skills — /api/agents/:id/skills
# ===========================================================================

@router.get("/agents/{agent_id}/skills", response_model=list[AgentSkillOut])
async def get_agent_skills(
    agent_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """List skills assigned to an agent."""
    # Verify agent belongs to user's org
    agent = await _get_agent_or_404(db, agent_id, user.org_id)
    svc = SkillService(db)
    skills = await svc.get_agent_skills(agent_id)
    return [_agent_skill_out(db, agent_id, s) for s in skills]


@router.post("/agents/{agent_id}/skills", response_model=list[AgentSkillOut], status_code=201)
async def assign_skills_to_agent(
    agent_id: int,
    body: AssignSkillsRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Assign one or more skills to an agent."""
    agent = await _get_agent_or_404(db, agent_id, user.org_id)
    svc = SkillService(db)
    results = []
    for skill_id in body.skill_ids:
        try:
            await svc.assign_skill(agent_id, skill_id, assigned_by=user.id)
        except ValueError:
            continue  # skip already assigned or not found
    await db.commit()
    await svc.flush_workspace_syncs()

    # Return updated list
    skills = await svc.get_agent_skills(agent_id)
    return [_agent_skill_out(db, agent_id, s) for s in skills]


@router.delete("/agents/{agent_id}/skills/{skill_id}", status_code=204)
async def unassign_skill_from_agent(
    agent_id: int,
    skill_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_admin),
):
    """Unassign a skill from an agent."""
    agent = await _get_agent_or_404(db, agent_id, user.org_id)
    svc = SkillService(db)
    try:
        await svc.unassign_skill(agent_id, skill_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    await db.commit()
    await svc.flush_workspace_syncs()


@router.get("/agents/{agent_id}/active-skills")
async def get_agent_active_skills(
    agent_id: int,
    board_id: int | None = Query(None),
    task_tags: str | None = Query(None, description="Comma-separated task tags"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Resolve which skills are active for an agent given a task context."""
    agent = await _get_agent_or_404(db, agent_id, user.org_id)
    tags_list = [t.strip() for t in task_tags.split(",")] if task_tags else None

    svc = SkillService(db)
    skills = await svc.resolve_active_skills(agent_id, board_id=board_id, task_tags=tags_list)
    context = svc.build_skill_context(skills)

    return {
        "agent_id": agent_id,
        "board_id": board_id,
        "task_tags": tags_list,
        "active_skills": [
            {
                "id": s.id,
                "name": s.name,
                "slug": s.slug,
                "activation_mode": s.activation_mode,
            }
            for s in skills
        ],
        "context_length": len(context),
        "context": context,
    }


# ===========================================================================
# Internal helpers
# ===========================================================================

async def _get_agent_or_404(db: AsyncSession, agent_id: int, org_id: int) -> Agent:
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.org_id == org_id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


def _agent_skill_out(db, agent_id: int, skill: Skill) -> AgentSkillOut:
    att_count = len(skill.attachments) if hasattr(skill, "attachments") and skill.attachments else 0
    # Find the AgentSkill record for assigned_at
    assigned_at = None
    if hasattr(skill, "agent_skills") and skill.agent_skills:
        for ask in skill.agent_skills:
            if ask.agent_id == agent_id:
                assigned_at = ask.assigned_at
                break
    return AgentSkillOut(
        id=skill.id,
        agent_id=agent_id,
        skill_id=skill.id,
        skill_name=skill.name,
        skill_slug=skill.slug,
        skill_description=skill.description,
        skill_category=skill.category,
        skill_tags=skill.tags,
        activation_mode=skill.activation_mode,
        attachment_count=att_count,
        assigned_at=assigned_at,
    )
