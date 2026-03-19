"""
Skill CRUD, resolution, workspace sync, import/export.
"""
import logging
import os
import re
import shutil
from uuid import uuid4

import yaml
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import async_session as fresh_session_maker
from app.models.skill import Skill, AgentSkill, SkillAttachment
from app.models.agent import Agent

logger = logging.getLogger("helix.skills")

OPENCLAW_WORKSPACE_BASE = "/home/helix/.openclaw/workspaces"
SKILL_STORAGE_BASE = "/data/skills"

ALLOWED_ATTACHMENT_TYPES = {
    ".pdf", ".md", ".txt", ".png", ".jpg", ".jpeg",
    ".webp", ".csv", ".xlsx", ".docx",
}
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024       # 10 MB per file
MAX_SKILL_ATTACHMENTS_SIZE = 50 * 1024 * 1024  # 50 MB total per skill


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(name: str) -> str:
    """Generate a URL-safe slug from a skill name."""
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """
    Split a markdown document into YAML frontmatter dict and body content.
    Returns ({}, full_text) when no frontmatter is present.
    """
    text = text.lstrip()
    if not text.startswith("---"):
        return {}, text

    end = text.find("---", 3)
    if end == -1:
        return {}, text

    yaml_block = text[3:end].strip()
    body = text[end + 3:].lstrip("\n")

    try:
        meta = yaml.safe_load(yaml_block) or {}
    except yaml.YAMLError:
        meta = {}

    return meta, body


def render_frontmatter(skill: Skill) -> str:
    """Render a skill back into a .md file with YAML frontmatter."""
    meta: dict = {}
    meta["name"] = skill.name
    meta["slug"] = skill.slug
    meta["version"] = skill.version
    if skill.description:
        meta["description"] = skill.description
    if skill.category:
        meta["category"] = skill.category
    if skill.tags:
        meta["tags"] = list(skill.tags)
    meta["activation"] = {
        "mode": skill.activation_mode,
    }
    if skill.activation_mode == "board" and skill.activation_boards:
        meta["activation"]["boards"] = list(skill.activation_boards)
    if skill.activation_mode == "tag" and skill.activation_tags:
        meta["activation"]["tags"] = list(skill.activation_tags)

    yaml_str = yaml.dump(meta, default_flow_style=False, sort_keys=False, allow_unicode=True)
    return f"---\n{yaml_str}---\n\n{skill.content}"


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class SkillService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._pending_sync_agents: set[int] = set()

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------

    async def create_skill(
        self,
        org_id: int,
        *,
        name: str,
        content: str = "",
        description: str | None = None,
        slug: str | None = None,
        category: str | None = None,
        tags: list[str] | None = None,
        activation_mode: str = "always",
        activation_boards: list[int] | None = None,
        activation_tags: list[str] | None = None,
        is_system: bool = False,
        created_by: int | None = None,
        frontmatter: dict | None = None,
    ) -> Skill:
        slug = slug or slugify(name)

        # Ensure slug uniqueness within org
        slug = await self._unique_slug(org_id, slug)

        skill = Skill(
            org_id=org_id,
            name=name,
            slug=slug,
            description=description,
            category=category,
            tags=tags or [],
            content=content,
            frontmatter=frontmatter,
            activation_mode=activation_mode,
            activation_boards=activation_boards or [],
            activation_tags=activation_tags or [],
            is_system=is_system,
            created_by=created_by,
        )
        self.db.add(skill)
        await self.db.flush()
        logger.info("Created skill %d: %s (org=%d)", skill.id, skill.name, org_id)
        return skill

    # ------------------------------------------------------------------
    # UPDATE
    # ------------------------------------------------------------------

    async def update_skill(self, skill_id: int, **updates) -> Skill:
        skill = await self._get_or_404(skill_id)

        content_changed = False
        for key, value in updates.items():
            if key == "slug" and value != skill.slug:
                value = await self._unique_slug(skill.org_id, value, exclude_id=skill.id)
            if hasattr(skill, key):
                if key == "content" and value != skill.content:
                    content_changed = True
                setattr(skill, key, value)

        await self.db.flush()

        # Track agents needing sync (caller should commit then sync)
        if content_changed:
            self._pending_sync_agents.update(await self._get_assigned_agent_ids(skill_id))

        logger.info("Updated skill %d", skill_id)
        return skill

    # ------------------------------------------------------------------
    # DELETE
    # ------------------------------------------------------------------

    async def delete_skill(self, skill_id: int) -> None:
        skill = await self._get_or_404(skill_id)
        if skill.is_system:
            raise ValueError("Cannot delete a system skill")

        # Collect affected agents before deletion for workspace re-sync
        affected_agents = await self._get_assigned_agent_ids(skill_id)

        # Remove attachment files from disk
        storage_dir = os.path.join(SKILL_STORAGE_BASE, str(skill.org_id), str(skill.id))
        if os.path.isdir(storage_dir):
            shutil.rmtree(storage_dir, ignore_errors=True)

        await self.db.delete(skill)
        await self.db.flush()

        # Track agents needing sync
        self._pending_sync_agents.update(affected_agents)

        logger.info("Deleted skill %d", skill_id)

    # ------------------------------------------------------------------
    # GET / LIST
    # ------------------------------------------------------------------

    async def get_skill(self, skill_id: int) -> Skill:
        return await self._get_or_404(skill_id, load_relations=True)

    async def list_skills(
        self,
        org_id: int,
        *,
        search: str | None = None,
        category: str | None = None,
        tag: str | None = None,
    ) -> list[Skill]:
        stmt = (
            select(Skill)
            .where(Skill.org_id == org_id)
            .options(selectinload(Skill.attachments))
            .order_by(Skill.name)
        )

        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Skill.name.ilike(pattern),
                    Skill.description.ilike(pattern),
                )
            )
        if category:
            stmt = stmt.where(Skill.category == category)
        if tag:
            stmt = stmt.where(Skill.tags.any(tag))

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # RESOLVE ACTIVE SKILLS (for task dispatch)
    # ------------------------------------------------------------------

    async def resolve_active_skills(
        self,
        agent_id: int,
        board_id: int | None = None,
        task_tags: list[str] | None = None,
    ) -> list[Skill]:
        """
        Determine which skills are active for an agent on a specific task.
        Combines: always-on + board-matched + tag-matched skills.
        """
        # Get all skills assigned to this agent
        stmt = (
            select(Skill)
            .join(AgentSkill, AgentSkill.skill_id == Skill.id)
            .where(AgentSkill.agent_id == agent_id)
            .options(selectinload(Skill.attachments))
        )
        result = await self.db.execute(stmt)
        all_assigned = list(result.scalars().all())

        active = []
        for skill in all_assigned:
            if skill.activation_mode == "always":
                active.append(skill)
            elif skill.activation_mode == "board" and board_id:
                if skill.activation_boards and board_id in skill.activation_boards:
                    active.append(skill)
            elif skill.activation_mode == "tag" and task_tags:
                if skill.activation_tags and set(skill.activation_tags) & set(task_tags):
                    active.append(skill)

        return active

    # ------------------------------------------------------------------
    # BUILD SKILL CONTEXT (for agent prompt injection)
    # ------------------------------------------------------------------

    @staticmethod
    def build_skill_context(skills: list[Skill]) -> str:
        """Compile active skills into a single markdown block for prompt injection."""
        if not skills:
            return ""

        sections = ["# Active Skills\n"]
        for skill in skills:
            sections.append(f"## {skill.name}\n")
            sections.append(skill.content)
            if skill.attachments:
                sections.append("\n**Reference files:** " + ", ".join(
                    a.original_filename for a in skill.attachments
                ))
            sections.append("\n---\n")

        return "\n".join(sections)

    # ------------------------------------------------------------------
    # WORKSPACE SYNC
    # ------------------------------------------------------------------

    async def flush_workspace_syncs(self) -> None:
        """Run pending workspace syncs. Call AFTER db.commit()."""
        agents = list(self._pending_sync_agents)
        self._pending_sync_agents.clear()
        for agent_id in agents:
            try:
                await self.sync_skills_to_workspace(agent_id)
            except Exception as e:
                logger.warning("Failed to sync workspace for agent %d: %s", agent_id, e)

    async def sync_skills_to_workspace(self, agent_id: int) -> None:
        """
        Write SKILLS.md index + individual skill files + attachments
        to an agent's OpenClaw workspace.

        IMPORTANT: Call this AFTER db.commit() so it reads committed state.
        Uses a fresh session to avoid stale data from the caller's session.
        """
        async with fresh_session_maker() as db:
            result = await db.execute(select(Agent).where(Agent.id == agent_id))
            agent = result.scalar_one_or_none()
            if not agent:
                logger.warning("Cannot sync workspace: agent %d not found", agent_id)
                return

            agent_dir_name = agent.name.lower()
            workspace = os.path.join(OPENCLAW_WORKSPACE_BASE, agent_dir_name)

            # Get all assigned skills with attachments
            stmt = (
                select(Skill)
                .join(AgentSkill, AgentSkill.skill_id == Skill.id)
                .where(AgentSkill.agent_id == agent_id)
                .options(selectinload(Skill.attachments))
                .order_by(Skill.name)
            )
            result = await db.execute(stmt)
            skills = list(result.scalars().all())

        # Prepare directories
        skills_dir = os.path.join(workspace, "skills")
        attachments_dir = os.path.join(workspace, "skill-attachments")

        # Clear existing and recreate
        if os.path.isdir(skills_dir):
            shutil.rmtree(skills_dir)
        if os.path.isdir(attachments_dir):
            shutil.rmtree(attachments_dir)
        os.makedirs(skills_dir, exist_ok=True)
        os.makedirs(attachments_dir, exist_ok=True)

        # Write individual skill files
        for skill in skills:
            skill_path = os.path.join(skills_dir, f"{skill.slug}.md")
            with open(skill_path, "w") as f:
                f.write(skill.content)

            # Copy attachments
            if skill.attachments:
                skill_attach_dir = os.path.join(attachments_dir, skill.slug)
                os.makedirs(skill_attach_dir, exist_ok=True)
                for att in skill.attachments:
                    if os.path.isfile(att.storage_path):
                        dest = os.path.join(skill_attach_dir, att.original_filename)
                        shutil.copy2(att.storage_path, dest)

        # Generate SKILLS.md index
        skills_md = self._generate_skills_index(agent.name, skills)
        with open(os.path.join(workspace, "SKILLS.md"), "w") as f:
            f.write(skills_md)

        logger.info("Synced %d skills to workspace for agent %s", len(skills), agent.name)

    @staticmethod
    def _generate_skills_index(agent_name: str, skills: list[Skill]) -> str:
        """Generate the SKILLS.md index file content."""
        lines = [f"# Active Skills for {agent_name}\n"]

        if not skills:
            lines.append("No skills are currently assigned to this agent.\n")
            return "\n".join(lines)

        lines.append(
            f"This agent has {len(skills)} active skill(s). "
            "Refer to individual skill files in skills/ for full details.\n"
        )

        for i, skill in enumerate(skills, 1):
            mode_label = "always active"
            if skill.activation_mode == "board":
                mode_label = "active on matching boards"
            elif skill.activation_mode == "tag":
                mode_label = "active on matching tags"

            lines.append(f"## {i}. {skill.name} ({mode_label})")
            if skill.description:
                lines.append(skill.description)
            lines.append(f"> Full guide: skills/{skill.slug}.md")

            if skill.attachments:
                lines.append(
                    f"> Attachments: skill-attachments/{skill.slug}/ "
                    f"({len(skill.attachments)} file(s))"
                )
            lines.append("")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # IMPORT / EXPORT
    # ------------------------------------------------------------------

    async def import_skill(
        self,
        org_id: int,
        file_content: str,
        created_by: int | None = None,
    ) -> Skill:
        """
        Parse a .md file with YAML frontmatter and create a skill.
        """
        meta, body = parse_frontmatter(file_content)

        name = meta.get("name", "Untitled Skill")
        slug = meta.get("slug") or slugify(name)

        activation = meta.get("activation", {})
        activation_mode = activation.get("mode", "always") if isinstance(activation, dict) else "always"
        activation_boards = activation.get("boards", []) if isinstance(activation, dict) else []
        activation_tags = activation.get("tags", []) if isinstance(activation, dict) else []

        skill = await self.create_skill(
            org_id,
            name=name,
            slug=slug,
            content=body,
            description=meta.get("description"),
            category=meta.get("category"),
            tags=meta.get("tags", []),
            activation_mode=activation_mode,
            activation_boards=activation_boards,
            activation_tags=activation_tags,
            created_by=created_by,
            frontmatter=meta,
        )
        return skill

    async def export_skill(self, skill_id: int) -> str:
        """Export a skill as a .md file with YAML frontmatter header."""
        skill = await self._get_or_404(skill_id, load_relations=True)
        return render_frontmatter(skill)

    # ------------------------------------------------------------------
    # ATTACHMENT MANAGEMENT
    # ------------------------------------------------------------------

    async def add_attachment(
        self,
        skill_id: int,
        *,
        filename: str,
        original_filename: str,
        file_data: bytes,
        mime_type: str | None = None,
        description: str | None = None,
        uploaded_by: int | None = None,
    ) -> SkillAttachment:
        skill = await self._get_or_404(skill_id)

        # Validate extension
        ext = os.path.splitext(original_filename)[1].lower()
        if ext not in ALLOWED_ATTACHMENT_TYPES:
            raise ValueError(f"File type '{ext}' is not allowed")

        # Validate size
        if len(file_data) > MAX_ATTACHMENT_SIZE:
            raise ValueError(f"File exceeds {MAX_ATTACHMENT_SIZE // (1024*1024)}MB limit")

        # Check total size for this skill
        total_stmt = select(func.coalesce(func.sum(SkillAttachment.file_size), 0)).where(
            SkillAttachment.skill_id == skill_id
        )
        total_result = await self.db.execute(total_stmt)
        current_total = total_result.scalar()
        if current_total + len(file_data) > MAX_SKILL_ATTACHMENTS_SIZE:
            raise ValueError(f"Total attachments exceed {MAX_SKILL_ATTACHMENTS_SIZE // (1024*1024)}MB limit")

        # Store file on disk
        storage_dir = os.path.join(
            SKILL_STORAGE_BASE, str(skill.org_id), str(skill.id), "attachments"
        )
        os.makedirs(storage_dir, exist_ok=True)
        # Use a unique filename to avoid collisions
        disk_filename = f"{uuid4().hex[:8]}_{filename}"
        storage_path = os.path.join(storage_dir, disk_filename)
        with open(storage_path, "wb") as f:
            f.write(file_data)

        attachment = SkillAttachment(
            skill_id=skill_id,
            filename=disk_filename,
            original_filename=original_filename,
            description=description,
            file_size=len(file_data),
            mime_type=mime_type,
            storage_path=storage_path,
            uploaded_by=uploaded_by,
        )
        self.db.add(attachment)
        await self.db.flush()

        # Track agents needing sync
        self._pending_sync_agents.update(await self._get_assigned_agent_ids(skill_id))

        logger.info("Added attachment '%s' to skill %d", original_filename, skill_id)
        return attachment

    async def delete_attachment(self, attachment_id: int) -> None:
        stmt = select(SkillAttachment).where(SkillAttachment.id == attachment_id)
        result = await self.db.execute(stmt)
        attachment = result.scalar_one_or_none()
        if not attachment:
            raise ValueError("Attachment not found")

        skill_id = attachment.skill_id

        # Remove file from disk
        if os.path.isfile(attachment.storage_path):
            os.remove(attachment.storage_path)

        await self.db.delete(attachment)
        await self.db.flush()

        # Track agents needing sync
        self._pending_sync_agents.update(await self._get_assigned_agent_ids(skill_id))

        logger.info("Deleted attachment %d from skill %d", attachment_id, skill_id)

    async def list_attachments(self, skill_id: int) -> list[SkillAttachment]:
        stmt = (
            select(SkillAttachment)
            .where(SkillAttachment.skill_id == skill_id)
            .order_by(SkillAttachment.uploaded_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_attachment(self, attachment_id: int) -> SkillAttachment:
        stmt = select(SkillAttachment).where(SkillAttachment.id == attachment_id)
        result = await self.db.execute(stmt)
        att = result.scalar_one_or_none()
        if not att:
            raise ValueError("Attachment not found")
        return att

    # ------------------------------------------------------------------
    # SKILL ASSIGNMENT
    # ------------------------------------------------------------------

    async def assign_skill(
        self, agent_id: int, skill_id: int, assigned_by: int | None = None
    ) -> AgentSkill:
        # Verify both exist
        await self._get_or_404(skill_id)
        agent = await self._get_agent(agent_id)
        if not agent:
            raise ValueError("Agent not found")

        # Check if already assigned
        stmt = select(AgentSkill).where(
            AgentSkill.agent_id == agent_id,
            AgentSkill.skill_id == skill_id,
        )
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            raise ValueError("Skill already assigned to this agent")

        assignment = AgentSkill(
            agent_id=agent_id,
            skill_id=skill_id,
            assigned_by=assigned_by,
        )
        self.db.add(assignment)
        await self.db.flush()

        self._pending_sync_agents.add(agent_id)

        logger.info("Assigned skill %d to agent %d", skill_id, agent_id)
        return assignment

    async def unassign_skill(self, agent_id: int, skill_id: int) -> None:
        stmt = select(AgentSkill).where(
            AgentSkill.agent_id == agent_id,
            AgentSkill.skill_id == skill_id,
        )
        result = await self.db.execute(stmt)
        assignment = result.scalar_one_or_none()
        if not assignment:
            raise ValueError("Skill is not assigned to this agent")

        await self.db.delete(assignment)
        await self.db.flush()

        self._pending_sync_agents.add(agent_id)

        logger.info("Unassigned skill %d from agent %d", skill_id, agent_id)

    async def get_agent_skills(self, agent_id: int) -> list[Skill]:
        stmt = (
            select(Skill)
            .join(AgentSkill, AgentSkill.skill_id == Skill.id)
            .where(AgentSkill.agent_id == agent_id)
            .options(selectinload(Skill.attachments), selectinload(Skill.agent_skills))
            .order_by(Skill.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_skill_agents(self, skill_id: int) -> list[Agent]:
        stmt = (
            select(Agent)
            .join(AgentSkill, AgentSkill.agent_id == Agent.id)
            .where(AgentSkill.skill_id == skill_id)
            .order_by(Agent.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_or_404(self, skill_id: int, *, load_relations: bool = False) -> Skill:
        stmt = select(Skill).where(Skill.id == skill_id)
        if load_relations:
            stmt = stmt.options(
                selectinload(Skill.attachments),
                selectinload(Skill.agent_skills),
            )
        result = await self.db.execute(stmt)
        skill = result.scalar_one_or_none()
        if not skill:
            raise ValueError("Skill not found")
        return skill

    async def _get_agent(self, agent_id: int) -> Agent | None:
        result = await self.db.execute(select(Agent).where(Agent.id == agent_id))
        return result.scalar_one_or_none()

    async def _unique_slug(self, org_id: int, slug: str, exclude_id: int | None = None) -> str:
        """Ensure slug is unique within the org, appending a suffix if needed."""
        base_slug = slug
        counter = 1
        while True:
            stmt = select(Skill.id).where(Skill.org_id == org_id, Skill.slug == slug)
            if exclude_id:
                stmt = stmt.where(Skill.id != exclude_id)
            result = await self.db.execute(stmt)
            if not result.scalar_one_or_none():
                return slug
            slug = f"{base_slug}-{counter}"
            counter += 1

    async def _get_assigned_agent_ids(self, skill_id: int) -> list[int]:
        stmt = select(AgentSkill.agent_id).where(AgentSkill.skill_id == skill_id)
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]
