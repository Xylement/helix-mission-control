# Claude Code Task: Add Gemini and OpenRouter as Native Providers

Read CODEBASE-CONTEXT.md first.

## Overview

Add Google Gemini and OpenRouter as native AI model providers in HELIX Mission Control, alongside the existing providers (moonshot, openai, anthropic, nvidia, kimi_code, custom).

Both use OpenAI-compatible APIs, so they work with the existing `openai-completions` API type in OpenClaw.

## IMPORTANT: Gemini API Key Format

Gemini API keys start with `AIza` (Google API key format), NOT `sk-`. This affects:
- Key prefix auto-detection (frontend)
- Provider key_prefix in model_providers.py
- OpenClaw gateway credential storage in entrypoint.sh — must verify that AIza-prefixed keys are passed correctly as Bearer tokens and not rejected or stripped by any validation logic

## Provider Details

### Google Gemini
- **Key:** `gemini`
- **Name:** "Google Gemini"
- **Base URL:** `https://generativelanguage.googleapis.com/v1beta/openai`
- **API Type:** `openai-completions` (OpenAI-compatible)
- **Key prefix:** `AIza` (Gemini API keys start with AIza)
- **Default model:** `gemini-2.5-flash`
- **Models:**
  - `gemini-2.5-pro` (1M context, 64k output — flagship reasoning)
  - `gemini-2.5-flash` (1M context, 64k output — fast & efficient)
  - `gemini-2.5-flash-lite` (1M context, 64k output — cheapest)
  - `gemini-3-flash-preview` (1M context, 64k output — latest preview)
- **Help URL:** `https://aistudio.google.com/apikey`
- **Note:** Get your free API key from Google AI Studio

### OpenRouter
- **Key:** `openrouter`
- **Name:** "OpenRouter"
- **Base URL:** `https://openrouter.ai/api/v1`
- **API Type:** `openai-completions` (OpenAI-compatible)
- **Key prefix:** `sk-or-` (OpenRouter keys start with sk-or-)
- **Default model:** `google/gemini-2.5-flash`
- **Models:**
  - `google/gemini-2.5-flash` (fast, cheap)
  - `google/gemini-2.5-pro` (flagship reasoning)
  - `anthropic/claude-sonnet-4` (Anthropic via OpenRouter)
  - `openai/gpt-5.4` (OpenAI via OpenRouter)
  - `meta-llama/llama-4-maverick` (open source)
  - `deepseek/deepseek-r1` (reasoning)
- **Help URL:** `https://openrouter.ai/keys`
- **Note:** Access 300+ models through one API. Browse all at openrouter.ai/models

## Files to Modify

### 1. Backend: `backend/app/services/model_providers.py`

Add two new entries to the `PROVIDERS` dict:

```python
"gemini": {
    "name": "Google Gemini",
    "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
    "api_type": "openai-completions",
    "key_prefix": "AIza",
    "default_model": "gemini-2.5-flash",
    "models": [
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "context_window": 1000000, "max_tokens": 65536},
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "context_window": 1000000, "max_tokens": 65536},
        {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite", "context_window": 1000000, "max_tokens": 65536},
        {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash Preview", "context_window": 1000000, "max_tokens": 65536},
    ],
    "help_url": "https://aistudio.google.com/apikey",
},
"openrouter": {
    "name": "OpenRouter",
    "base_url": "https://openrouter.ai/api/v1",
    "api_type": "openai-completions",
    "key_prefix": "sk-or-",
    "default_model": "google/gemini-2.5-flash",
    "models": [
        {"id": "google/gemini-2.5-flash", "name": "Gemini 2.5 Flash", "context_window": 1000000, "max_tokens": 65536},
        {"id": "google/gemini-2.5-pro", "name": "Gemini 2.5 Pro", "context_window": 1000000, "max_tokens": 65536},
        {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4", "context_window": 200000, "max_tokens": 64000},
        {"id": "openai/gpt-5.4", "name": "GPT-5.4", "context_window": 256000, "max_tokens": 32000},
        {"id": "meta-llama/llama-4-maverick", "name": "Llama 4 Maverick", "context_window": 256000, "max_tokens": 32000},
        {"id": "deepseek/deepseek-r1", "name": "DeepSeek R1", "context_window": 128000, "max_tokens": 16000},
    ],
    "help_url": "https://openrouter.ai/keys",
    "note": "Access 300+ models through one API. Browse all at openrouter.ai/models",
},
```

### 2. Backend: `backend/app/services/gateway.py`

In `sync_model_config_from_db()`, add gemini and openrouter to the provider-to-OpenClaw mapping. Both use `openai-completions` API type, same as moonshot and openai.

In the `key_env_map` or equivalent mapping, add:
- `gemini` → env var pattern for OpenClaw config
- `openrouter` → env var pattern for OpenClaw config

**CRITICAL:** Ensure the Gemini API key (AIza...) is stored and passed correctly. OpenClaw uses Bearer token auth for openai-completions providers. The AIza key must be set in the `api_key` field of the OpenClaw config JSON, same as any other provider key. Verify that no code strips, validates, or rejects keys that don't start with `sk-`.

### 3. Gateway: `gateway/entrypoint.sh`

Add cases for gemini and openrouter in the provider switch/case block:

```bash
gemini|google_gemini)
    API_TYPE="openai-completions"
    BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"
    ;;
openrouter)
    API_TYPE="openai-completions"
    BASE_URL="https://openrouter.ai/api/v1"
    ;;
```

**CRITICAL:** Check how the entrypoint.sh stores API keys in the OpenClaw credential system. The Gemini key format `AIza...` must work. If there's any validation that checks for `sk-` prefix or rejects non-standard key formats, remove or relax it. The key just needs to be passed as `Authorization: Bearer {key}` in HTTP requests, which the Gemini OpenAI-compatible endpoint accepts.

Review the full entrypoint.sh to understand how credentials are stored (openclaw credential store, environment variables, or config JSON) and ensure AIza keys flow through correctly.

### 4. Frontend: `frontend/src/app/settings/models/page.tsx`

Add to `PROVIDER_BASE_URLS`:
```typescript
gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
openrouter: "https://openrouter.ai/api/v1",
```

Add to `PROVIDER_SUGGESTIONS`:
```typescript
gemini: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"],
openrouter: ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "anthropic/claude-sonnet-4", "openai/gpt-5.4", "meta-llama/llama-4-maverick", "deepseek/deepseek-r1"],
```

Add to `PROVIDER_KEY_PREFIXES`:
```typescript
gemini: "AIza",
openrouter: "sk-or-",
```

Add to `PROVIDER_NOTES` (if it exists):
```typescript
openrouter: "Access 300+ models through one API key. Browse all models at openrouter.ai/models",
```

### 5. Frontend: `frontend/src/components/onboarding/ai-model-step.tsx`

Add gemini and openrouter to the provider selection grid. Add help links:
- gemini: link to `https://aistudio.google.com/apikey`
- openrouter: link to `https://openrouter.ai/keys`

For gemini, add a note: "Get your free API key from Google AI Studio"
For openrouter, add a note: "Access 300+ models from OpenAI, Anthropic, Google, Meta, and more through one API key."

### 6. Frontend: API key auto-detection

In the key prefix auto-detection logic (both settings/models/page.tsx and onboarding/ai-model-step.tsx):
- `AIza` prefix → auto-switch to gemini provider
- `sk-or-` prefix → auto-switch to openrouter provider

Ensure the existing longest-prefix-match logic handles these correctly:
- `AIza` (4 chars) should uniquely match gemini
- `sk-or-` (6 chars) should uniquely match openrouter
- `sk-` (3 chars) still matches multiple providers (moonshot, openai) — no auto-switch

### 7. Landing page provider tags

The landing page at `/var/www/helixnode.tech/index.html` has provider tags in multiple places. Prepare an edited version at `~/landing-page-providers-edit.html`.

First copy current version:
```bash
cp /var/www/helixnode.tech/index.html ~/landing-page-providers-edit.html
```

Add "Google Gemini" and "OpenRouter" to ALL provider tag lists on the page:
```html
<span class="provider-tag">OpenAI</span>
<span class="provider-tag">Anthropic</span>
<span class="provider-tag">Google Gemini</span>
<span class="provider-tag">Moonshot</span>
<span class="provider-tag">NVIDIA NIM</span>
<span class="provider-tag">OpenRouter</span>
<span class="provider-tag">+ Any OpenAI-compatible API</span>
```

Search the entire HTML file for all places where providers are listed and update all of them.

After editing, tell the user: "Landing page ready. Clement needs to run: sudo cp ~/landing-page-providers-edit.html /var/www/helixnode.tech/index.html"

## Apply to Both Production and Staging

1. Apply all backend/frontend/gateway changes to `~/helix-mission-control/` (main branch)
2. Apply same changes to `~/helix-staging/` (staging branch)
3. Rebuild both:
   ```bash
   cd ~/helix-mission-control && docker compose up -d --build backend frontend
   cd ~/helix-staging && docker compose up -d --build backend frontend
   ```

## Testing

After deployment:
1. Go to Settings > AI Models > Add Model
2. Select "Google Gemini" — verify base URL auto-fills, model suggestions appear
3. Select "OpenRouter" — verify base URL auto-fills, model suggestions appear, note shows
4. Paste an `AIza...` key — verify it auto-switches to Google Gemini
5. Paste an `sk-or-...` key — verify it auto-switches to OpenRouter
6. Verify onboarding AI model step shows both new providers
7. If you have a real Gemini key, test connection to verify the AIza key works end-to-end

## After Completion

Update CODEBASE-CONTEXT.md:
- Update Section 5 model_providers.py description to mention 8 providers (was 6)
- Add to Recent Changes

Then:
```bash
cd ~/helix-mission-control && git add -A && git commit -m "feat: add Google Gemini and OpenRouter as native AI providers" && git push
cd ~/helix-staging && git add -A && git commit -m "feat: add Google Gemini and OpenRouter as native AI providers" && git push
```
