"""
Onboarding wizard API.
Detects first-run state and guides through multi-step setup.
"""
import secrets

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, create_access_token
from app.core.encryption import encrypt_value
from app.models.organization import Organization
from app.models.organization_settings import OrganizationSettings
from app.models.onboarding_state import OnboardingState
from app.models.user import User
from app.models.department import Department
from app.models.board import Board
from app.models.agent import Agent
from app.services.onboarding_templates import (
    DEPARTMENT_TEMPLATES, AGENT_TEMPLATES,
    DEPARTMENT_SUMMARY, AGENT_PACK_SUMMARY,
)

from sqlalchemy import text as sa_text

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])


# --- Helpers ---

async def _get_onboarding_state(db: AsyncSession) -> OnboardingState | None:
    result = await db.execute(
        select(OnboardingState).where(OnboardingState.completed == False).limit(1)
    )
    return result.scalar_one_or_none()


# --- Status ---

@router.get("/status")
async def get_onboarding_status(db: AsyncSession = Depends(get_db)):
    """
    Check if onboarding is needed.
    No auth required -- called before any user exists.
    """
    org_count = await db.execute(select(func.count(Organization.id)))
    count = org_count.scalar()

    if count == 0:
        state = await _get_onboarding_state(db)
        if state:
            return {"needs_onboarding": True, "current_step": state.current_step, "state_id": state.id}

        new_state = OnboardingState()
        db.add(new_state)
        await db.commit()
        await db.refresh(new_state)
        return {"needs_onboarding": True, "current_step": 1, "state_id": new_state.id}

    return {"needs_onboarding": False, "current_step": 0}


# --- Templates ---

@router.get("/templates")
async def get_templates():
    """Return available department and agent templates for the wizard UI."""
    return {
        "departments": DEPARTMENT_SUMMARY,
        "agent_packs": AGENT_PACK_SUMMARY,
    }


# --- Agent Limit ---

@router.get("/agent-limit")
async def get_agent_limit(db: AsyncSession = Depends(get_db)):
    """Return the max_agents from license_cache. No auth — used during onboarding."""
    try:
        row = (await db.execute(sa_text(
            "SELECT max_agents, plan FROM license_cache WHERE id = 1"
        ))).first()
        if row:
            return {"max_agents": row.max_agents or 5, "plan": row.plan or "trial"}
    except Exception:
        pass
    return {"max_agents": 5, "plan": "trial"}


# --- Step 2: Create Organization + Admin ---

class Step2Request(BaseModel):
    org_name: str
    admin_email: str
    admin_password: str
    admin_name: str = "Admin"


@router.post("/step/2")
async def step2_create_org(req: Step2Request, db: AsyncSession = Depends(get_db)):
    """Create organization and admin user."""
    existing = await db.execute(select(Organization).limit(1))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Organization already exists")

    slug = req.org_name.lower().replace(" ", "-").replace("&", "and")

    org = Organization(name=req.org_name, slug=slug)
    db.add(org)
    await db.flush()

    admin = User(
        org_id=org.id,
        email=req.admin_email,
        password_hash=hash_password(req.admin_password),
        name=req.admin_name,
        role="admin",
    )
    db.add(admin)
    await db.flush()

    settings = OrganizationSettings(org_id=org.id, timezone="Asia/Kuala_Lumpur")
    db.add(settings)

    # Create Helix system user for this org
    helix_user = User(
        org_id=org.id,
        email="helix@system.internal",
        password_hash=hash_password("helix-system-nologin"),
        name="Helix",
        role="system",
    )
    db.add(helix_user)

    state = await _get_onboarding_state(db)
    if state:
        state.org_id = org.id
        state.current_step = 3
        state.data = {**(state.data or {}), "org_id": org.id, "admin_id": admin.id}

    await db.commit()

    token = create_access_token({"sub": str(admin.id), "org_id": org.id})

    return {
        "success": True,
        "org_id": org.id,
        "admin_id": admin.id,
        "token": token,
        "next_step": 3,
    }


# --- Step 3: AI Model Configuration ---

class Step3Request(BaseModel):
    provider: str
    model_name: str
    api_key: str
    base_url: str | None = None


@router.post("/step/3")
async def step3_ai_model(req: Step3Request, db: AsyncSession = Depends(get_db)):
    """Configure AI model provider."""
    state = await _get_onboarding_state(db)
    if not state or not state.org_id:
        raise HTTPException(400, "Complete step 2 first")

    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == state.org_id)
    )
    settings = result.scalar_one()

    settings.model_provider = req.provider
    settings.model_name = req.model_name
    settings.model_api_key_encrypted = encrypt_value(req.api_key)
    settings.model_base_url = req.base_url

    state.current_step = 4
    await db.commit()

    # Sync model config to openclaw.json so gateway can detect the key and start
    from app.services.gateway import gateway
    await gateway.sync_model_config_from_db(force=True)

    return {"success": True, "next_step": 4}


# --- Step 4: Create Departments & Boards ---

class Step4Request(BaseModel):
    templates: list[str]
    custom_departments: list[dict] | None = None


@router.post("/step/4")
async def step4_departments(req: Step4Request, db: AsyncSession = Depends(get_db)):
    """Create departments and boards from templates."""
    state = await _get_onboarding_state(db)
    if not state or not state.org_id:
        raise HTTPException(400, "Complete step 2 first")

    org_id = state.org_id
    created_departments = []
    sort_order = 0

    for template_key in req.templates:
        template = DEPARTMENT_TEMPLATES.get(template_key)
        if not template:
            continue

        dept = Department(
            org_id=org_id,
            name=template["name"],
            emoji=template["emoji"],
            sort_order=sort_order,
        )
        db.add(dept)
        await db.flush()
        sort_order += 1

        board_order = 0
        for board_name in template["boards"]:
            board = Board(
                department_id=dept.id,
                name=board_name,
                sort_order=board_order,
            )
            db.add(board)
            board_order += 1

        created_departments.append({"name": dept.name, "board_count": len(template["boards"])})

    if req.custom_departments:
        for custom in req.custom_departments:
            dept = Department(
                org_id=org_id,
                name=custom["name"],
                emoji=custom.get("emoji", "\U0001f4c1"),
                sort_order=sort_order,
            )
            db.add(dept)
            await db.flush()
            sort_order += 1

            board_order = 0
            for board_name in custom.get("boards", []):
                board = Board(
                    department_id=dept.id,
                    name=board_name,
                    sort_order=board_order,
                )
                db.add(board)
                board_order += 1

            created_departments.append({"name": dept.name, "board_count": len(custom.get("boards", []))})

    state.current_step = 5
    await db.commit()
    return {"success": True, "departments_created": created_departments, "next_step": 5}


# --- Step 5: Create Agents ---

class Step5Request(BaseModel):
    agent_packs: list[str]
    custom_agents: list[dict] | None = None


@router.post("/step/5")
async def step5_agents(req: Step5Request, db: AsyncSession = Depends(get_db)):
    """Create agents from template packs."""
    state = await _get_onboarding_state(db)
    if not state or not state.org_id:
        raise HTTPException(400, "Complete step 2 first")

    org_id = state.org_id
    created_agents = []

    depts = await db.execute(select(Department).where(Department.org_id == org_id))
    dept_map = {d.name.lower(): d for d in depts.scalars().all()}

    boards = await db.execute(
        select(Board).join(Department).where(Department.org_id == org_id)
    )
    board_map = {b.name.lower(): b for b in boards.scalars().all()}

    for pack_key in req.agent_packs:
        pack = AGENT_TEMPLATES.get(pack_key, [])
        for agent_tmpl in pack:
            dept = dept_map.get(agent_tmpl.get("department", "").lower())
            board = board_map.get(agent_tmpl.get("primary_board", "").lower())

            if not dept or not board:
                continue

            agent = Agent(
                org_id=org_id,
                name=agent_tmpl["name"],
                role_title=agent_tmpl["role_title"],
                department_id=dept.id,
                primary_board_id=board.id,
                system_prompt=agent_tmpl["system_prompt"],
                status="offline",
                execution_mode=agent_tmpl.get("execution_mode", "auto"),
            )
            db.add(agent)
            created_agents.append(agent_tmpl["name"])

    if req.custom_agents:
        for custom in req.custom_agents:
            # Try to find first dept/board for assignment
            first_dept = next(iter(dept_map.values()), None)
            first_board = next(iter(board_map.values()), None)
            if not first_dept or not first_board:
                continue

            agent = Agent(
                org_id=org_id,
                name=custom["name"],
                role_title=custom.get("role_title", "Agent"),
                department_id=first_dept.id,
                primary_board_id=first_board.id,
                system_prompt=custom.get("system_prompt", ""),
                status="offline",
                execution_mode=custom.get("execution_mode", "auto"),
            )
            db.add(agent)
            created_agents.append(custom["name"])

    state.current_step = 6
    await db.commit()
    return {"success": True, "agents_created": created_agents, "next_step": 6}


# --- Step 6: Telegram (Optional) ---

class Step6Request(BaseModel):
    bot_token: str | None = None
    allowed_user_ids: str | None = None


@router.post("/step/6")
async def step6_telegram(req: Step6Request, db: AsyncSession = Depends(get_db)):
    """Configure Telegram integration (optional)."""
    state = await _get_onboarding_state(db)
    if not state or not state.org_id:
        raise HTTPException(400, "Complete step 2 first")

    if req.bot_token:
        result = await db.execute(
            select(OrganizationSettings).where(OrganizationSettings.org_id == state.org_id)
        )
        settings = result.scalar_one()
        settings.telegram_bot_token_encrypted = encrypt_value(req.bot_token)
        settings.telegram_allowed_user_ids = req.allowed_user_ids

    state.current_step = 7
    await db.commit()
    return {"success": True, "telegram_configured": bool(req.bot_token), "next_step": 7}


# --- Step 7: Invite Team Members ---

class TeamMemberInvite(BaseModel):
    email: str
    name: str
    role: str = "member"


class Step7Request(BaseModel):
    members: list[TeamMemberInvite] = []


@router.post("/step/7")
async def step7_invite_team(req: Step7Request, db: AsyncSession = Depends(get_db)):
    """Create team member accounts with temporary passwords."""
    state = await _get_onboarding_state(db)
    if not state or not state.org_id:
        raise HTTPException(400, "Complete step 2 first")

    created = []
    for member in req.members:
        temp_password = secrets.token_urlsafe(12)
        user = User(
            org_id=state.org_id,
            email=member.email,
            password_hash=hash_password(temp_password),
            name=member.name,
            role=member.role,
        )
        db.add(user)
        created.append({
            "name": member.name,
            "email": member.email,
            "temp_password": temp_password,
        })

    state.current_step = 8
    await db.commit()
    return {"success": True, "members_created": created, "next_step": 8}


# --- Step 8: Complete ---

@router.post("/step/8")
async def step8_complete(db: AsyncSession = Depends(get_db)):
    """Mark onboarding as complete."""
    state = await _get_onboarding_state(db)
    if state:
        state.completed = True
        state.current_step = 8
        await db.commit()
    return {"success": True, "completed": True, "redirect": "/dashboard"}


# --- Skip Step ---

@router.post("/skip/{step}")
async def skip_step(step: int, db: AsyncSession = Depends(get_db)):
    """Skip a step and advance to the next."""
    state = await _get_onboarding_state(db)
    if state and state.current_step == step:
        state.current_step = step + 1
        if step >= 8:
            state.completed = True
        await db.commit()
    return {"success": True, "next_step": min(step + 1, 8)}
