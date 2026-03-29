"""
License client — validates against api.helixnode.tech and enforces plan limits.
"""
import json
import os
import uuid
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

LICENSE_SERVER_URL = os.getenv("LICENSE_SERVER_URL", "https://api.helixnode.tech")
LICENSE_KEY = os.getenv("LICENSE_KEY", "")
INSTANCE_ID = None  # Generated on first run, stored in DB
OFFLINE_CACHE_HOURS = 72


class LicenseService:
    """Manages license validation, caching, and limit enforcement."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_effective_license_key(self) -> str:
        """Get license key from env first, then fall back to DB."""
        if LICENSE_KEY:
            return LICENSE_KEY
        # Fall back to key stored in license_cache (set during onboarding)
        try:
            result = await self.db.execute(text(
                "SELECT license_key_prefix FROM license_cache WHERE id = 1"
            ))
            row = result.fetchone()
            if row and row.license_key_prefix and len(row.license_key_prefix) > 8:
                return row.license_key_prefix  # Full key stored here during onboarding
        except Exception:
            pass
        return ""

    async def save_license_key(self, key: str):
        """Save a license key to DB so it persists across restarts."""
        await self.db.execute(text("""
            INSERT INTO license_cache (id, license_key_prefix, plan, status, max_agents, max_members,
                features, last_validated_at)
            VALUES (1, :key, 'pending', 'pending', 0, 0, '[]'::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET license_key_prefix = :key
        """), {"key": key})
        await self.db.commit()

    async def get_instance_id(self) -> str:
        """Get or create a persistent instance ID for this installation."""
        global INSTANCE_ID
        if INSTANCE_ID:
            return INSTANCE_ID

        # Generate a deterministic UUID from the org id
        result = await self.db.execute(text("SELECT id FROM organizations LIMIT 1"))
        row = result.fetchone()
        if row:
            INSTANCE_ID = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"helix-mc-org-{row[0]}"))
        else:
            INSTANCE_ID = str(uuid.uuid4())
        return INSTANCE_ID

    async def validate(self) -> dict:
        """
        Validate license against the license server.
        Called on startup and every 24h.
        Returns cached plan info.
        """
        effective_key = await self._get_effective_license_key()
        if not effective_key:
            logger.warning("No LICENSE_KEY configured — running in unlicensed mode")
            return self._default_plan()

        instance_id = await self.get_instance_id()

        agent_count = (await self.db.execute(text("SELECT COUNT(*) FROM agents"))).scalar() or 0
        member_count = (await self.db.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0

        # Read current version from VERSION file
        current_version = "1.0.0"
        for version_path in ["/app/VERSION", os.path.join(os.path.dirname(__file__), "..", "..", "VERSION"), "VERSION"]:
            try:
                with open(version_path, "r") as f:
                    current_version = f.read().strip()
                break
            except FileNotFoundError:
                continue

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{LICENSE_SERVER_URL}/v1/licenses/validate",
                    json={
                        "license_key": effective_key,
                        "instance_id": instance_id,
                        "version": current_version,
                        "current_agents": agent_count,
                        "current_members": member_count,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    try:
                        await self._cache_response(data, effective_key)
                    except Exception as cache_err:
                        logger.error(f"Failed to cache license response: {cache_err}")
                        await self.db.rollback()
                    logger.info(f"License validated: plan={data.get('plan')} status={data.get('status')}")
                    return data
                else:
                    logger.error(f"License validation failed: {resp.status_code} {resp.text}")
                    return await self._get_cached_or_default()

        except Exception as e:
            logger.error(f"License server unreachable: {e}")
            await self.db.rollback()
            return await self._get_cached_or_default()

    async def get_plan(self) -> dict:
        """Get current plan info from cache. Does NOT call the license server."""
        plan = await self._get_cached_or_default()
        effective_key = await self._get_effective_license_key()
        if effective_key:
            plan["license_key"] = effective_key
        # Check if this license has a Stripe subscription linked
        plan["has_stripe"] = await self._has_stripe_subscription()
        return plan

    async def _has_stripe_subscription(self) -> bool:
        """Check if the cached license response indicates a Stripe subscription."""
        try:
            result = await self.db.execute(text(
                "SELECT cached_response FROM license_cache WHERE id = 1"
            ))
            row = result.fetchone()
            if row and row.cached_response:
                cached = row.cached_response if isinstance(row.cached_response, dict) else json.loads(row.cached_response)
                return bool(
                    cached.get("stripe_customer_id")
                    or cached.get("stripe_subscription_id")
                    or cached.get("has_stripe")
                )
        except Exception as e:
            logger.debug(f"Error checking Stripe status: {e}")
        return False

    async def can_create_agent(self) -> tuple[bool, dict | None]:
        """Check if the org can create another agent."""
        plan = await self.get_plan()
        if not plan.get("valid", False):
            return False, {
                "error": "license_invalid",
                "message": plan.get("message", "License is not valid. Please activate a license."),
            }

        max_agents = plan.get("limits", {}).get("max_agents", 0)
        current = (await self.db.execute(text("SELECT COUNT(*) FROM agents"))).scalar() or 0

        if current >= max_agents:
            if max_agents <= 5:
                upgrade_to = "pro"
            elif max_agents <= 15:
                upgrade_to = "scale"
            else:
                upgrade_to = "enterprise"

            return False, {
                "error": "agent_limit",
                "message": f"You've reached the {max_agents}-agent limit on your {plan.get('plan', '')} plan.",
                "limit": max_agents,
                "current": current,
                "upgrade_to": upgrade_to,
            }

        return True, None

    async def can_invite_member(self) -> tuple[bool, dict | None]:
        """Check if the org can invite another team member."""
        plan = await self.get_plan()
        if not plan.get("valid", False):
            return False, {
                "error": "license_invalid",
                "message": plan.get("message", "License is not valid."),
            }

        max_members = plan.get("limits", {}).get("max_members", 0)
        current = (await self.db.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0

        if current >= max_members:
            if max_members <= 3:
                upgrade_to = "pro"
            elif max_members <= 10:
                upgrade_to = "scale"
            else:
                upgrade_to = "enterprise"

            return False, {
                "error": "member_limit",
                "message": f"You've reached the {max_members}-member limit on your {plan.get('plan', '')} plan.",
                "limit": max_members,
                "current": current,
                "upgrade_to": upgrade_to,
            }

        return True, None

    async def has_feature(self, feature: str) -> bool:
        """Check if the current plan includes a feature."""
        plan = await self.get_plan()
        features = plan.get("limits", {}).get("features", [])
        return feature in features

    # === Cache Management ===

    @staticmethod
    def _parse_dt(value) -> datetime | None:
        """Parse an ISO datetime string to a datetime object, or return None."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt
        except (ValueError, AttributeError):
            return None

    async def _cache_response(self, data: dict, effective_key: str = ""):
        """Store license server response in local DB cache."""
        limits = data.get("limits", {})
        now = datetime.now(timezone.utc)

        features_json = json.dumps(limits.get("features", []))
        response_json = json.dumps(data)

        key_for_storage = effective_key or LICENSE_KEY
        # Store full key (not just prefix) so DB fallback works when env var is empty
        key_value = key_for_storage if key_for_storage else ""

        await self.db.execute(text("""
            INSERT INTO license_cache (id, license_key_prefix, plan, status, max_agents, max_members,
                features, trial, trial_ends_at, current_period_end, grace_period_ends, message, last_validated_at, cached_response)
            VALUES (1, :prefix, :plan, :status, :max_agents, :max_members,
                CAST(:features AS jsonb), :trial, :trial_end, :period_end, :grace_end, :message, :validated_at, CAST(:response AS jsonb))
            ON CONFLICT (id) DO UPDATE SET
                license_key_prefix = :prefix, plan = :plan, status = :status, max_agents = :max_agents, max_members = :max_members,
                features = CAST(:features AS jsonb), trial = :trial, trial_ends_at = :trial_end,
                current_period_end = :period_end, grace_period_ends = :grace_end,
                message = :message, last_validated_at = :validated_at, cached_response = CAST(:response AS jsonb)
        """), {
            "prefix": key_value,
            "plan": data.get("plan", "none"),
            "status": data.get("status", "unknown"),
            "max_agents": limits.get("max_agents", 0),
            "max_members": limits.get("max_members", 0),
            "features": features_json,
            "trial": bool(data.get("trial", False)),
            "trial_end": self._parse_dt(data.get("trial_ends_at")),
            "period_end": self._parse_dt(data.get("expires_at")),
            "grace_end": self._parse_dt(data.get("grace_period_ends")),
            "message": data.get("message"),
            "validated_at": now,
            "response": response_json,
        })
        await self.db.commit()

    async def _get_cached_or_default(self) -> dict:
        """Get cached license info, or return default if no cache."""
        try:
            result = await self.db.execute(text("SELECT * FROM license_cache WHERE id = 1"))
            row = result.fetchone()
            if row:
                last_validated = row.last_validated_at
                if last_validated:
                    if isinstance(last_validated, str):
                        last_validated = datetime.fromisoformat(last_validated)
                    if last_validated.tzinfo is None:
                        last_validated = last_validated.replace(tzinfo=timezone.utc)
                    age_hours = (datetime.now(timezone.utc) - last_validated).total_seconds() / 3600

                    if age_hours <= OFFLINE_CACHE_HOURS:
                        features = row.features if isinstance(row.features, list) else []
                        return {
                            "valid": row.status == "active",
                            "plan": row.plan,
                            "limits": {
                                "max_agents": row.max_agents,
                                "max_members": row.max_members,
                                "features": features,
                            },
                            "status": row.status,
                            "message": row.message,
                            "expires_at": str(row.current_period_end) if row.current_period_end else None,
                            "trial": bool(row.trial) if row.trial is not None else False,
                            "trial_ends_at": str(row.trial_ends_at) if row.trial_ends_at else None,
                            "grace_period_ends": str(row.grace_period_ends) if row.grace_period_ends else None,
                        }
                    else:
                        logger.warning(f"License cache expired ({age_hours:.0f}h old). Offline too long.")
                        return self._expired_cache_plan(row)
        except Exception as e:
            logger.error(f"Error reading license cache: {e}")

        return self._default_plan()

    def _default_plan(self) -> dict:
        """Default plan when no license is configured — no access until activated."""
        return {
            "valid": False,
            "plan": "none",
            "limits": {"max_agents": 0, "max_members": 0, "features": []},
            "status": "no_license",
            "message": "No license configured. Please activate a license or start a free trial.",
        }

    def _expired_cache_plan(self, row) -> dict:
        """Plan when cache is too old (offline > 72h)."""
        return {
            "valid": True,  # Don't lock out — just warn
            "plan": row.plan,
            "limits": {
                "max_agents": row.max_agents,
                "max_members": row.max_members,
                "features": [],  # Disable gated features when offline too long
            },
            "status": "offline",
            "message": "Unable to verify license. Please check your internet connection.",
        }
