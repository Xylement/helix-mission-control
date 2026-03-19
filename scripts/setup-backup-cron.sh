#!/bin/bash
# Install backup cron job — runs daily at 3 AM
# Usage: bash scripts/setup-backup-cron.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRON_CMD="0 3 * * * cd $PROJECT_DIR && bash scripts/backup.sh --quiet"

# Check if cron entry already exists
if crontab -l 2>/dev/null | grep -q "helix.*backup.sh"; then
    echo "Backup cron already exists:"
    crontab -l | grep "backup.sh"
else
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    echo "Backup cron installed: daily at 3 AM"
fi

# Create backup directory
sudo mkdir -p /backups
sudo chown "$(whoami):$(whoami)" /backups

echo "Backup location: /backups/"
echo "Logs: /var/log/helix-backup.log"
