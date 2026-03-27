"""Version check service — reads current version and checks for updates."""

import json
import logging
import os
import time
from pathlib import Path

import httpx

logger = logging.getLogger("helix.version")

# Paths for version communication files
VERSION_FILE = Path("/app/VERSION")
DATA_DIR = Path("/app/data")
UPDATE_TRIGGER = DATA_DIR / ".update-trigger"
UPDATE_RESULT = DATA_DIR / ".update-result"
UPDATE_HISTORY = DATA_DIR / ".update-history"

LICENSE_SERVER_URL = os.environ.get("LICENSE_SERVER_URL", "https://api.helixnode.tech")

# In-memory cache
_version_cache: dict | None = None
_cache_timestamp: float = 0
CACHE_TTL = 6 * 3600  # 6 hours


def get_current_version() -> str:
    """Read current version from VERSION file."""
    try:
        if VERSION_FILE.exists():
            return VERSION_FILE.read_text().strip()
    except Exception as e:
        logger.warning("Failed to read VERSION file: %s", e)
    return "0.0.0"


def _compare_versions(current: str, latest: str) -> bool:
    """Return True if latest > current using semver comparison."""
    try:
        cur_parts = [int(x) for x in current.split(".")]
        lat_parts = [int(x) for x in latest.split(".")]
        # Pad to 3 parts
        while len(cur_parts) < 3:
            cur_parts.append(0)
        while len(lat_parts) < 3:
            lat_parts.append(0)
        return tuple(lat_parts) > tuple(cur_parts)
    except (ValueError, AttributeError):
        return False


async def check_for_updates(force: bool = False) -> dict:
    """Check license server for latest version. Cached for 6 hours."""
    global _version_cache, _cache_timestamp

    if not force and _version_cache and (time.time() - _cache_timestamp) < CACHE_TTL:
        return _version_cache

    current = get_current_version()
    result = {
        "current_version": current,
        "latest_version": current,
        "update_available": False,
        "changelog_url": None,
        "release_date": None,
        "message": None,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{LICENSE_SERVER_URL}/v1/version/latest")
            if resp.status_code == 200:
                data = resp.json()
                latest = data.get("version", current)
                result["latest_version"] = latest
                result["update_available"] = _compare_versions(current, latest)
                result["changelog_url"] = data.get("changelog_url")
                result["release_date"] = data.get("release_date")
                result["message"] = data.get("message") or None
    except Exception as e:
        logger.warning("Failed to check for updates: %s", e)

    _version_cache = result
    _cache_timestamp = time.time()
    return result


def clear_cache():
    """Clear the version check cache."""
    global _version_cache, _cache_timestamp
    _version_cache = None
    _cache_timestamp = 0


def get_update_status() -> dict | None:
    """Read the last update result from .update-result file."""
    try:
        if UPDATE_RESULT.exists():
            content = UPDATE_RESULT.read_text().strip()
            if content:
                return json.loads(content)
    except Exception as e:
        logger.warning("Failed to read update result: %s", e)
    return None


def get_update_history() -> list[dict]:
    """Read last 10 update results from .update-history file."""
    results = []
    try:
        if UPDATE_HISTORY.exists():
            lines = UPDATE_HISTORY.read_text().strip().split("\n")
            for line in reversed(lines):
                line = line.strip()
                if line:
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
                if len(results) >= 10:
                    break
    except Exception as e:
        logger.warning("Failed to read update history: %s", e)
    return results


def is_update_in_progress() -> bool:
    """Check if an update is currently in progress."""
    if UPDATE_TRIGGER.exists():
        return True
    status = get_update_status()
    if status and status.get("status") == "in_progress":
        return True
    return False


def write_update_trigger(target_version: str):
    """Write the .update-trigger file to signal the host updater daemon."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPDATE_TRIGGER.write_text(target_version)
    logger.info("Update trigger written for version %s", target_version)
