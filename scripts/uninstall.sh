#!/bin/bash
# HELIX Mission Control — Uninstaller
# Usage: bash scripts/uninstall.sh [--keep-data]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

INSTALL_DIR="/home/helix/helix-mission-control"
KEEP_DATA=false

if [ "$1" = "--keep-data" ]; then
    KEEP_DATA=true
fi

echo -e "${RED}WARNING: This will remove HELIX Mission Control.${NC}"
if [ "$KEEP_DATA" = false ]; then
    echo -e "${RED}All data (database, uploads, agent workspaces) will be PERMANENTLY DELETED.${NC}"
else
    echo "Docker volumes (database, uploads) will be preserved."
fi
echo ""
read -p "Type 'UNINSTALL' to confirm: " confirm

if [ "$confirm" != "UNINSTALL" ]; then
    echo "Cancelled."
    exit 0
fi

cd "$INSTALL_DIR" 2>/dev/null || true

# Stop containers
echo "Stopping containers..."
docker compose down 2>/dev/null || true

# Remove volumes (unless --keep-data)
if [ "$KEEP_DATA" = false ]; then
    echo "Removing Docker volumes..."
    docker compose down -v 2>/dev/null || true
fi

# Remove firewall rules
echo "Cleaning up firewall..."
sudo ufw delete allow 80/tcp 2>/dev/null || true
sudo ufw delete allow 443/tcp 2>/dev/null || true

echo -e "${GREEN}HELIX Mission Control has been removed.${NC}"
if [ "$KEEP_DATA" = true ]; then
    echo "Data volumes preserved. Re-install to reconnect."
fi
