#!/bin/bash
# HELIX Mission Control — Update Script
# Usage: bash scripts/update.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"

cd "$INSTALL_DIR"

echo -e "${BLUE}[HELIX]${NC} Updating HELIX Mission Control..."

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Re-select Caddyfile in case config changed
if [ -f scripts/select-caddyfile.sh ]; then
    bash scripts/select-caddyfile.sh
fi

# Rebuild and restart
echo "Rebuilding containers..."
docker compose up -d --build

# Run migrations
echo "Running database migrations..."
docker compose exec -T backend alembic upgrade head

echo ""
echo -e "${GREEN}[✓]${NC} Update complete!"
echo "    Check: docker compose ps"
echo "    Logs:  docker compose logs -f --tail=50"
