#!/bin/bash
#
# HELIX Mission Control — Restore Script
# Usage:
#   bash scripts/restore.sh /backups/helix-2026-03-15-030000.tar.gz
#   bash scripts/restore.sh --latest    # Restore most recent backup
#
# WARNING: This will overwrite the current database and files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
if [ -d "/backups" ] && [ -w "/backups" ]; then
    BACKUP_DIR="/backups"
else
    BACKUP_DIR="$HOME/backups"
fi
TEMP_DIR="/tmp/helix-restore-$$"
LOG_FILE="$PROJECT_DIR/logs/helix-restore.log"
mkdir -p "$(dirname "$LOG_FILE")"

# === Load .env ===
if [ -f "$PROJECT_DIR/.env" ]; then
    set +e
    set -a
    source "$PROJECT_DIR/.env" 2>/dev/null
    set +a
    set -e
fi

# === Parse Input ===
BACKUP_FILE="${1:-}"

if [ "$BACKUP_FILE" = "--latest" ]; then
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/helix-*.tar.gz 2>/dev/null | head -1)
    if [ -z "$BACKUP_FILE" ]; then
        echo "ERROR: No backups found in $BACKUP_DIR"
        exit 1
    fi
    echo "Latest backup: $BACKUP_FILE"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "Usage: bash scripts/restore.sh <backup-file.tar.gz>"
    echo "       bash scripts/restore.sh --latest"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/helix-*.tar.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

# === Confirmation ===
echo ""
echo "WARNING: This will restore from: $(basename "$BACKUP_FILE")"
echo "The current database and uploaded files will be OVERWRITTEN."
echo ""
read -p "Type 'RESTORE' to confirm: " confirm
if [ "$confirm" != "RESTORE" ]; then
    echo "Cancelled."
    exit 0
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# === Extract ===
log "Extracting backup..."
mkdir -p "$TEMP_DIR"
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Show backup info
if [ -f "$TEMP_DIR/backup-info.json" ]; then
    log "Backup info:"
    cat "$TEMP_DIR/backup-info.json" | tee -a "$LOG_FILE"
    echo ""
fi

# === Restore Database ===
log "Restoring PostgreSQL database..."
cd "$PROJECT_DIR"

if [ -f "$TEMP_DIR/database.dump" ]; then
    # Drop and recreate the database
    docker compose exec -T db psql -U "${POSTGRES_USER:-postgres}" -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB:-mission_control}' AND pid <> pg_backend_pid();" \
        2>/dev/null || true

    docker compose exec -T db dropdb -U "${POSTGRES_USER:-postgres}" --if-exists "${POSTGRES_DB:-mission_control}"
    docker compose exec -T db createdb -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-mission_control}"

    docker compose exec -T db pg_restore \
        -U "${POSTGRES_USER:-postgres}" \
        -d "${POSTGRES_DB:-mission_control}" \
        --no-owner --no-privileges \
        < "$TEMP_DIR/database.dump"

    log "  Database restored"
else
    log "  WARNING: No database dump found in backup"
fi

# === Run Migrations (handle version mismatch) ===
log "Running database migrations..."
docker compose exec -T backend alembic upgrade head 2>> "$LOG_FILE" || {
    log "  WARNING: Migration failed — database schema may be from a different version"
    log "  Check alembic-version.txt in the backup for the expected version"
}

# === Restore Uploaded Files ===
log "Restoring uploaded files..."
if [ -d "$TEMP_DIR/uploads" ] && [ "$(ls -A "$TEMP_DIR/uploads" 2>/dev/null)" ]; then
    docker compose cp "$TEMP_DIR/uploads/." backend:/data/uploads/
    log "  Uploads restored"
else
    log "  No uploaded files in backup"
fi

# === Restore OpenClaw Workspaces ===
log "Restoring OpenClaw workspaces..."
if [ -d "$TEMP_DIR/openclaw-workspaces" ] && [ "$(ls -A "$TEMP_DIR/openclaw-workspaces" 2>/dev/null)" ]; then
    if [ -d "$HOME/.openclaw/workspaces" ]; then
        cp -r "$TEMP_DIR/openclaw-workspaces/"* "$HOME/.openclaw/workspaces/" 2>/dev/null || true
        log "  Workspaces restored to host"
    fi
fi

# === Restore OpenClaw Config ===
if [ -f "$TEMP_DIR/openclaw.json" ]; then
    log "Restoring OpenClaw config..."
    cp "$TEMP_DIR/openclaw.json" "$HOME/.openclaw/openclaw.json"
    log "  Config restored"
fi

# === Restart Services ===
log "Restarting services..."
docker compose restart backend
sleep 5

# Restart host gateway if running
if systemctl --user is-active openclaw-gateway &>/dev/null; then
    systemctl --user restart openclaw-gateway
    log "  Host gateway restarted"
fi

# === Cleanup ===
rm -rf "$TEMP_DIR"

log ""
log "Restore complete from: $(basename "$BACKUP_FILE")"
log "Please verify the dashboard and test agent dispatch."
