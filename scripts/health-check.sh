#!/bin/bash
#
# HELIX Mission Control — Health Monitor
# Usage:
#   bash scripts/health-check.sh              # Check once
#   bash scripts/health-check.sh --watch      # Check every 5 minutes (foreground)
#
# Best used via cron: */5 * * * * cd /home/helix/helix-mission-control && bash scripts/health-check.sh --quiet

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/helix-health.log"
mkdir -p "$(dirname "$LOG_FILE")"
QUIET=false
WATCH=false

for arg in "$@"; do
    case $arg in
        --quiet) QUIET=true ;;
        --watch) WATCH=true ;;
    esac
done

# === Load .env ===
if [ -f "$PROJECT_DIR/.env" ]; then
    set +e
    set -a
    source "$PROJECT_DIR/.env" 2>/dev/null
    set +a
    set -uo pipefail
fi

# === Helpers ===
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
    if [ "$QUIET" = false ]; then
        echo "$1"
    fi
}

send_alert() {
    local message="$1"
    log "ALERT: $message"

    # Send Telegram alert
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALLOWED_USER_IDS:-}" ]; then
        local ADMIN_ID=$(echo "$TELEGRAM_ALLOWED_USER_IDS" | cut -d',' -f1)
        curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="$ADMIN_ID" \
            -d text="🚨 HELIX Alert: ${message}" \
            -d parse_mode="Markdown" > /dev/null 2>&1 || true
    fi
}

# === Health Checks ===
check_health() {
    local ALL_OK=true
    local ISSUES=""

    cd "$PROJECT_DIR"

    # Check Docker is running
    if ! docker info > /dev/null 2>&1; then
        send_alert "Docker daemon is not running!"
        return 1
    fi

    # Check each container
    local SERVICES=("db" "redis" "backend" "frontend")
    for service in "${SERVICES[@]}"; do
        local STATUS=$(docker compose ps --format json "$service" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        data = data[0] if data else {}
    print(data.get('State', 'unknown'))
except:
    print('unknown')
" 2>/dev/null || echo "unknown")

        local HEALTH=$(docker compose ps --format json "$service" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        data = data[0] if data else {}
    print(data.get('Health', ''))
except:
    print('')
" 2>/dev/null || echo "")

        if [ "$STATUS" != "running" ]; then
            ALL_OK=false
            ISSUES="${ISSUES}\n- $service: NOT RUNNING (state: $STATUS)"

            # Attempt restart
            log "Attempting to restart $service..."
            docker compose restart "$service" 2>> "$LOG_FILE"
            sleep 10

            # Check again
            local NEW_STATUS=$(docker compose ps --format json "$service" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        data = data[0] if data else {}
    print(data.get('State', 'unknown'))
except:
    print('unknown')
" 2>/dev/null || echo "unknown")

            if [ "$NEW_STATUS" = "running" ]; then
                log "  $service restarted successfully"
            else
                send_alert "$service is DOWN and restart failed!"
            fi

        elif [ "$HEALTH" = "unhealthy" ]; then
            ALL_OK=false
            ISSUES="${ISSUES}\n- $service: UNHEALTHY"
            log "  $service is unhealthy, restarting..."
            docker compose restart "$service" 2>> "$LOG_FILE"
        fi
    done

    # Check host gateway (if running as systemd service)
    if systemctl --user is-enabled openclaw-gateway 2>/dev/null; then
        if ! systemctl --user is-active openclaw-gateway > /dev/null 2>&1; then
            ALL_OK=false
            ISSUES="${ISSUES}\n- openclaw-gateway (host): NOT RUNNING"
            log "Attempting to restart host gateway..."
            systemctl --user restart openclaw-gateway
            sleep 5
            if systemctl --user is-active openclaw-gateway > /dev/null 2>&1; then
                log "  Host gateway restarted successfully"
            else
                send_alert "Host OpenClaw gateway is DOWN and restart failed!"
            fi
        fi
    fi

    # Backend API health check
    if ! curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
        ALL_OK=false
        ISSUES="${ISSUES}\n- Backend API: NOT RESPONDING"
    fi

    # Check disk space (alert if < 5GB free)
    local FREE_DISK=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
    if [ "$FREE_DISK" -lt 5 ]; then
        ALL_OK=false
        ISSUES="${ISSUES}\n- Disk space LOW: ${FREE_DISK}GB free"
        send_alert "Disk space critically low: ${FREE_DISK}GB remaining"
    fi

    # Check memory (alert if < 200MB free)
    local FREE_MEM=$(free -m | awk '/^Mem:/{print $7}')
    if [ "$FREE_MEM" -lt 200 ]; then
        ISSUES="${ISSUES}\n- Memory LOW: ${FREE_MEM}MB available"
    fi

    # Report
    if [ "$ALL_OK" = true ]; then
        if [ "$QUIET" = false ]; then
            log "All services healthy ✓ (disk: ${FREE_DISK}GB free, mem: ${FREE_MEM}MB avail)"
        fi
    else
        log "Issues detected:$(echo -e "$ISSUES")"
    fi
}

# === Main ===
if [ "$WATCH" = true ]; then
    log "Starting health monitor (checking every 5 minutes)..."
    while true; do
        check_health
        sleep 300
    done
else
    check_health
fi
