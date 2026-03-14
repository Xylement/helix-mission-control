#!/bin/bash
set -e

echo "=== HELIX Gateway Container Starting ==="

# Generate openclaw.json from environment variables
CONFIG_DIR="/home/openclaw/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

# Determine provider config
case "${MODEL_PROVIDER:-moonshot}" in
  moonshot)
    BASE_URL="${MODEL_BASE_URL:-https://api.moonshot.ai/v1}"
    API_KEY_ENV="MOONSHOT_API_KEY"
    API_TYPE="openai-completions"
    ;;
  openai)
    BASE_URL="${MODEL_BASE_URL:-https://api.openai.com/v1}"
    API_KEY_ENV="OPENAI_API_KEY"
    API_TYPE="openai-completions"
    ;;
  anthropic)
    BASE_URL="${MODEL_BASE_URL:-https://api.anthropic.com/v1}"
    API_KEY_ENV="ANTHROPIC_API_KEY"
    API_TYPE="anthropic"
    ;;
  nvidia)
    BASE_URL="${MODEL_BASE_URL:-https://integrate.api.nvidia.com/v1}"
    API_KEY_ENV="NVIDIA_API_KEY"
    API_TYPE="openai-completions"
    ;;
  kimi-coding)
    BASE_URL="${MODEL_BASE_URL:-https://api.kimi.com/coding/}"
    API_KEY_ENV="KIMI_API_KEY"
    API_TYPE="anthropic-messages"
    ;;
  custom)
    BASE_URL="${MODEL_BASE_URL}"
    API_KEY_ENV="CUSTOM_API_KEY"
    API_TYPE="${MODEL_API_TYPE:-openai-completions}"
    ;;
  *)
    echo "ERROR: Unknown MODEL_PROVIDER: ${MODEL_PROVIDER}"
    exit 1
    ;;
esac

# Only generate config if explicitly requested (not when host config is mounted)
if [ ! -f "$CONFIG_FILE" ] || [ "${GENERATE_CONFIG:-true}" = "true" ]; then

  # Build telegram channel config if token is set
  TELEGRAM_CONFIG=""
  if [ -n "${TELEGRAM_BOT_TOKEN}" ]; then
    TELEGRAM_CONFIG=",
  \"channels\": {
    \"telegram\": {
      \"enabled\": true,
      \"botToken\": \"${TELEGRAM_BOT_TOKEN}\",
      \"dmPolicy\": \"allowlist\",
      \"allowFrom\": [$(echo "${TELEGRAM_ALLOWED_USER_IDS}" | sed 's/,/","/g; s/^/"/; s/$/"/' )]
    }
  }"
  fi

  cat > "$CONFIG_FILE" << EOJSON
{
  "env": {
    "${API_KEY_ENV}": "${MODEL_API_KEY}",
    "MC_API_BASE": "http://${MC_API_BASE:-backend:8000}",
    "MC_SERVICE_TOKEN": "${MC_SERVICE_TOKEN:-}"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "${MODEL_PROVIDER}/${MODEL_NAME:-kimi-k2.5}"
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "${MODEL_PROVIDER}": {
        "baseUrl": "${BASE_URL}",
        "apiKey": "\${${API_KEY_ENV}}",
        "api": "${API_TYPE}",
        "models": [
          {
            "id": "${MODEL_NAME:-kimi-k2.5}",
            "name": "${MODEL_DISPLAY_NAME:-${MODEL_NAME:-Kimi K2.5}}",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": ${MODEL_CONTEXT_WINDOW:-256000},
            "maxTokens": ${MODEL_MAX_TOKENS:-8192}
          }
        ]
      }
    }
  },
  "gateway": {
    "mode": "local",
    "port": ${GATEWAY_PORT:-18789},
    "bind": "lan",
    "controlUi": {
      "dangerouslyAllowHostHeaderOriginFallback": true
    },
    "auth": {
      "mode": "token",
      "token": "${GATEWAY_TOKEN}"
    }
  },
  "tools": {
    "profile": "full",
    "allow": ["*"],
    "exec": {
      "host": "gateway",
      "security": "full",
      "ask": "off"
    }
  }${TELEGRAM_CONFIG}
}
EOJSON

  echo "Generated openclaw.json with provider: ${MODEL_PROVIDER}"
fi

# Start the gateway
echo "Starting OpenClaw Gateway on port ${GATEWAY_PORT:-18789}..."
exec openclaw gateway
