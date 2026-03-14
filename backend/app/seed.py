from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User
from app.models.department import Department
from app.models.board import Board
from app.models.agent import Agent
from app.models.organization import Organization
from app.models.organization_settings import OrganizationSettings

USERS = [
    {"name": "Clement", "email": "clement@galado.com.my", "role": "admin", "password": "helix2024!"},
    {"name": "Sherlyn", "email": "sherlyn@galado.com.my", "role": "member", "password": "helix2024!"},
    {"name": "Akram", "email": "akram@galado.com.my", "role": "member", "password": "helix2024!"},
    {"name": "Amy", "email": "amy@galado.com.my", "role": "member", "password": "helix2024!"},
    {"name": "Helix", "email": "helix@system.internal", "role": "system", "password": "helix-system-nologin"},
]

DEPARTMENTS = ["Marketing", "Customer Service", "Operations", "Tech", "Finance & HR"]

BOARDS = {
    "Marketing": [
        "Marketing Overview", "Meta Ads", "Email Marketing", "SEO & Blog",
        "Creative Studio", "Social Media", "Growth & Analytics",
    ],
    "Customer Service": ["CS Inbox", "Outbound", "CS Knowledge Base"],
    "Operations": ["Director Inbox", "Order Processing"],
    "Tech": ["Tech Overview", "Development", "Testing", "Bug Tracker"],
    "Finance & HR": ["Finance", "HR"],
}

AGENTS = [
    {"name": "Helix", "role_title": "Director", "department": "Operations", "board": "Director Inbox"},
    {"name": "Maven", "role_title": "Marketing Manager", "department": "Marketing", "board": "Marketing Overview"},
    {"name": "Adley", "role_title": "Meta Ads Specialist", "department": "Marketing", "board": "Meta Ads"},
    {"name": "Klay", "role_title": "Klaviyo Email Specialist", "department": "Marketing", "board": "Email Marketing"},
    {"name": "Sierra", "role_title": "SEO Specialist", "department": "Marketing", "board": "SEO & Blog"},
    {"name": "Pixel", "role_title": "Creative Designer (Images)", "department": "Marketing", "board": "Creative Studio"},
    {"name": "Reel", "role_title": "Creative Designer (Video)", "department": "Marketing", "board": "Creative Studio"},
    {"name": "Vira", "role_title": "Social Media Manager", "department": "Marketing", "board": "Social Media"},
    {"name": "Metric", "role_title": "Growth Analyst", "department": "Marketing", "board": "Growth & Analytics"},
    {"name": "Wordsmith", "role_title": "Copywriter", "department": "Marketing", "board": "Marketing Overview"},
    {"name": "Scout", "role_title": "Influencer/KOL Manager", "department": "Marketing", "board": "Social Media"},
    {"name": "Crystal", "role_title": "CS Lead", "department": "Customer Service", "board": "CS Inbox"},
    {"name": "Numeris", "role_title": "Order Processing", "department": "Operations", "board": "Order Processing"},
    {"name": "Forge", "role_title": "Project Manager", "department": "Tech", "board": "Tech Overview"},
    {"name": "Nova", "role_title": "Frontend Developer", "department": "Tech", "board": "Development"},
    {"name": "Bolt", "role_title": "Backend Developer", "department": "Tech", "board": "Development"},
    {"name": "Prism", "role_title": "QA/QC", "department": "Tech", "board": "Testing"},
    {"name": "Sentinel", "role_title": "DevOps/Infra", "department": "Tech", "board": "Tech Overview"},
    {"name": "Ledger", "role_title": "Finance Manager", "department": "Finance & HR", "board": "Finance"},
    {"name": "Sage", "role_title": "HR Manager", "department": "Finance & HR", "board": "HR"},
]


async def seed_all(db: AsyncSession):
    # Check if already seeded
    existing = (await db.execute(select(User))).scalars().first()
    if existing:
        return

    # Ensure GALADO org exists
    org_result = await db.execute(select(Organization).where(Organization.slug == "galado"))
    org = org_result.scalar_one_or_none()
    if not org:
        org = Organization(name="GALADO", slug="galado")
        db.add(org)
        await db.flush()

    # Ensure org settings exist
    settings_result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == org.id)
    )
    if not settings_result.scalar_one_or_none():
        db.add(OrganizationSettings(
            org_id=org.id,
            model_provider="moonshot",
            model_name="kimi-k2.5",
            timezone="Asia/Kuala_Lumpur",
        ))

    # Users
    for u in USERS:
        db.add(User(
            name=u["name"], email=u["email"], role=u["role"],
            password_hash=hash_password(u["password"]),
            org_id=org.id,
        ))
    await db.flush()

    # Departments
    dept_map = {}
    for name in DEPARTMENTS:
        dept = Department(name=name, org_id=org.id)
        db.add(dept)
        await db.flush()
        dept_map[name] = dept.id

    # Boards
    board_map = {}
    for dept_name, boards in BOARDS.items():
        for board_name in boards:
            board = Board(name=board_name, department_id=dept_map[dept_name])
            db.add(board)
            await db.flush()
            board_map[board_name] = board.id

    # Agents
    for a in AGENTS:
        agent = Agent(
            name=a["name"],
            role_title=a["role_title"],
            department_id=dept_map[a["department"]],
            primary_board_id=board_map[a["board"]],
            status="offline",
            execution_mode="manual",
            org_id=org.id,
        )
        db.add(agent)

    await db.commit()
    print("Seed data loaded successfully.")


async def ensure_helix_user(db: AsyncSession):
    """Ensure the Helix system user exists (for DBs seeded before this user was added)."""
    result = await db.execute(select(User).where(User.email == "helix@system.internal"))
    if result.scalar_one_or_none():
        return
    # Get the first org
    org_result = await db.execute(select(Organization).order_by(Organization.id).limit(1))
    org = org_result.scalar_one_or_none()
    org_id = org.id if org else 1
    db.add(User(
        name="Helix",
        email="helix@system.internal",
        role="system",
        password_hash=hash_password("helix-system-nologin"),
        org_id=org_id,
    ))
    await db.commit()
    print("Helix system user created.")
