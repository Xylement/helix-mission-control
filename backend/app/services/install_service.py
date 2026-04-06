"""
Install/uninstall marketplace templates — creates agents and skills from manifests.
"""
import logging
import os

from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.department import Department
from app.models.board import Board
from app.models.installed_template import InstalledTemplate
from app.services.marketplace_service import MarketplaceService
from app.services.license_service import LicenseService
from app.services.skill_service import SkillService

logger = logging.getLogger("helix.install")

PLAN_ORDER = {"trial": 0, "starter": 1, "pro": 2, "scale": 3, "enterprise": 4, "unlicensed": 99}

OPENCLAW_WORKSPACE_BASE = "/home/helix/.openclaw/workspaces"


def _normalize_agent_manifest(manifest: dict) -> dict:
    """Bridge flat marketplace API manifests to the nested agent_config format.

    The marketplace API (api.helixnode.tech) returns a flat structure with keys
    like 'role', 'system_prompt', 'department', 'board', 'skills', 'soul_md'.
    The install logic expects a nested 'agent_config' dict matching the export
    format.  If 'agent_config' already exists (locally-exported template), this
    is a no-op.
    """
    if manifest.get("agent_config"):
        return manifest

    manifest = dict(manifest)  # shallow copy to avoid mutating the original

    # Derive the display name: prefer explicit 'name', fall back to 'role'
    name = manifest.get("name") or manifest.get("role") or manifest.get("slug", "Agent")

    manifest["agent_config"] = {
        "name": name,
        "role_title": manifest.get("role", ""),
        "system_prompt": manifest.get("system_prompt", ""),
        "department_suggestion": manifest.get("department", "General"),
        "board_suggestion": manifest.get("board", "General"),
        "execution_mode": manifest.get("execution_mode", "auto"),
        "skills": manifest.get("skills", []),
        "memory_config": {
            "learning_loop": True,
            "memory_flush": True,
            "soul_md_template": manifest.get("soul_md") or None,
        },
    }

    # Ensure top-level 'name' is set (used by record_install and pre_install_check)
    if not manifest.get("name"):
        manifest["name"] = name

    return manifest


def _normalize_skill_manifest(manifest: dict) -> dict:
    """Bridge flat marketplace skill manifests to the nested skill_config format.

    API returns: {type, title, content, activation_mode}
    Install expects: skill_config.{name, slug, description, content, category, tags, activation}
    """
    if manifest.get("skill_config"):
        return manifest

    manifest = dict(manifest)

    name = manifest.get("name") or manifest.get("title") or manifest.get("slug", "Skill")

    manifest["skill_config"] = {
        "name": name,
        "slug": manifest.get("slug", ""),
        "description": manifest.get("description", ""),
        "category": manifest.get("category", ""),
        "tags": manifest.get("tags", []),
        "content": manifest.get("content", ""),
        "activation": {
            "mode": manifest.get("activation_mode", "always"),
            "boards": manifest.get("activation_boards", []),
            "tags": manifest.get("activation_tags", []),
        },
    }

    if not manifest.get("name"):
        manifest["name"] = name

    return manifest


def _normalize_workflow_manifest(manifest: dict) -> dict:
    """Bridge flat marketplace workflow manifests to the nested workflow_config format.

    API returns: {name, type, steps: [{name, action, step_id, depends_on, agent_template, ...}]}
    Install expects: workflow_config.{trigger, steps, required_agents}
    """
    if manifest.get("workflow_config"):
        return manifest

    manifest = dict(manifest)

    steps = manifest.get("steps", [])

    # Derive required_agents from step agent_template references
    required_agents = []
    for step in steps:
        tmpl = step.get("agent_template")
        if tmpl and tmpl not in required_agents:
            required_agents.append(tmpl)

    manifest["workflow_config"] = {
        "trigger": manifest.get("trigger", "manual"),
        "steps": steps,
        "required_agents": required_agents,
    }

    if not manifest.get("name"):
        manifest["name"] = manifest.get("slug", "Workflow")

    return manifest


def _normalize_plugin_manifest(manifest: dict) -> dict:
    """Bridge flat marketplace plugin manifests to the format plugin_runtime expects.

    API returns: {name, type, auth_config, plugin_type, capabilities, settings_fields}
    Runtime reads: manifest.auth, manifest.setting_definitions, manifest.capabilities
    """
    manifest = dict(manifest)

    # auth_config → auth (runtime reads manifest.get("auth", {}))
    if "auth_config" in manifest and "auth" not in manifest:
        manifest["auth"] = manifest["auth_config"]

    # settings_fields → setting_definitions (runtime reads manifest.get("setting_definitions", []))
    if "settings_fields" in manifest and "setting_definitions" not in manifest:
        manifest["setting_definitions"] = manifest["settings_fields"]

    if not manifest.get("name"):
        manifest["name"] = manifest.get("slug", "Plugin")

    return manifest


class InstallService:
    def __init__(
        self,
        db: AsyncSession,
        marketplace: MarketplaceService,
        license_service: LicenseService,
        skill_service: SkillService,
    ):
        self.db = db
        self.marketplace = marketplace
        self.license_service = license_service
        self.skill_service = skill_service

    # ─── Pre-install Check ───

    async def pre_install_check(
        self, org_id: int, template_slug: str, customizations: dict | None = None,
    ) -> dict:
        manifest = await self.marketplace.get_manifest(template_slug)
        template_type = manifest.get("type", "")
        if template_type == "agent_template":
            manifest = _normalize_agent_manifest(manifest)
        license_info = await self.license_service.get_plan()
        plan = license_info.get("plan", "trial")

        already_installed = await self.marketplace.is_template_installed(org_id, template_slug)

        result = {
            "can_install": True,
            "already_installed": already_installed,
            "agent_name_conflict": False,
            "suggested_name": "",
            "department_exists": False,
            "department_name": "",
            "board_exists": False,
            "board_name": "",
            "plan_limit_ok": True,
            "current_installs": 0,
            "max_installs": 0,
            "reason": None,
        }

        if already_installed:
            result["can_install"] = False
            result["reason"] = "This template is already installed"
            return result

        # Plan check
        min_plan = manifest.get("requirements", {}).get("min_plan", "starter")
        if PLAN_ORDER.get(plan, 0) < PLAN_ORDER.get(min_plan, 0):
            result["can_install"] = False
            result["plan_limit_ok"] = False
            result["reason"] = f"Requires {min_plan} plan or higher"
            return result

        if template_type == "agent_template":
            agent_config = manifest.get("agent_config", {})

            # Agent name conflict
            agent_name = (customizations or {}).get("agent_name") or agent_config.get("name", manifest.get("name"))
            suggested = await self._unique_agent_name(org_id, agent_name)
            result["suggested_name"] = suggested
            result["agent_name_conflict"] = (suggested != agent_name)

            # Department
            dept_name = agent_config.get("department_suggestion", "General")
            dept = await self._find_department(dept_name)
            result["department_exists"] = dept is not None
            result["department_name"] = dept_name

            # Board
            board_name = agent_config.get("board_suggestion", "General")
            if dept:
                board = await self._find_board(dept.id, board_name)
                result["board_exists"] = board is not None
            result["board_name"] = board_name

            # Agent count limit
            current_agent_count = await self._count_agents(org_id)
            max_agents = license_info.get("limits", {}).get("max_agents", 5)
            if current_agent_count >= max_agents:
                result["can_install"] = False
                result["reason"] = f"Agent limit reached ({max_agents})"
                return result

            # Marketplace agent install limit
            current_installs = await self.marketplace.get_installed_count(org_id, "agent")
            limits = license_info.get("limits", {}).get("marketplace_agent_installs", {})
            max_installs = limits.get("limit", 0) if isinstance(limits, dict) else (limits or 0)
            result["current_installs"] = current_installs
            result["max_installs"] = max_installs
            if max_installs > 0 and current_installs >= max_installs:
                result["can_install"] = False
                result["plan_limit_ok"] = False
                result["reason"] = f"Marketplace agent install limit reached ({max_installs})"

        elif template_type == "skill":
            current_installs = await self.marketplace.get_installed_count(org_id, "skill")
            limits = license_info.get("limits", {}).get("marketplace_skill_installs", {})
            max_installs = limits.get("limit", 0) if isinstance(limits, dict) else (limits or 0)
            result["current_installs"] = current_installs
            result["max_installs"] = max_installs
            if max_installs > 0 and current_installs >= max_installs:
                result["can_install"] = False
                result["plan_limit_ok"] = False
                result["reason"] = f"Marketplace skill install limit reached ({max_installs})"

        elif template_type == "department_pack":
            # Pack installs multiple skills — check skill limit for the bundle size
            included = manifest.get("included_templates", [])
            current_installs = await self.marketplace.get_installed_count(org_id, "skill")
            limits = license_info.get("limits", {}).get("marketplace_skill_installs", {})
            max_installs = limits.get("limit", 0) if isinstance(limits, dict) else (limits or 0)
            result["current_installs"] = current_installs
            result["max_installs"] = max_installs
            if max_installs > 0 and (current_installs + len(included)) > max_installs:
                result["can_install"] = False
                result["plan_limit_ok"] = False
                result["reason"] = f"Pack contains {len(included)} skills but only {max_installs - current_installs} install slots remain"

        return result

    # ─── Agent Template Install ───

    async def install_agent_template(
        self, org_id: int, user_id: int, template_slug: str,
        customizations: dict | None = None,
    ) -> dict:
        # 1. Download manifest
        manifest = await self.marketplace.get_manifest(template_slug)
        if manifest.get("type") != "agent_template":
            raise ValueError(f"Template {template_slug} is not an agent template")

        manifest = _normalize_agent_manifest(manifest)
        agent_config = manifest.get("agent_config", {})
        requirements = manifest.get("requirements", {})

        # 2. Validate compatibility
        min_plan = requirements.get("min_plan", "starter")
        license_info = await self.license_service.get_plan()
        plan = license_info.get("plan", "trial")
        if PLAN_ORDER.get(plan, 0) < PLAN_ORDER.get(min_plan, 0):
            raise PermissionError(f"This template requires the {min_plan} plan or higher")

        # 3. Check limits
        current_agent_count = await self._count_agents(org_id)
        max_agents = license_info.get("limits", {}).get("max_agents", 5)
        if current_agent_count >= max_agents:
            raise PermissionError(f"Agent limit reached ({max_agents}). Upgrade your plan.")

        current_installs = await self.marketplace.get_installed_count(org_id, "agent")
        marketplace_limits = license_info.get("limits", {}).get("marketplace_agent_installs", {})
        max_installs = marketplace_limits.get("limit", 0) if isinstance(marketplace_limits, dict) else (marketplace_limits or 0)
        if max_installs > 0 and current_installs >= max_installs:
            raise PermissionError(f"Marketplace agent install limit reached ({max_installs}). Upgrade your plan.")

        # 4. Replace template variables
        org = await self._get_org(org_id)
        user = await self._get_user(user_id)
        replacements = {
            "{{org_name}}": org.name if org else "My Organization",
            "{{admin_name}}": user.name if user else "Admin",
            "{{domain}}": "",
        }
        system_prompt = agent_config.get("system_prompt", "")
        for placeholder, value in replacements.items():
            system_prompt = system_prompt.replace(placeholder, value)

        soul_template = agent_config.get("memory_config", {}).get("soul_md_template", "")
        if soul_template:
            for placeholder, value in replacements.items():
                soul_template = soul_template.replace(placeholder, value)

        # 5. Resolve or create department
        cust = customizations or {}
        dept_id = cust.get("department_id")
        if not dept_id:
            dept_name = cust.get("department_name") or agent_config.get("department_suggestion", "General")
            dept = await self._find_or_create_department(org_id, dept_name)
            dept_id = dept.id

        # 6. Resolve or create board
        board_id = cust.get("board_id")
        if not board_id:
            board_name = cust.get("board_name") or agent_config.get("board_suggestion", "General")
            board = await self._find_or_create_board(dept_id, board_name)
            board_id = board.id

        # 7. Create agent
        agent_name = cust.get("agent_name") or agent_config.get("name", manifest.get("name"))
        agent_name = await self._unique_agent_name(org_id, agent_name)

        agent = Agent(
            name=agent_name,
            org_id=org_id,
            role_title=agent_config.get("role_title", ""),
            system_prompt=system_prompt,
            department_id=dept_id,
            primary_board_id=board_id,
            execution_mode=agent_config.get("execution_mode", "auto"),
            status="offline",
            marketplace_template_slug=template_slug,
        )
        self.db.add(agent)
        await self.db.flush()

        # 8. Create SOUL.md in agent workspace
        if soul_template:
            await self._write_soul_md(agent.name, soul_template)

        # 9. Install referenced skills
        referenced_skills = agent_config.get("skills", [])
        installed_skills = []
        for skill_slug in referenced_skills:
            try:
                await self._install_agent_skill(org_id, agent.id, skill_slug, user_id)
                installed_skills.append(skill_slug)
            except Exception as e:
                logger.warning("Failed to install skill %s for agent %s: %s", skill_slug, agent_name, e)

        # 10. Record install
        await self.marketplace.record_install(
            org_id=org_id,
            template_slug=template_slug,
            template_type="agent",
            template_name=manifest.get("name", ""),
            template_version=manifest.get("version", "1.0.0"),
            manifest=manifest,
            local_resource_id=agent.id,
            local_resource_type="agent",
            installed_by=user_id,
        )
        await self.marketplace.log_install_to_registry(template_slug)

        await self.db.commit()

        return {
            "success": True,
            "agent_id": agent.id,
            "agent_name": agent.name,
            "department_id": dept_id,
            "board_id": board_id,
            "template_slug": template_slug,
            "skills_installed": installed_skills,
        }

    # ─── Skill Template Install ───

    async def install_skill_template(
        self, org_id: int, user_id: int, template_slug: str,
        customizations: dict | None = None,
    ) -> dict:
        manifest = await self.marketplace.get_manifest(template_slug)
        if manifest.get("type") != "skill":
            raise ValueError(f"Template {template_slug} is not a skill template")

        manifest = _normalize_skill_manifest(manifest)
        skill_config = manifest.get("skill_config", {})
        requirements = manifest.get("requirements", {})

        # Validate plan
        min_plan = requirements.get("min_plan", "starter")
        license_info = await self.license_service.get_plan()
        plan = license_info.get("plan", "trial")
        if PLAN_ORDER.get(plan, 0) < PLAN_ORDER.get(min_plan, 0):
            raise PermissionError(f"This skill requires the {min_plan} plan or higher")

        # Check limits
        current_installs = await self.marketplace.get_installed_count(org_id, "skill")
        marketplace_limits = license_info.get("limits", {}).get("marketplace_skill_installs", {})
        max_installs = marketplace_limits.get("limit", 0) if isinstance(marketplace_limits, dict) else (marketplace_limits or 0)
        if max_installs > 0 and current_installs >= max_installs:
            raise PermissionError(f"Marketplace skill install limit reached ({max_installs}). Upgrade your plan.")

        # Create skill via SkillService
        cust = customizations or {}
        skill_name = cust.get("name") or skill_config.get("name", manifest.get("name"))
        activation = skill_config.get("activation", {})

        skill = await self.skill_service.create_skill(
            org_id,
            name=skill_name,
            slug=skill_config.get("slug", template_slug),
            description=skill_config.get("description", manifest.get("description", "")),
            category=skill_config.get("category", ""),
            tags=skill_config.get("tags", []),
            content=skill_config.get("content", ""),
            activation_mode=activation.get("mode", "always") if isinstance(activation, dict) else "always",
            activation_boards=activation.get("boards", []) if isinstance(activation, dict) else [],
            activation_tags=activation.get("tags", []) if isinstance(activation, dict) else [],
            created_by=user_id,
        )

        # Record install
        await self.marketplace.record_install(
            org_id=org_id,
            template_slug=template_slug,
            template_type="skill",
            template_name=manifest.get("name", ""),
            template_version=manifest.get("version", "1.0.0"),
            manifest=manifest,
            local_resource_id=skill.id,
            local_resource_type="skill",
            installed_by=user_id,
        )
        await self.marketplace.log_install_to_registry(template_slug)

        await self.db.commit()

        return {
            "success": True,
            "skill_id": skill.id,
            "skill_name": skill.name,
            "template_slug": template_slug,
        }

    # ─── Department Pack Install ───

    async def install_department_pack(
        self, org_id: int, user_id: int, template_slug: str,
        customizations: dict | None = None,
    ) -> dict:
        """Install a department_pack — a bundle of templates (typically skills)."""
        manifest = await self.marketplace.get_manifest(template_slug)
        if manifest.get("type") != "department_pack":
            raise ValueError(f"Template {template_slug} is not a department_pack")

        requirements = manifest.get("requirements", {})

        # Validate plan
        min_plan = requirements.get("min_plan", "starter")
        license_info = await self.license_service.get_plan()
        plan = license_info.get("plan", "trial")
        if PLAN_ORDER.get(plan, 0) < PLAN_ORDER.get(min_plan, 0):
            raise PermissionError(f"This pack requires the {min_plan} plan or higher")

        # Install each included template
        included_slugs = manifest.get("included_templates", [])
        installed = []
        errors = []
        for slug in included_slugs:
            try:
                # Check if already installed
                if await self.marketplace.is_template_installed(org_id, slug):
                    installed.append(slug)
                    continue
                # Fetch sub-template manifest to determine type
                sub_manifest = await self.marketplace.get_manifest(slug)
                sub_type = sub_manifest.get("type", "")
                if sub_type == "skill":
                    await self.install_skill_template(org_id, user_id, slug, customizations)
                elif sub_type == "agent_template":
                    await self.install_agent_template(org_id, user_id, slug, customizations)
                else:
                    errors.append(f"{slug}: unsupported type '{sub_type}'")
                    continue
                installed.append(slug)
            except Exception as e:
                logger.warning("Failed to install %s from pack %s: %s", slug, template_slug, e)
                errors.append(f"{slug}: {e}")

        # Record the pack itself as installed
        await self.marketplace.record_install(
            org_id=org_id,
            template_slug=template_slug,
            template_type="department_pack",
            template_name=manifest.get("name", ""),
            template_version=manifest.get("version", "1.0.0"),
            manifest=manifest,
            local_resource_id=0,
            local_resource_type="pack",
            installed_by=user_id,
        )
        await self.marketplace.log_install_to_registry(template_slug)

        await self.db.commit()

        return {
            "success": True,
            "template_slug": template_slug,
            "installed_templates": installed,
            "errors": errors,
        }

    # ─── Uninstall ───

    async def uninstall_template(self, org_id: int, user_id: int, installed_template_id: int) -> dict:
        record = await self.db.get(InstalledTemplate, installed_template_id)
        if not record or record.org_id != org_id or not record.is_active:
            raise ValueError("Installed template not found")

        if record.local_resource_type == "agent":
            agent = await self.db.get(Agent, record.local_resource_id)
            if agent:
                await self.db.delete(agent)
        elif record.local_resource_type == "skill":
            try:
                await self.skill_service.delete_skill(record.local_resource_id)
            except ValueError:
                pass  # Skill already deleted
        elif record.local_resource_type == "plugin":
            from app.services.plugin_runtime import PluginRuntime
            runtime = PluginRuntime(self.db, self.license_service)
            try:
                await runtime.uninstall_plugin(record.local_resource_id, org_id)
            except Exception:
                pass  # Plugin already deleted
        elif record.local_resource_type == "workflow":
            from app.models.workflow import Workflow
            wf = await self.db.get(Workflow, record.local_resource_id)
            if wf:
                await self.db.delete(wf)
        elif record.local_resource_type == "pack":
            # Uninstall all included templates
            pack_manifest = record.manifest or {}
            for slug in pack_manifest.get("included_templates", []):
                sub = await self.db.execute(
                    select(InstalledTemplate).where(
                        InstalledTemplate.org_id == org_id,
                        InstalledTemplate.template_slug == slug,
                        InstalledTemplate.is_active == True,
                    )
                )
                sub_record = sub.scalar_one_or_none()
                if sub_record:
                    try:
                        await self.uninstall_template(org_id, user_id, sub_record.id)
                    except Exception as e:
                        logger.warning("Failed to uninstall %s from pack: %s", slug, e)

        await self.marketplace.record_uninstall(installed_template_id, org_id)
        await self.marketplace.log_uninstall_to_registry(record.template_slug)

        await self.db.commit()

        return {
            "success": True,
            "template_slug": record.template_slug,
            "resource_type": record.local_resource_type,
        }

    # ─── Helper methods ───

    async def _count_agents(self, org_id: int) -> int:
        stmt = select(sqlfunc.count()).select_from(Agent).where(Agent.org_id == org_id)
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def _get_org(self, org_id: int):
        from app.models.organization import Organization
        return await self.db.get(Organization, org_id)

    async def _get_user(self, user_id: int):
        from app.models.user import User
        return await self.db.get(User, user_id)

    async def _find_department(self, name: str):
        stmt = select(Department).where(Department.name.ilike(name))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _find_or_create_department(self, org_id: int, name: str):
        dept = await self._find_department(name)
        if dept:
            return dept
        dept = Department(name=name, org_id=org_id)
        self.db.add(dept)
        await self.db.flush()
        return dept

    async def _find_board(self, dept_id: int, name: str):
        stmt = select(Board).where(
            Board.department_id == dept_id,
            Board.name.ilike(name),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _find_or_create_board(self, dept_id: int, name: str):
        board = await self._find_board(dept_id, name)
        if board:
            return board
        board = Board(name=name, department_id=dept_id)
        self.db.add(board)
        await self.db.flush()
        return board

    async def _unique_agent_name(self, org_id: int, base_name: str) -> str:
        name = base_name
        counter = 1
        while True:
            stmt = select(Agent).where(Agent.org_id == org_id, Agent.name == name)
            result = await self.db.execute(stmt)
            if result.scalar_one_or_none() is None:
                return name
            counter += 1
            name = f"{base_name} ({counter})"

    async def _write_soul_md(self, agent_name: str, content: str):
        agent_dir_name = agent_name.lower()
        workspace = os.path.join(OPENCLAW_WORKSPACE_BASE, agent_dir_name)
        os.makedirs(workspace, exist_ok=True)
        with open(os.path.join(workspace, "SOUL.md"), "w") as f:
            f.write(content)

    async def _install_agent_skill(self, org_id: int, agent_id: int, skill_slug: str, user_id: int):
        from app.models.skill import Skill
        # Check if skill already exists locally
        stmt = select(Skill).where(Skill.org_id == org_id, Skill.slug == skill_slug)
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            await self.skill_service.assign_skill(agent_id, existing.id, user_id)
            return

        # Try to install from marketplace
        try:
            install_result = await self.install_skill_template(org_id, user_id, skill_slug)
            skill_id = install_result["skill_id"]
            await self.skill_service.assign_skill(agent_id, skill_id, user_id)
        except Exception:
            pass
