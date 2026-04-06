#!/bin/bash
set -e

echo "=== HELIX Gateway Container Starting ==="

# Generate openclaw.json from environment variables
CONFIG_DIR="/home/openclaw/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
AUTH_PROFILES="$CONFIG_DIR/agents/main/agent/auth-profiles.json"

# Check if auth-profiles.json has a kimi-coding credential
has_kimi_auth_profile() {
    [ -f "$AUTH_PROFILES" ] && node -e "
        const c = require('$AUTH_PROFILES');
        const profiles = c.profiles || {};
        const hasKimi = Object.values(profiles).some(p => p.provider === 'kimi-coding' && p.key && p.key.length > 8);
        process.exit(hasKimi ? 0 : 1);
    " 2>/dev/null
}

# Check if openclaw.json already has an API key (written by backend from DB)
config_has_key() {
    [ -f "$CONFIG_FILE" ] && node -e "
        const c = require('$CONFIG_FILE');
        const env = c.env || {};
        const hasKey = Object.values(env).some(v => typeof v === 'string' && v.length > 8 && !v.startsWith('\${'));
        process.exit(hasKey ? 0 : 1);
    " 2>/dev/null
}

# For kimi-coding/kimi_code providers, use auth profiles instead of env API keys.
# OpenClaw's built-in kimi-coding provider reads credentials from the credential store,
# not from env vars — putting the key in env.KIMI_API_KEY causes a 403 from api.kimi.com.
USE_AUTH_PROFILE="false"
if [ "${MODEL_PROVIDER}" = "kimi-coding" ] || [ "${MODEL_PROVIDER}" = "kimi_code" ]; then
    if [ -z "${MODEL_API_KEY}" ] && [ -f "$AUTH_PROFILES" ]; then
        EXTRACTED_KEY=$(node -e "
            const c = require('$AUTH_PROFILES');
            const profiles = c.profiles || {};
            for (const p of Object.values(profiles)) {
                if (p.key && p.key.length > 8) { process.stdout.write(p.key); break; }
            }
        " 2>/dev/null)
        if [ -n "$EXTRACTED_KEY" ]; then
            echo "Found kimi-coding API key in auth-profiles.json."
            export MODEL_API_KEY="$EXTRACTED_KEY"
            USE_AUTH_PROFILE="true"
        fi
    elif [ -n "${MODEL_API_KEY}" ]; then
        USE_AUTH_PROFILE="true"
    fi
fi

# For non-kimi providers: if no MODEL_API_KEY, try extracting from auth profiles
if [ "$USE_AUTH_PROFILE" = "false" ] && [ -z "${MODEL_API_KEY}" ]; then
    if [ -f "$AUTH_PROFILES" ]; then
        EXTRACTED_KEY=$(node -e "
            const c = require('$AUTH_PROFILES');
            const profiles = c.profiles || {};
            for (const p of Object.values(profiles)) {
                if (p.key && p.key.length > 8) { process.stdout.write(p.key); break; }
            }
        " 2>/dev/null)
        if [ -n "$EXTRACTED_KEY" ]; then
            echo "Found API key in auth-profiles.json, proceeding..."
            export MODEL_API_KEY="$EXTRACTED_KEY"
        fi
    fi
fi

# If still no API key and no auth profile, create minimal config and start anyway
if [ "$USE_AUTH_PROFILE" = "false" ] && [ -z "${MODEL_API_KEY}" ]; then
    if config_has_key; then
        echo "Found API key in config file, proceeding..."
        GENERATE_CONFIG="false"
    else
        echo "============================================"
        echo "  No AI model key configured."
        echo "  Gateway will start in waiting mode."
        echo "  Configure a model in Settings > AI Models."
        echo "============================================"
        # Create minimal config so gateway starts and accepts connections
        mkdir -p "$(dirname "$CONFIG_FILE")"
        cat > "$CONFIG_FILE" << MINIMAL_EOF
{
    "gateway": {
        "mode": "local",
        "port": ${GATEWAY_PORT:-18789},
        "bind": "lan",
        "auth": {
            "mode": "token",
            "token": "${GATEWAY_TOKEN}"
        }
    }
}
MINIMAL_EOF
        GENERATE_CONFIG="false"
    fi
fi

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
  gemini|google_gemini)
    BASE_URL="${MODEL_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai}"
    API_KEY_ENV="GEMINI_API_KEY"
    API_TYPE="openai-completions"
    ;;
  openrouter)
    BASE_URL="${MODEL_BASE_URL:-https://openrouter.ai/api/v1}"
    API_KEY_ENV="OPENROUTER_API_KEY"
    API_TYPE="openai-completions"
    ;;
  kimi-coding|kimi_code)
    BASE_URL="${MODEL_BASE_URL:-https://api.kimi.com/coding}"
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

# Check if openclaw.json already has valid model providers (written by backend sync).
# If so, preserve it — only generate a fresh config on first run or when file is
# empty/minimal (no providers). This prevents the entrypoint from overwriting
# backend-synced model config (e.g. gemini) with default moonshot on every restart.
config_has_model_providers() {
    [ -f "$CONFIG_FILE" ] && node -e "
        const c = require('$CONFIG_FILE');
        const providers = (c.models || {}).providers || {};
        const hasProviders = Object.keys(providers).length > 0;
        process.exit(hasProviders ? 0 : 1);
    " 2>/dev/null
}

# Only generate config on first run (file missing) or when no model providers exist.
# Skip if config already has model providers (backend sync owns the model config).
SHOULD_GENERATE="true"
if [ -f "$CONFIG_FILE" ] && config_has_model_providers; then
    echo "Existing openclaw.json has model providers — preserving config."
    SHOULD_GENERATE="false"
fi

if [ "$SHOULD_GENERATE" = "true" ] && { [ ! -f "$CONFIG_FILE" ] || [ "${GENERATE_CONFIG:-true}" = "true" ]; }; then

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

  # All providers: use env-based API key in config
  # For kimi-coding/kimi_code: normalize to kimi-coding provider name
  if [ "$USE_AUTH_PROFILE" = "true" ]; then
    EFFECTIVE_PROVIDER="kimi-coding"
    EFFECTIVE_MODEL_REF="kimi-coding/${MODEL_NAME:-k2p5}"
  else
    EFFECTIVE_PROVIDER="${MODEL_PROVIDER}"
    EFFECTIVE_MODEL_REF="${MODEL_PROVIDER}/${MODEL_NAME:-kimi-k2.5}"
  fi

  cat > "$CONFIG_FILE" << EOJSON
{
  "env": {
    "${API_KEY_ENV}": "${MODEL_API_KEY}",
    "MC_API_BASE": "${MC_API_BASE:-http://backend:8000}",
    "MC_SERVICE_TOKEN": "${MC_SERVICE_TOKEN:-}"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "${EFFECTIVE_MODEL_REF}"
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "${EFFECTIVE_PROVIDER}": {
        "baseUrl": "${BASE_URL}",
        "apiKey": "\${${API_KEY_ENV}}",
        "api": "${API_TYPE}",
        "models": [
          {
            "id": "${MODEL_NAME:-k2p5}",
            "name": "${MODEL_DISPLAY_NAME:-${MODEL_NAME:-Kimi K2.5}}",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": ${MODEL_CONTEXT_WINDOW:-262144},
            "maxTokens": ${MODEL_MAX_TOKENS:-32768}
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
  echo "Generated openclaw.json with provider: ${EFFECTIVE_PROVIDER}"
fi

# Start the gateway
echo "Starting OpenClaw Gateway on port ${GATEWAY_PORT:-18789}..."
exec openclaw gateway
