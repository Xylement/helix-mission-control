"""Backup service — creates, lists, and manages database + config backups."""

import asyncio
import logging
import os
import shutil
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.backup import Backup

logger = logging.getLogger("helix.backup")

BACKUP_DIR = Path("/home/helix/backups")
OPENCLAW_CONFIG = Path("/home/helix/.openclaw/openclaw.json")
OPENCLAW_WORKSPACE = Path("/home/helix/.openclaw/workspaces")


def _parse_database_url() -> dict:
    """Parse DATABASE_URL into pg_dump connection params."""
    url = os.environ.get("DATABASE_URL", "")
    # Convert asyncpg URL to regular postgres
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    parsed = urlparse(url)
    return {
        "host": parsed.hostname or "db",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "helix",
        "password": parsed.password or "",
        "dbname": parsed.path.lstrip("/") or "helix_mc",
    }


async def create_backup(db: AsyncSession, org_id: int, backup_type: str = "manual") -> Backup:
    """Create a full backup (pg_dump + openclaw config + workspaces)."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"helix-backup-{timestamp}.tar.gz"
    file_path = BACKUP_DIR / filename

    # Create backup record
    backup = Backup(
        org_id=org_id,
        filename=filename,
        file_path=str(file_path),
        backup_type=backup_type,
        status="in_progress",
    )
    db.add(backup)
    await db.commit()
    await db.refresh(backup)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            # 1. pg_dump
            db_params = _parse_database_url()
            sql_file = tmppath / "database.sql"
            env = os.environ.copy()
            env["PGPASSWORD"] = db_params["password"]
            proc = await asyncio.create_subprocess_exec(
                "pg_dump",
                "-h", db_params["host"],
                "-p", db_params["port"],
                "-U", db_params["user"],
                "-d", db_params["dbname"],
                "--no-owner",
                "--no-acl",
                "-f", str(sql_file),
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError(f"pg_dump failed: {stderr.decode()}")

            # 2. Copy openclaw.json
            if OPENCLAW_CONFIG.exists():
                shutil.copy2(str(OPENCLAW_CONFIG), str(tmppath / "openclaw.json"))

            # 3. Copy workspaces directory
            if OPENCLAW_WORKSPACE.exists():
                shutil.copytree(
                    str(OPENCLAW_WORKSPACE),
                    str(tmppath / "workspaces"),
                    dirs_exist_ok=True,
                )

            # 4. Package into tar.gz
            with tarfile.open(str(file_path), "w:gz") as tar:
                for item in tmppath.iterdir():
                    tar.add(str(item), arcname=item.name)

        # Update record with size and status
        file_size = file_path.stat().st_size
        backup.file_size_bytes = file_size
        backup.status = "completed"
        await db.commit()
        await db.refresh(backup)
        logger.info("Backup created: %s (%d bytes)", filename, file_size)
        return backup

    except Exception as e:
        backup.status = "failed"
        backup.error_message = str(e)[:1000]
        await db.commit()
        await db.refresh(backup)
        logger.error("Backup failed: %s", e)
        # Clean up partial file
        if file_path.exists():
            file_path.unlink()
        return backup


async def cleanup_old_backups(db: AsyncSession, org_id: int, retention_days: int):
    """Delete backups older than retention_days."""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        select(Backup).where(
            Backup.org_id == org_id,
            Backup.created_at < cutoff,
        )
    )
    old_backups = result.scalars().all()
    for b in old_backups:
        # Delete file
        try:
            p = Path(b.file_path)
            if p.exists():
                p.unlink()
        except Exception as e:
            logger.warning("Failed to delete backup file %s: %s", b.file_path, e)
        # Delete DB record
        await db.delete(b)
    if old_backups:
        await db.commit()
        logger.info("Cleaned up %d old backups for org %d", len(old_backups), org_id)


async def get_backup_list(db: AsyncSession, org_id: int, limit: int = 50, offset: int = 0):
    """Return list of backups ordered by newest first."""
    result = await db.execute(
        select(Backup)
        .where(Backup.org_id == org_id)
        .order_by(Backup.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


async def get_backup_count(db: AsyncSession, org_id: int) -> int:
    """Return total number of backups."""
    from sqlalchemy import func
    result = await db.execute(
        select(func.count()).select_from(Backup).where(Backup.org_id == org_id)
    )
    return result.scalar() or 0


async def get_backup_by_id(db: AsyncSession, backup_id: str, org_id: int) -> Backup | None:
    """Get a single backup by ID, scoped to org."""
    result = await db.execute(
        select(Backup).where(Backup.id == backup_id, Backup.org_id == org_id)
    )
    return result.scalar_one_or_none()


async def delete_backup(db: AsyncSession, backup: Backup):
    """Delete a backup file and DB record."""
    try:
        p = Path(backup.file_path)
        if p.exists():
            p.unlink()
    except Exception as e:
        logger.warning("Failed to delete backup file %s: %s", backup.file_path, e)
    await db.delete(backup)
    await db.commit()
