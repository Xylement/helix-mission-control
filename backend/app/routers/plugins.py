"""
Plugin management and agent-plugin assignment endpoints.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.plugin import (
    PluginInstallRequest, PluginSettingsUpdate, ExecuteCapabilityRequest,
    AgentPluginAssign, InstalledPluginResponse, AgentPluginResponse,
    AgentCapabilityResponse, PluginExecutionResponse, TestConnectionResult,
)
from app.services.plugin_runtime import PluginRuntime
from app.services.license_service import LicenseService

logger = logging.getLogger("helix.plugins")

router = APIRouter(prefix="/plugins", tags=["plugins"])
agent_plugin_router = APIRouter(tags=["plugins"])


def _get_org_id(user):
    return getattr(user, "org_id", None)


def _get_runtime(db: AsyncSession) -> PluginRuntime:
    license_svc = LicenseService(db)
    return PluginRuntime(db, license_svc)


# ─── Plugin CRUD ───

@router.get("", response_model=list[InstalledPluginResponse])
async def list_plugins(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    plugins = await runtime.list_installed(org_id)
    return plugins


@router.post("/install", response_model=InstalledPluginResponse, status_code=201)
async def install_plugin(
    body: PluginInstallRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)

    # Fetch manifest from marketplace
    from app.services.marketplace_service import MarketplaceService
    license_svc = LicenseService(db)
    marketplace = MarketplaceService(db, license_svc)

    try:
        manifest = await marketplace.get_manifest(body.template_slug)
    except Exception:
        raise HTTPException(status_code=404, detail="Plugin template not found in marketplace")

    plugin = await runtime.install_plugin(org_id, manifest, body.template_slug, user.id)

    # Record in marketplace installed templates
    try:
        template_info = await marketplace.get_template(body.template_slug)
        await marketplace.record_install(
            org_id=org_id,
            template_slug=body.template_slug,
            template_type="plugin",
            template_name=template_info.get("name", plugin.name),
            template_version=template_info.get("version", "1.0.0"),
            manifest=manifest,
            local_resource_id=plugin.id,
            local_resource_type="plugin",
            installed_by=user.id,
        )
        await marketplace.log_install_to_registry(body.template_slug)
    except Exception as e:
        logger.warning("Failed to record marketplace install: %s", e)

    await db.commit()
    return await runtime.get_plugin_detail(plugin.id, org_id)


@router.get("/{plugin_id}", response_model=InstalledPluginResponse)
async def get_plugin(
    plugin_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    return await runtime.get_plugin_detail(plugin_id, org_id)


@router.patch("/{plugin_id}", response_model=InstalledPluginResponse)
async def update_plugin_settings(
    plugin_id: int,
    body: PluginSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    await runtime.configure_plugin(plugin_id, org_id, body.credentials, body.settings)
    await db.commit()
    return await runtime.get_plugin_detail(plugin_id, org_id)


@router.delete("/{plugin_id}", status_code=204)
async def uninstall_plugin(
    plugin_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    await runtime.uninstall_plugin(plugin_id, org_id)
    await db.commit()


@router.post("/{plugin_id}/test", response_model=TestConnectionResult)
async def test_connection(
    plugin_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    result = await runtime.test_connection(plugin_id, org_id)
    await db.commit()
    return result


@router.post("/{plugin_id}/execute", response_model=PluginExecutionResponse)
async def execute_capability(
    plugin_id: int,
    body: ExecuteCapabilityRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    execution = await runtime.execute_capability(
        plugin_id, org_id, body.capability_id, body.parameters, body.agent_id,
    )
    await db.commit()
    return {
        "id": execution.id,
        "plugin_id": execution.plugin_id,
        "agent_id": execution.agent_id,
        "capability_id": execution.capability_id,
        "capability_name": execution.capability_name,
        "status": execution.status,
        "error_message": execution.error_message,
        "duration_ms": execution.duration_ms,
        "executed_at": execution.executed_at,
        "request_data": execution.request_data,
        "response_summary": execution.response_summary,
    }


@router.get("/{plugin_id}/executions", response_model=list[PluginExecutionResponse])
async def list_executions(
    plugin_id: int,
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    return await runtime.list_executions(plugin_id, org_id, limit)


# ─── Agent Plugin Endpoints ───

@agent_plugin_router.get("/agents/{agent_id}/plugins", response_model=list[AgentPluginResponse])
async def list_agent_plugins(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    return await runtime.get_agent_plugins(agent_id, org_id)


@agent_plugin_router.post("/agents/{agent_id}/plugins", response_model=AgentPluginResponse, status_code=201)
async def assign_plugin_to_agent(
    agent_id: int,
    body: AgentPluginAssign,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    await runtime.assign_plugin_to_agent(agent_id, body.plugin_id, org_id, body.capabilities)
    await db.commit()
    # Return the full list to find this one
    items = await runtime.get_agent_plugins(agent_id, org_id)
    for item in items:
        if item["plugin_id"] == body.plugin_id:
            return item
    return items[-1] if items else {}


@agent_plugin_router.delete("/agents/{agent_id}/plugins/{plugin_id}", status_code=204)
async def remove_plugin_from_agent(
    agent_id: int,
    plugin_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    await runtime.remove_plugin_from_agent(agent_id, plugin_id)
    await db.commit()


@agent_plugin_router.get("/agents/{agent_id}/capabilities", response_model=list[AgentCapabilityResponse])
async def get_agent_capabilities(
    agent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = _get_org_id(user)
    runtime = _get_runtime(db)
    return await runtime.get_agent_capabilities(agent_id, org_id)
