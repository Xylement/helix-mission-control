#!/bin/bash
# Run ONCE to migrate existing OpenClaw data from host to Docker volumes
# Usage: bash gateway/migrate-from-host.sh

set -e

echo "=== Migrating OpenClaw data from host to Docker volumes ==="

# Check if source exists
if [ ! -d "$HOME/.openclaw" ]; then
    echo "No existing OpenClaw data found at ~/.openclaw. Skipping migration."
    exit 0
fi

# Copy workspaces
if [ -d "$HOME/.openclaw/workspaces" ]; then
    echo "Copying workspaces..."
    docker compose cp "$HOME/.openclaw/workspaces/." gateway:/home/openclaw/.openclaw/workspaces/
fi

# Copy identity
if [ -d "$HOME/.openclaw/identity" ]; then
    echo "Copying identity..."
    docker compose cp "$HOME/.openclaw/identity/." gateway:/home/openclaw/.openclaw/identity/
fi

# Copy skills
if [ -d "$HOME/.openclaw/skills" ]; then
    echo "Copying skills..."
    docker compose cp "$HOME/.openclaw/skills/." gateway:/home/openclaw/.openclaw/skills/
fi

echo "Migration complete!"
echo ""
echo "To disable the old systemd service:"
echo "  systemctl --user stop openclaw-gateway"
echo "  systemctl --user disable openclaw-gateway"
