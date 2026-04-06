#!/bin/bash
set -e

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

if [ -f "$ENV_FILE" ]; then
    echo "[HELIX] .env already exists. Skipping setup."
    echo "[HELIX] To regenerate, delete .env and run this script again."
    exit 0
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
    echo "[HELIX] ERROR: .env.example not found"
    exit 1
fi

echo "[HELIX] Generating .env from .env.example..."

# Copy example
cp "$EXAMPLE_FILE" "$ENV_FILE"

# Auto-generate secrets
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
POSTGRES_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)
GATEWAY_TOKEN=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)

# Inject generated values
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
sed -i "s|^GATEWAY_TOKEN=.*|GATEWAY_TOKEN=${GATEWAY_TOKEN}|" "$ENV_FILE"

echo "[HELIX] .env generated with auto-generated secrets."
echo "[HELIX] IMPORTANT: Edit .env and set your MODEL_API_KEY before starting."
echo ""
echo "  nano .env"
echo ""
