#!/bin/bash
# Install helix CLI to /usr/local/bin
# Usage: bash scripts/install-cli.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_SOURCE="$SCRIPT_DIR/helix-cli"

if [ ! -f "$CLI_SOURCE" ]; then
    echo "ERROR: helix-cli not found at $CLI_SOURCE"
    exit 1
fi

sudo cp "$CLI_SOURCE" /usr/local/bin/helix
sudo chmod +x /usr/local/bin/helix

echo "HELIX CLI installed to /usr/local/bin/helix"
echo "Run: helix help"
