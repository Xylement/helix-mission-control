#!/bin/bash
#
# HELIX Mission Control — Update Daemon
# Watches for .update-trigger file and performs updates with auto-rollback.
#
# Runs on the HOST (not in a container). Managed by systemd.
#
# Installation (run as root):
#   cp /home/helix/helix-mission-control/update-daemon.sh /home/helix/helix-mission-control/update-daemon.sh
#   chmod +x /home/helix/helix-mission-control/update-daemon.sh
#
#   cat > /etc/systemd/system/helix-updater.service << 'EOF'
#   [Unit]
#   Description=HELIX Mission Control Updater
#   After=docker.service
#
#   [Service]
#   Type=simple
#   User=root
#   WorkingDirectory=/home/helix/helix-mission-control
#   ExecStart=/home/helix/helix-mission-control/update-daemon.sh
#   Restart=always
#   RestartSec=10
#
#   [Install]
#   WantedBy=multi-user.target
#   EOF
#
#   systemctl daemon-reload
#   systemctl enable helix-updater
#   systemctl start helix-updater
#

set -uo pipefail

REPO_DIR="/home/helix/helix-mission-control"
DATA_DIR="${REPO_DIR}/data"
TRIGGER_FILE="${DATA_DIR}/.update-trigger"
RESULT_FILE="${DATA_DIR}/.update-result"
HISTORY_FILE="${DATA_DIR}/.update-history"
PRE_UPDATE_COMMIT="${DATA_DIR}/.pre-update-commit"
CANCEL_FILE="${DATA_DIR}/.update-cancel"
POLL_INTERVAL=10
BUILD_TIMEOUT=600  # 10 minutes

# Ensure data directory exists
mkdir -p "$DATA_DIR"

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
}

write_result() {
    local json="$1"
    echo "$json" > "$RESULT_FILE"
    # Append to history, keep last 10
    echo "$json" >> "$HISTORY_FILE"
    if [ -f "$HISTORY_FILE" ]; then
        tail -10 "$HISTORY_FILE" > "${HISTORY_FILE}.tmp"
        mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
    fi
}

check_cancel() {
    if [ -f "$CANCEL_FILE" ]; then
        log "Cancel requested by user"
        rm -f "$CANCEL_FILE" "$TRIGGER_FILE"
        local timestamp
        timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
        write_result "{\"status\":\"cancelled\",\"message\":\"Update cancelled by user\",\"timestamp\":\"${timestamp}\"}"
        return 0
    fi
    return 1
}

health_check() {
    local attempts=$1
    local delay=$2
    local i=0
    while [ $i -lt "$attempts" ]; do
        if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
            return 0
        fi
        i=$((i + 1))
        if [ $i -lt "$attempts" ]; then
            log "Health check attempt $i/$attempts failed, waiting ${delay}s..."
            sleep "$delay"
        fi
    done
    return 1
}

rollback() {
    local saved_commit="$1"
    local target_version="$2"
    local previous_version="$3"
    local timestamp
    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    log "ROLLING BACK to commit ${saved_commit}..."
    write_result "{\"status\":\"rolling_back\",\"version\":\"${target_version}\",\"previous_version\":\"${previous_version}\",\"stage\":\"rolling_back\",\"message\":\"Health check failed, rolling back...\",\"timestamp\":\"${timestamp}\"}"

    cd "$REPO_DIR"
    git checkout "$saved_commit" 2>/dev/null
    docker compose up -d --build 2>/dev/null

    log "Waiting 60s for containers after rollback..."
    sleep 60

    if health_check 3 20; then
        log "Rollback successful — system is healthy"
    else
        log "WARNING: System unhealthy even after rollback"
    fi

    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    write_result "{\"status\":\"rolled_back\",\"version\":\"${target_version}\",\"previous_version\":\"${previous_version}\",\"message\":\"Update to ${target_version} failed health check. Rolled back to ${previous_version}.\",\"timestamp\":\"${timestamp}\"}"
}

perform_update() {
    local target_version="$1"
    local timestamp
    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    cd "$REPO_DIR"

    # Save current state
    local previous_version
    previous_version=$(cat VERSION 2>/dev/null || echo "unknown")
    local saved_commit
    saved_commit=$(git rev-parse HEAD)
    echo "$saved_commit" > "$PRE_UPDATE_COMMIT"

    log "Starting update: ${previous_version} -> ${target_version}"

    # Check for cancel before starting
    if check_cancel; then return 1; fi

    # Step 1: git pull
    write_result "{\"status\":\"in_progress\",\"version\":\"${target_version}\",\"previous_version\":\"${previous_version}\",\"stage\":\"pulling_code\",\"message\":\"Pulling latest code...\",\"started_at\":\"${timestamp}\"}"
    log "Pulling latest code..."
    if ! git pull origin main 2>&1; then
        timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
        log "ERROR: git pull failed"
        write_result "{\"status\":\"failed\",\"version\":\"${target_version}\",\"previous_version\":\"${previous_version}\",\"error\":\"git pull failed\",\"timestamp\":\"${timestamp}\"}"
        return 1
    fi

    # Check for cancel after git pull
    if check_cancel; then return 1; fi

    # Step 2: docker compose build + up (with timeout)
    write_result "{\"status\":\"in_progress\",\"version\":\"${target_version}\",\"previous_version\":\"${previous_version}\",\"stage\":\"building\",\"message\":\"Building containers...\",\"started_at\":\"${timestamp}\"}"
    log "Rebuilding containers (timeout: ${BUILD_TIMEOUT}s)..."
    if ! timeout "$BUILD_TIMEOUT" docker compose up -d --build 2>&1; then
        local exit_code=$?
        timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
        if [ "$exit_code" -eq 124 ]; then
            log "ERROR: Build timed out after ${BUILD_TIMEOUT}s, initiating rollback"
            write_result "{\"status\":\"failed\",\"version\":\"${target_version}\",\"previous_version\":\"${previous_version}\",\"error\":\"Build timed out after 10 minutes\",\"timestamp\":\"${timestamp}\"}"
            rollback "$saved_commit" "$target_version" "$previous_version"
        else
            log "ERROR: docker compose failed, initiating rollback"
            rollback "$saved_commit" "$target_version" "$previous_version"
        fi
        return 1
    fi

    # Check for cancel after build
    if check_cancel; then return 1; fi

    # Step 3: Wait for containers to start
    write_result "{\"status\":\"in_progress\",\"version\":\"${target_version}\",\"previous_version\":\"${previous_version}\",\"stage\":\"starting\",\"message\":\"Starting services...\",\"started_at\":\"${timestamp}\"}"
    log "Waiting 90s for containers to start..."
    sleep 90

    # Check for cancel after wait
    if check_cancel; then return 1; fi

    # Step 4: Health check
    log "Running health checks..."
    if health_check 3 20; then
        local new_version
        new_version=$(cat VERSION 2>/dev/null || echo "$target_version")
        timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
        log "Update successful! Now running v${new_version}"
        write_result "{\"status\":\"success\",\"version\":\"${new_version}\",\"previous_version\":\"${previous_version}\",\"timestamp\":\"${timestamp}\"}"
        return 0
    else
        log "Health check failed after update, initiating rollback"
        rollback "$saved_commit" "$target_version" "$previous_version"
        return 1
    fi
}

# === Main loop ===

log "HELIX Update Daemon started. Watching for ${TRIGGER_FILE}..."

while true; do
    if [ -f "$TRIGGER_FILE" ]; then
        target_version=$(cat "$TRIGGER_FILE" 2>/dev/null || echo "unknown")
        rm -f "$TRIGGER_FILE"
        log "Update trigger detected: target version ${target_version}"
        perform_update "$target_version" || true
        log "Update process completed. Resuming watch..."
    fi
    sleep "$POLL_INTERVAL"
done
