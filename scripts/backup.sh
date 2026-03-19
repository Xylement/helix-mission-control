#!/bin/bash
#
# HELIX Mission Control — Backup Script
# Usage:
#   bash scripts/backup.sh              # Run backup now
#   bash scripts/backup.sh --quiet      # No output (for cron)
#
# Backs up: PostgreSQL, uploaded files, OpenClaw workspaces/config
# Output: /backups/helix-YYYY-MM-DD-HHMMSS.tar.gz
# Retention: 7 daily + 4 weekly

set -euo pipefail

# === Configuration ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
if [ -d "/backups" ] && [ -w "/backups" ]; then
    BACKUP_DIR="/backups"
else
    BACKUP_DIR="$HOME/backups"
    mkdir -p "$BACKUP_DIR"
fi
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
DATE_ONLY=$(date +"%Y-%m-%d")
DAY_OF_WEEK=$(date +"%u")  # 1=Monday, 7=Sunday
BACKUP_NAME="helix-${TIMESTAMP}"
TEMP_DIR="/tmp/helix-backup-${TIMESTAMP}"
LOG_FILE="$PROJECT_DIR/logs/helix-backup.log"
mkdir -p "$(dirname "$LOG_FILE")"
QUIET=false

if [ "${1:-}" = "--quiet" ]; then
    QUIET=true
fi

# === Load .env ===
if [ -f "$PROJECT_DIR/.env" ]; then
    set +e
    set -a
    source "$PROJECT_DIR/.env" 2>/dev/null
    set +a
    set -e
fi

# === Helpers ===
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
    if [ "$QUIET" = false ]; then
        echo "$1"
    fi
}

error() {
    log "ERROR: $1"
    # Send Telegram alert if configured
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALLOWED_USER_IDS:-}" ]; then
        local ADMIN_ID=$(echo "$TELEGRAM_ALLOWED_USER_IDS" | cut -d',' -f1)
        curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="$ADMIN_ID" \
            -d text="⚠️ HELIX Backup Failed: $1" \
            -d parse_mode="Markdown" > /dev/null 2>&1 || true
    fi
}

# === Pre-flight ===
mkdir -p "$BACKUP_DIR" "$TEMP_DIR"
log "Starting backup: $BACKUP_NAME"

# === 1. PostgreSQL Dump ===
log "Dumping PostgreSQL..."
cd "$PROJECT_DIR"

docker compose exec -T db pg_dump \
    -U "${POSTGRES_USER:-postgres}" \
    -d "${POSTGRES_DB:-mission_control}" \
    --format=custom \
    --compress=6 \
    > "$TEMP_DIR/database.dump" 2>> "$LOG_FILE"

if [ $? -ne 0 ] || [ ! -s "$TEMP_DIR/database.dump" ]; then
    error "PostgreSQL dump failed or is empty"
    rm -rf "$TEMP_DIR"
    exit 1
fi
log "  Database dump: $(du -h "$TEMP_DIR/database.dump" | cut -f1)"

# === 2. Uploaded Files ===
log "Backing up uploaded files..."
if docker compose exec -T backend test -d /data/uploads 2>/dev/null; then
    docker compose cp backend:/data/uploads "$TEMP_DIR/uploads" 2>> "$LOG_FILE" || true
    log "  Uploads: $(du -sh "$TEMP_DIR/uploads" 2>/dev/null | cut -f1 || echo 'empty')"
else
    mkdir -p "$TEMP_DIR/uploads"
    log "  Uploads: no files found"
fi

# === 3. OpenClaw Workspaces ===
log "Backing up OpenClaw workspaces..."
if [ -d "$HOME/.openclaw/workspaces" ]; then
    cp -r "$HOME/.openclaw/workspaces" "$TEMP_DIR/openclaw-workspaces" 2>> "$LOG_FILE" || true
    log "  Workspaces: $(du -sh "$TEMP_DIR/openclaw-workspaces" 2>/dev/null | cut -f1 || echo 'empty')"
else
    mkdir -p "$TEMP_DIR/openclaw-workspaces"
    log "  Workspaces: not found on host"
fi

# === 4. OpenClaw Config ===
log "Backing up OpenClaw config..."
if [ -f "$HOME/.openclaw/openclaw.json" ]; then
    cp "$HOME/.openclaw/openclaw.json" "$TEMP_DIR/openclaw.json" 2>> "$LOG_FILE" || true
fi

# === 5. Environment Config (secrets masked) ===
log "Backing up config..."
if [ -f "$PROJECT_DIR/.env" ]; then
    # Copy .env but mask sensitive values
    sed -E 's/(PASSWORD|SECRET|TOKEN|API_KEY)=.+/\1=<REDACTED>/g' \
        "$PROJECT_DIR/.env" > "$TEMP_DIR/env-masked.txt"
fi

# === 6. Alembic Version ===
log "Recording migration version..."
docker compose exec -T db psql \
    -U "${POSTGRES_USER:-postgres}" \
    -d "${POSTGRES_DB:-mission_control}" \
    -t -c "SELECT version_num FROM alembic_version;" \
    > "$TEMP_DIR/alembic-version.txt" 2>/dev/null || echo "unknown" > "$TEMP_DIR/alembic-version.txt"

# === 7. Backup Metadata ===
cat > "$TEMP_DIR/backup-info.json" << EOF
{
    "backup_name": "$BACKUP_NAME",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "helix_version": "$(cd "$PROJECT_DIR" && git describe --tags --always 2>/dev/null || echo 'unknown')",
    "git_commit": "$(cd "$PROJECT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
    "alembic_version": "$(cat "$TEMP_DIR/alembic-version.txt" | tr -d ' \n')",
    "database_size": "$(du -b "$TEMP_DIR/database.dump" | cut -f1)",
    "server": "$(hostname)",
    "domain": "${DOMAIN:-unknown}"
}
EOF

# === 8. Compress ===
log "Compressing backup..."
BACKUP_FILE="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" .
rm -rf "$TEMP_DIR"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"

# === 9. Retention Cleanup ===
log "Cleaning old backups..."

# Keep last 7 daily backups
ls -t "$BACKUP_DIR"/helix-*.tar.gz 2>/dev/null | tail -n +8 | while read old_backup; do
    # Check if it's a weekly backup (keep Sundays for 4 weeks)
    BACKUP_DATE=$(echo "$old_backup" | grep -oP '\d{4}-\d{2}-\d{2}')
    if [ -n "$BACKUP_DATE" ]; then
        BACKUP_DOW=$(date -d "$BACKUP_DATE" +"%u" 2>/dev/null || echo "0")
        BACKUP_AGE=$(( ($(date +%s) - $(date -d "$BACKUP_DATE" +%s 2>/dev/null || echo 0)) / 86400 ))

        # Keep Sunday backups for up to 28 days
        if [ "$BACKUP_DOW" = "7" ] && [ "$BACKUP_AGE" -le 28 ]; then
            continue
        fi
    fi

    log "  Removing old backup: $(basename "$old_backup")"
    rm -f "$old_backup"
done

# === 10. Summary ===
TOTAL_BACKUPS=$(ls "$BACKUP_DIR"/helix-*.tar.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "Retention: $TOTAL_BACKUPS backups, $TOTAL_SIZE total"

# Send success notification (optional)
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALLOWED_USER_IDS:-}" ] && [ "$QUIET" = false ]; then
    ADMIN_ID=$(echo "$TELEGRAM_ALLOWED_USER_IDS" | cut -d',' -f1)
    curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="$ADMIN_ID" \
        -d text="✅ HELIX Backup Complete: ${BACKUP_SIZE}" > /dev/null 2>&1 || true
fi
