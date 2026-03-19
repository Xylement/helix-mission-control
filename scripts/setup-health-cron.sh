#!/bin/bash
# Install health check cron — runs every 5 minutes
# Usage: bash scripts/setup-health-cron.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRON_CMD="*/5 * * * * cd $PROJECT_DIR && bash scripts/health-check.sh --quiet"

if crontab -l 2>/dev/null | grep -q "helix.*health-check.sh"; then
    echo "Health check cron already exists"
else
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    echo "Health check cron installed: every 5 minutes"
fi

echo "Logs: /var/log/helix-health.log"
