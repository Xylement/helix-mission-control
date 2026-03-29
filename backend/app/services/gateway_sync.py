import logging
import os
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_value
from app.core.config import settings
from app.models.organization_settings import OrganizationSettings

logger = logging.getLogger("helix.gateway_sync")


async def get_org_settings(db: AsyncSession, org_id: int) -> OrganizationSettings | None:
    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.org_id == org_id)
    )
    return result.scalar_one_or_none()


def _update_env_file(updates: dict[str, str]):
    """Update .env file with new key-value pairs."""
    env_path = os.environ.get("ENV_FILE_PATH", "/home/helix/helix-mission-control/.env")
    if not os.path.exists(env_path):
        logger.warning("No .env file found at %s", env_path)
        return

    lines = []
    with open(env_path, "r") as f:
        lines = f.readlines()

    updated_keys = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}\n")
                updated_keys.add(key)
                continue
        new_lines.append(line)

    # Add any keys not found
    for key, value in updates.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}\n")

    with open(env_path, "w") as f:
        f.writelines(new_lines)


async def sync_gateway_config(db: AsyncSession, org_id: int):
    """Sync model settings to .env and restart gateway container."""
    org_settings = await get_org_settings(db, org_id)
    if not org_settings or not org_settings.model_api_key_encrypted:
        return

    try:
        api_key = decrypt_value(org_settings.model_api_key_encrypted)
    except Exception as e:
        logger.error("Failed to decrypt API key: %s", e)
        return

    env_updates = {
        "MODEL_PROVIDER": org_settings.model_provider or "moonshot",
        "MODEL_NAME": org_settings.model_name or "kimi-k2.5",
        "MODEL_API_KEY": api_key,
        "MODEL_BASE_URL": org_settings.model_base_url or "",
    }

    try:
        _update_env_file(env_updates)
    except Exception as e:
        logger.error("Failed to update .env file: %s", e)
        return

    # Restart gateway container to pick up new config
    try:
        compose_dir = os.environ.get("COMPOSE_PROJECT_DIR", "/home/helix/helix-mission-control")
        subprocess.run(
            ["docker", "compose", "restart", "gateway"],
            cwd=compose_dir,
            timeout=30,
            check=True,
            capture_output=True,
        )
        logger.info("Gateway restarted with new model config")
    except Exception as e:
        logger.error("Failed to restart gateway: %s", e)
