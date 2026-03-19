#!/bin/bash
# Selects the appropriate Caddyfile based on .env settings
# Called by install.sh during setup

set -e

# Find project root (where .env and Caddyfile live)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

source .env 2>/dev/null || true

if [ "${ENABLE_SSL}" = "true" ] && [ -n "${DOMAIN}" ] && [ "${DOMAIN}" != "localhost" ]; then
    echo "SSL enabled for ${DOMAIN} — using Caddyfile with auto-HTTPS"
    cp Caddyfile Caddyfile.active
else
    echo "SSL disabled — using HTTP-only Caddyfile"
    cp Caddyfile.http Caddyfile.active
fi
