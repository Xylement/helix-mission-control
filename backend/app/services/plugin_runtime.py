"""
Plugin runtime — install, configure, execute capabilities, test connections, agent assignments.
"""
import base64
import json
import logging
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, func as sqlfunc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plugin import InstalledPlugin, AgentPlugin, PluginExecution
from app.utils.crypto import encrypt_credentials, decrypt_credentials, mask_credentials
from app.services.license_service import LicenseService

logger = logging.getLogger("helix.plugins")

PLUGIN_PLANS = {"pro", "scale", "enterprise", "managed_business", "managed_enterprise"}
PLUGIN_LIMITS = {"pro": 3, "scale": 10, "enterprise": 9999, "managed_business": 10, "managed_enterprise": 9999}

SENSITIVE_KEYS = {"password", "key", "secret", "token", "api_key", "apikey", "access_token"}


def _sanitize_for_log(data: dict | None) -> dict | None:
    if not data:
        return data
    sanitized = {}
    for k, v in data.items():
        if any(s in k.lower() for s in SENSITIVE_KEYS):
            sanitized[k] = "****"
        else:
            sanitized[k] = v
    return sanitized


def _truncate_response(data: dict | str | None, max_len: int = 2000) -> dict | None:
    if data is None:
        return None
    s = json.dumps(data) if isinstance(data, dict) else str(data)
    if len(s) > max_len:
        return {"_truncated": True, "preview": s[:max_len]}
    return data if isinstance(data, dict) else {"raw": s}


class PluginRuntime:
    def __init__(self, db: AsyncSession, license_service: LicenseService | None = None):
        self.db = db
        self.license_service = license_service

    # ─── Feature gate ───

    async def _check_plugin_feature(self):
        if not self.license_service:
            return
        plan_info = await self.license_service.get_plan()
        plan = plan_info.get("plan", "")
        features = plan_info.get("limits", {}).get("features", [])
        if "plugins" in features or plan in PLUGIN_PLANS:
            return
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail={
            "error": "feature_not_available",
            "feature": "plugins",
            "required_plan": "pro",
        })

    async def _check_plugin_limit(self, org_id: int):
        if not self.license_service:
            return
        plan_info = await self.license_service.get_plan()
        plan = plan_info.get("plan", "")
        max_plugins = PLUGIN_LIMITS.get(plan, 0)
        if max_plugins == 0 and plan not in PLUGIN_PLANS:
            max_plugins = 0  # no plugins on trial/starter
        current = await self._count_active(org_id)
        if current >= max_plugins:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail={
                "error": "plugin_limit",
                "message": f"You've reached the {max_plugins}-plugin limit on your {plan} plan.",
                "limit": max_plugins,
                "current": current,
            })

    async def _count_active(self, org_id: int) -> int:
        stmt = select(sqlfunc.count()).select_from(InstalledPlugin).where(
            InstalledPlugin.org_id == org_id,
            InstalledPlugin.is_active == True,
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    # ─── Install ───

    async def install_plugin(
        self, org_id: int, manifest: dict, template_slug: str | None, installed_by: int
    ) -> InstalledPlugin:
        await self._check_plugin_feature()
        await self._check_plugin_limit(org_id)

        slug = manifest.get("slug", template_slug or "unknown")
        name = manifest.get("name", slug)

        # Ensure every capability has an id
        for i, cap in enumerate(manifest.get("capabilities", [])):
            if not cap.get("id"):
                cap["id"] = cap.get("name", "").lower().replace(" ", "_") or f"cap_{i}"

        # Check if previously installed (inactive) — reactivate
        stmt = select(InstalledPlugin).where(
            InstalledPlugin.org_id == org_id,
            InstalledPlugin.plugin_slug == slug,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            if existing.is_active:
                from fastapi import HTTPException
                raise HTTPException(status_code=409, detail="Plugin already installed")
            existing.is_active = True
            existing.manifest = manifest
            existing.name = name
            existing.emoji = manifest.get("emoji", "🔌")
            existing.description = manifest.get("description")
            existing.plugin_type = manifest.get("type", "api_connector")
            existing.installed_by = installed_by
            existing.is_configured = False
            existing.credentials_encrypted = None
            existing.settings = None
            self.db.add(existing)
            await self.db.flush()
            return existing

        plugin = InstalledPlugin(
            org_id=org_id,
            plugin_slug=slug,
            name=name,
            emoji=manifest.get("emoji", "🔌"),
            description=manifest.get("description"),
            plugin_type=manifest.get("type", "api_connector"),
            manifest=manifest,
            marketplace_template_slug=template_slug,
            installed_by=installed_by,
        )

        # If no settings required, auto-configure
        setting_defs = manifest.get("setting_definitions", [])
        has_required = any(s.get("required") for s in setting_defs)
        if not setting_defs or not has_required:
            plugin.is_configured = True

        self.db.add(plugin)
        await self.db.flush()
        return plugin

    # ─── Configure ───

    async def configure_plugin(
        self, plugin_id: int, org_id: int,
        credentials: dict | None = None, settings: dict | None = None,
    ) -> InstalledPlugin:
        plugin = await self._get_plugin(plugin_id, org_id)

        if credentials:
            plugin.credentials_encrypted = encrypt_credentials(org_id, credentials)

        if settings is not None:
            plugin.settings = settings

        plugin.is_configured = True
        self.db.add(plugin)
        await self.db.flush()
        return plugin

    # ─── Execute ───

    async def execute_capability(
        self, plugin_id: int, org_id: int,
        capability_id: str, parameters: dict | None = None,
        agent_id: int | None = None,
    ) -> PluginExecution:
        plugin = await self._get_plugin(plugin_id, org_id)

        if not plugin.is_configured:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Plugin not configured. Set credentials first.")

        # Find capability in manifest
        capabilities = plugin.manifest.get("capabilities", [])
        capability = None
        for cap in capabilities:
            if cap.get("id") == capability_id:
                capability = cap
                break

        if not capability:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Capability '{capability_id}' not found")

        # Decrypt credentials
        creds = {}
        if plugin.credentials_encrypted:
            try:
                creds = decrypt_credentials(org_id, plugin.credentials_encrypted)
            except Exception:
                return await self._log_execution(
                    org_id, plugin_id, agent_id, capability_id,
                    capability.get("name"), parameters, None,
                    "error", "Failed to decrypt credentials", 0,
                )

        # Build request
        auth_config = plugin.manifest.get("auth", {})
        base_url = plugin.manifest.get("base_url", "")
        endpoint = capability.get("endpoint", "")
        method = capability.get("method", "GET").upper()
        url = f"{base_url}{endpoint}"

        # Substitute variables in URL
        merged_params = {**(plugin.settings or {}), **(creds), **(parameters or {})}
        for k, v in merged_params.items():
            url = url.replace(f"{{{k}}}", str(v))

        headers = self._build_auth_headers(auth_config, creds)
        headers["User-Agent"] = "HELIX-Plugin/1.0"

        # Build request body/params
        query_params = {}
        body = None
        if method in ("GET", "DELETE"):
            query_params = parameters or {}
        else:
            body = parameters

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    method, url, headers=headers,
                    params=query_params if method in ("GET", "DELETE") else None,
                    json=body if method not in ("GET", "DELETE") else None,
                )
                duration_ms = int((time.monotonic() - start) * 1000)

                if resp.status_code >= 400:
                    error_text = resp.text[:500]
                    return await self._log_execution(
                        org_id, plugin_id, agent_id, capability_id,
                        capability.get("name"), _sanitize_for_log(parameters),
                        {"status_code": resp.status_code, "error": error_text},
                        "error", f"HTTP {resp.status_code}: {error_text}", duration_ms,
                    )

                try:
                    response_data = resp.json()
                except Exception:
                    response_data = {"raw": resp.text[:2000]}

                execution = await self._log_execution(
                    org_id, plugin_id, agent_id, capability_id,
                    capability.get("name"), _sanitize_for_log(parameters),
                    _truncate_response(response_data), "success", None, duration_ms,
                )

                # Update last_used_at
                plugin.last_used_at = datetime.now(timezone.utc)
                self.db.add(plugin)
                await self.db.flush()
                return execution

        except httpx.TimeoutException:
            duration_ms = int((time.monotonic() - start) * 1000)
            return await self._log_execution(
                org_id, plugin_id, agent_id, capability_id,
                capability.get("name"), _sanitize_for_log(parameters),
                None, "timeout", "Request timed out (30s)", duration_ms,
            )
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            logger.error("Plugin execution error: %s", e)
            return await self._log_execution(
                org_id, plugin_id, agent_id, capability_id,
                capability.get("name"), _sanitize_for_log(parameters),
                None, "error", str(e)[:500], duration_ms,
            )

    # ─── Test connection ───

    async def test_connection(self, plugin_id: int, org_id: int) -> dict:
        plugin = await self._get_plugin(plugin_id, org_id)

        if not plugin.is_configured:
            return {"success": False, "message": "Plugin not configured yet", "duration_ms": 0}

        capabilities = plugin.manifest.get("capabilities", [])

        # Find a good test capability: prefer GET, or one named "test"/"health"
        test_cap = None
        for cap in capabilities:
            cap_id = cap.get("id", "").lower()
            if "test" in cap_id or "health" in cap_id or "ping" in cap_id:
                test_cap = cap
                break
        if not test_cap:
            for cap in capabilities:
                if cap.get("method", "GET").upper() == "GET":
                    test_cap = cap
                    break
        if not test_cap and capabilities:
            test_cap = capabilities[0]

        if not test_cap:
            return {"success": False, "message": "No capabilities to test", "duration_ms": 0}

        execution = await self.execute_capability(
            plugin_id, org_id, test_cap["id"], {}, None,
        )
        return {
            "success": execution.status == "success",
            "message": execution.error_message or "Connection successful",
            "duration_ms": execution.duration_ms or 0,
        }

    # ─── Agent capabilities ───

    async def get_agent_capabilities(self, agent_id: int, org_id: int) -> list[dict]:
        stmt = select(AgentPlugin).where(AgentPlugin.agent_id == agent_id)
        result = await self.db.execute(stmt)
        assignments = result.scalars().all()

        caps = []
        for ap in assignments:
            plugin = await self.db.get(InstalledPlugin, ap.plugin_id)
            if not plugin or not plugin.is_active or plugin.org_id != org_id:
                continue
            manifest_caps = plugin.manifest.get("capabilities", [])
            allowed = ap.capabilities or []
            for i, mc in enumerate(manifest_caps):
                if allowed and mc.get("id") not in allowed:
                    continue
                caps.append({
                    "plugin_id": plugin.id,
                    "plugin_name": plugin.name,
                    "plugin_emoji": plugin.emoji,
                    "capability_id": mc.get("id") or mc.get("name", "").lower().replace(" ", "_") or f"cap_{i}",
                    "capability_name": mc.get("name"),
                    "description": mc.get("description"),
                    "method": mc.get("method"),
                })
        return caps

    # ─── Agent assignment CRUD ───

    async def assign_plugin_to_agent(
        self, agent_id: int, plugin_id: int, org_id: int,
        capabilities: list[str] | None = None,
    ) -> AgentPlugin:
        plugin = await self._get_plugin(plugin_id, org_id)

        # Check if already assigned
        stmt = select(AgentPlugin).where(
            AgentPlugin.agent_id == agent_id,
            AgentPlugin.plugin_id == plugin_id,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            existing.capabilities = capabilities or []
            self.db.add(existing)
            await self.db.flush()
            return existing

        ap = AgentPlugin(
            agent_id=agent_id,
            plugin_id=plugin_id,
            capabilities=capabilities or [],
        )
        self.db.add(ap)
        await self.db.flush()
        return ap

    async def remove_plugin_from_agent(self, agent_id: int, plugin_id: int):
        stmt = delete(AgentPlugin).where(
            AgentPlugin.agent_id == agent_id,
            AgentPlugin.plugin_id == plugin_id,
        )
        await self.db.execute(stmt)
        await self.db.flush()

    async def get_agent_plugins(self, agent_id: int, org_id: int) -> list[dict]:
        stmt = select(AgentPlugin).where(AgentPlugin.agent_id == agent_id)
        result = await self.db.execute(stmt)
        assignments = result.scalars().all()

        items = []
        for ap in assignments:
            plugin = await self.db.get(InstalledPlugin, ap.plugin_id)
            if not plugin or not plugin.is_active or plugin.org_id != org_id:
                continue
            manifest_caps = plugin.manifest.get("capabilities", [])
            items.append({
                "id": ap.id,
                "agent_id": ap.agent_id,
                "plugin_id": ap.plugin_id,
                "plugin_name": plugin.name,
                "plugin_emoji": plugin.emoji,
                "plugin_slug": plugin.plugin_slug,
                "is_configured": plugin.is_configured,
                "capabilities": ap.capabilities,
                "available_capabilities": [
                    {
                        "id": c.get("id") or c.get("name", "").lower().replace(" ", "_") or f"cap_{i}",
                        "name": c.get("name"),
                        "description": c.get("description"),
                        "method": c.get("method"),
                        "parameters": c.get("parameters"),
                    }
                    for i, c in enumerate(manifest_caps)
                ],
            })
        return items

    # ─── Uninstall ───

    async def uninstall_plugin(self, plugin_id: int, org_id: int):
        plugin = await self._get_plugin(plugin_id, org_id)
        plugin.is_active = False
        self.db.add(plugin)

        # Remove agent assignments
        stmt = delete(AgentPlugin).where(AgentPlugin.plugin_id == plugin_id)
        await self.db.execute(stmt)
        await self.db.flush()

    # ─── Query ───

    async def list_installed(self, org_id: int) -> list[dict]:
        stmt = select(InstalledPlugin).where(
            InstalledPlugin.org_id == org_id,
            InstalledPlugin.is_active == True,
        ).order_by(InstalledPlugin.installed_at.desc())
        result = await self.db.execute(stmt)
        plugins = result.scalars().all()
        return [await self._plugin_to_response(p) for p in plugins]

    async def get_plugin_detail(self, plugin_id: int, org_id: int) -> dict:
        plugin = await self._get_plugin(plugin_id, org_id)
        return await self._plugin_to_response(plugin)

    async def list_executions(
        self, plugin_id: int, org_id: int, limit: int = 50,
    ) -> list[dict]:
        stmt = select(PluginExecution).where(
            PluginExecution.plugin_id == plugin_id,
            PluginExecution.org_id == org_id,
        ).order_by(PluginExecution.executed_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        execs = result.scalars().all()
        return [
            {
                "id": e.id,
                "plugin_id": e.plugin_id,
                "agent_id": e.agent_id,
                "capability_id": e.capability_id,
                "capability_name": e.capability_name,
                "status": e.status,
                "error_message": e.error_message,
                "duration_ms": e.duration_ms,
                "executed_at": e.executed_at,
                "request_data": e.request_data,
                "response_summary": e.response_summary,
            }
            for e in execs
        ]

    # ─── Helpers ───

    async def _get_plugin(self, plugin_id: int, org_id: int) -> InstalledPlugin:
        plugin = await self.db.get(InstalledPlugin, plugin_id)
        if not plugin or plugin.org_id != org_id or not plugin.is_active:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Plugin not found")
        return plugin

    def _build_auth_headers(self, auth_config: dict, creds: dict) -> dict:
        headers = {}
        auth_type = auth_config.get("type", "")

        if auth_type == "api_key":
            header_name = auth_config.get("header", "Authorization")
            prefix = auth_config.get("prefix", "")
            key_field = auth_config.get("key_field", "api_key")
            key_value = creds.get(key_field, "")
            headers[header_name] = f"{prefix}{key_value}" if prefix else key_value

        elif auth_type == "bearer":
            token_field = auth_config.get("token_field", "access_token")
            token = creds.get(token_field, "")
            headers["Authorization"] = f"Bearer {token}"

        elif auth_type == "basic":
            username_field = auth_config.get("username_field", "username")
            password_field = auth_config.get("password_field", "password")
            username = creds.get(username_field, "")
            password = creds.get(password_field, "")
            encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"

        return headers

    async def _log_execution(
        self, org_id, plugin_id, agent_id, capability_id,
        capability_name, request_data, response_summary,
        status, error_message, duration_ms,
    ) -> PluginExecution:
        execution = PluginExecution(
            org_id=org_id,
            plugin_id=plugin_id,
            agent_id=agent_id,
            capability_id=capability_id,
            capability_name=capability_name,
            request_data=request_data,
            response_summary=response_summary,
            status=status,
            error_message=error_message,
            duration_ms=duration_ms,
        )
        self.db.add(execution)
        await self.db.flush()
        return execution

    async def _plugin_to_response(self, plugin: InstalledPlugin) -> dict:
        manifest = plugin.manifest or {}
        capabilities = manifest.get("capabilities", [])
        setting_defs = manifest.get("setting_definitions", [])

        # Masked credentials
        masked = None
        if plugin.credentials_encrypted:
            try:
                creds = decrypt_credentials(plugin.org_id, plugin.credentials_encrypted)
                masked = mask_credentials(creds)
            except Exception:
                masked = {"_error": "Could not decrypt"}

        # Count connected agents
        stmt = select(sqlfunc.count()).select_from(AgentPlugin).where(
            AgentPlugin.plugin_id == plugin.id
        )
        result = await self.db.execute(stmt)
        agent_count = result.scalar() or 0

        return {
            "id": plugin.id,
            "plugin_slug": plugin.plugin_slug,
            "name": plugin.name,
            "emoji": plugin.emoji,
            "description": plugin.description,
            "plugin_type": plugin.plugin_type,
            "is_active": plugin.is_active,
            "is_configured": plugin.is_configured,
            "marketplace_template_slug": plugin.marketplace_template_slug,
            "installed_by": plugin.installed_by,
            "installed_at": plugin.installed_at,
            "last_used_at": plugin.last_used_at,
            "capabilities": [
                {
                    "id": c.get("id") or c.get("name", "").lower().replace(" ", "_") or f"cap_{i}",
                    "name": c.get("name"),
                    "description": c.get("description"),
                    "method": c.get("method"),
                    "parameters": c.get("parameters"),
                }
                for i, c in enumerate(capabilities)
            ],
            "setting_definitions": [
                {
                    "key": s.get("key"),
                    "label": s.get("label", s.get("key")),
                    "type": s.get("type", "string"),
                    "required": s.get("required", False),
                    "description": s.get("description"),
                    "default": s.get("default"),
                }
                for s in setting_defs
            ],
            "masked_credentials": masked,
            "settings": plugin.settings,
            "connected_agent_count": agent_count,
        }
