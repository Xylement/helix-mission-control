"""
Export agents and skills as marketplace-compatible manifest JSON.
"""
import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.department import Department
from app.models.board import Board
from app.models.skill import Skill, AgentSkill
from app.models.organization import Organization

OPENCLAW_WORKSPACE_BASE = "/home/helix/.openclaw/workspaces"


class ExportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def export_agent_as_template(self, agent_id: int, org_id: int) -> dict:
        agent = await self.db.get(Agent, agent_id)
        if not agent or agent.org_id != org_id:
            raise ValueError("Agent not found")

        dept = await self.db.get(Department, agent.department_id) if agent.department_id else None
        board = await self.db.get(Board, agent.primary_board_id) if agent.primary_board_id else None

        # Get assigned skill slugs
        stmt = select(AgentSkill).where(AgentSkill.agent_id == agent_id)
        result = await self.db.execute(stmt)
        agent_skills = result.scalars().all()
        skill_slugs = []
        for assignment in agent_skills:
            skill = await self.db.get(Skill, assignment.skill_id)
            if skill:
                skill_slugs.append(skill.slug)

        # Read SOUL.md if exists
        soul_content = ""
        agent_dir_name = agent.name.lower()
        soul_path = os.path.join(OPENCLAW_WORKSPACE_BASE, agent_dir_name, "SOUL.md")
        if os.path.exists(soul_path):
            with open(soul_path, "r") as f:
                soul_content = f.read()

        # Sanitize system prompt — replace org-specific values with template variables
        system_prompt = agent.system_prompt or ""
        org = await self.db.get(Organization, org_id)
        if org and org.name:
            system_prompt = system_prompt.replace(org.name, "{{org_name}}")

        return {
            "manifest_version": "1.0",
            "type": "agent_template",
            "id": "",
            "name": agent.name,
            "emoji": "🤖",
            "version": "1.0.0",
            "author": {"id": "", "name": "", "type": "community"},
            "description": agent.role_title or f"{agent.name} agent template",
            "long_description": "",
            "category": self._infer_category(dept.name if dept else "", agent.role_title or ""),
            "tags": [],
            "icon_url": None,
            "screenshots": [],
            "agent_config": {
                "name": agent.name,
                "role_title": agent.role_title or "",
                "department_suggestion": dept.name if dept else "General",
                "board_suggestion": board.name if board else "General",
                "execution_mode": agent.execution_mode or "auto",
                "system_prompt": system_prompt,
                "model_preference": {
                    "min_capability": "mid",
                    "recommended_provider": "any",
                    "recommended_model": None,
                },
                "skills": skill_slugs,
                "memory_config": {
                    "learning_loop": True,
                    "memory_flush": True,
                    "soul_md_template": soul_content or None,
                },
            },
            "requirements": {
                "min_helix_version": "1.0.0",
                "min_plan": "starter",
                "plugins": [],
            },
            "exported_at": datetime.now(timezone.utc).isoformat(),
        }

    async def export_skill_as_template(self, skill_id: int, org_id: int) -> dict:
        skill = await self.db.get(Skill, skill_id)
        if not skill or skill.org_id != org_id:
            raise ValueError("Skill not found")

        return {
            "manifest_version": "1.0",
            "type": "skill",
            "id": "",
            "name": skill.name,
            "emoji": "📝",
            "version": skill.version or "1.0.0",
            "author": {"id": "", "name": "", "type": "community"},
            "description": skill.description or f"{skill.name} skill template",
            "long_description": "",
            "category": skill.category or "general",
            "tags": skill.tags or [],
            "skill_config": {
                "name": skill.name,
                "slug": skill.slug,
                "description": skill.description or "",
                "category": skill.category or "",
                "tags": skill.tags or [],
                "content": skill.content or "",
                "activation": {
                    "mode": skill.activation_mode or "always",
                    "boards": [],
                    "tags": skill.activation_tags or [],
                },
            },
            "requirements": {
                "min_helix_version": "1.0.0",
                "min_plan": "starter",
            },
            "exported_at": datetime.now(timezone.utc).isoformat(),
        }

    def _infer_category(self, dept_name: str, role_title: str) -> str:
        text = f"{dept_name} {role_title}".lower()
        mapping = {
            "marketing": "marketing", "sales": "sales",
            "customer": "customer-service", "support": "customer-service",
            "tech": "tech", "develop": "tech", "engineer": "tech",
            "design": "creative", "creative": "creative",
            "finance": "finance", "account": "finance",
            "hr": "hr", "human": "hr", "people": "hr",
            "operation": "operations", "logistics": "operations",
            "data": "data", "analytics": "data", "legal": "legal",
        }
        for keyword, category in mapping.items():
            if keyword in text:
                return category
        return "general"
