"""
Workflow install service — downloads manifest from marketplace,
maps agent templates to local agents, creates Workflow + Steps.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import Workflow, WorkflowStep
from app.models.agent import Agent
from app.services.marketplace_service import MarketplaceService
from app.services.license_service import LicenseService

logger = logging.getLogger("helix.workflow_install")

PLAN_ORDER = {"trial": 0, "starter": 1, "pro": 2, "scale": 3, "enterprise": 4}


class WorkflowInstallService:
    def __init__(self, db: AsyncSession, marketplace: MarketplaceService, license_service: LicenseService):
        self.db = db
        self.marketplace = marketplace
        self.license_service = license_service

    async def install(
        self, org_id: int, user_id: int, template_slug: str, agent_mapping: dict | None = None
    ) -> dict:
        from app.services.install_service import _normalize_workflow_manifest

        manifest = await self.marketplace.get_manifest(template_slug)
        if manifest.get("type") != "workflow":
            raise ValueError("Not a workflow template")

        manifest = _normalize_workflow_manifest(manifest)
        wf_config = manifest.get("workflow_config", {})
        requirements = manifest.get("requirements", {})

        # Plan check
        min_plan = requirements.get("min_plan", "pro")
        plan_info = await self.license_service.get_plan()
        plan = plan_info.get("plan", "trial")
        if PLAN_ORDER.get(plan, 0) < PLAN_ORDER.get(min_plan, 0):
            raise PermissionError(f"Requires {min_plan} plan or higher")

        features = plan_info.get("limits", {}).get("features", [])
        if "workflow_builder" not in features:
            raise PermissionError("Workflow builder not available on your plan")

        # Install limit
        current = await self.marketplace.get_installed_count(org_id, "workflow")
        limits = plan_info.get("limits", {})
        max_inst = limits.get("marketplace_workflow_installs", 0)
        if isinstance(max_inst, dict):
            max_inst = max_inst.get("limit", 0)
        if max_inst > 0 and current >= max_inst:
            raise PermissionError(f"Workflow install limit reached ({max_inst})")

        # Map agents
        resolved = {}
        for agent_slug in wf_config.get("required_agents", []):
            if agent_mapping and agent_slug in agent_mapping:
                resolved[agent_slug] = int(agent_mapping[agent_slug])
            else:
                stmt = select(Agent).where(
                    Agent.org_id == org_id,
                    Agent.marketplace_template_slug == agent_slug,
                )
                r = await self.db.execute(stmt)
                local = r.scalar_one_or_none()
                if local:
                    resolved[agent_slug] = local.id

        # Create Workflow
        workflow = Workflow(
            org_id=org_id,
            name=manifest.get("name", "Imported Workflow"),
            description=manifest.get("description", ""),
            trigger_type=wf_config.get("trigger", "manual"),
            marketplace_template_slug=template_slug,
            created_by=user_id,
        )
        self.db.add(workflow)
        await self.db.flush()

        steps_config = wf_config.get("steps", [])
        for i, sc in enumerate(steps_config):
            agent_tmpl = sc.get("agent_template")
            agent_id = resolved.get(agent_tmpl) if agent_tmpl else None
            step = WorkflowStep(
                workflow_id=workflow.id,
                step_id=sc.get("id", f"step_{i}"),
                name=sc.get("name", f"Step {i+1}"),
                agent_id=agent_id,
                action_prompt=sc.get("action", ""),
                depends_on=sc.get("depends_on", []),
                timeout_minutes=sc.get("timeout_minutes", 60),
                requires_approval=sc.get("requires_approval", False),
                step_order=i,
                position_x=150 + (i % 3) * 300,
                position_y=100 + (i // 3) * 200,
            )
            self.db.add(step)

        # Record install (Batch 2 infrastructure)
        await self.marketplace.record_install(
            org_id=org_id,
            template_slug=template_slug,
            template_type="workflow",
            template_name=manifest.get("name", ""),
            template_version=manifest.get("version", "1.0.0"),
            manifest=manifest,
            local_resource_id=workflow.id,
            local_resource_type="workflow",
            installed_by=user_id,
        )
        await self.marketplace.log_install_to_registry(template_slug)
        await self.db.commit()

        unmapped = [s for s in wf_config.get("required_agents", []) if s not in resolved]
        return {
            "success": True,
            "workflow_id": workflow.id,
            "workflow_name": workflow.name,
            "steps_created": len(steps_config),
            "agents_mapped": len(resolved),
            "agents_unmapped": unmapped,
            "template_slug": template_slug,
        }
