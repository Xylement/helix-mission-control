PROVIDERS = {
    "moonshot": {
        "name": "Moonshot (Kimi K2.5)",
        "base_url": "https://api.moonshot.ai/v1",
        "api_type": "openai-completions",
        "key_prefix": "sk-",
        "default_model": "kimi-k2.5",
        "help_url": "https://platform.moonshot.ai/console/api-keys",
        "models": [
            {"id": "kimi-k2.5", "name": "Kimi K2.5", "context_window": 256000, "max_tokens": 8192},
            {"id": "kimi-k2", "name": "Kimi K2", "context_window": 256000, "max_tokens": 8192},
            {"id": "kimi-k2-thinking", "name": "Kimi K2 Thinking", "context_window": 256000, "max_tokens": 8192},
            {"id": "kimi-k2-turbo-preview", "name": "Kimi K2 Turbo Preview", "context_window": 256000, "max_tokens": 8192},
        ],
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "api_type": "openai-completions",
        "key_prefix": "sk-",
        "default_model": "gpt-4o",
        "models": [
            {"id": "gpt-4o", "name": "GPT-4o", "context_window": 128000, "max_tokens": 16384},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "context_window": 128000, "max_tokens": 16384},
            {"id": "o1", "name": "o1", "context_window": 200000, "max_tokens": 100000},
        ],
    },
    "anthropic": {
        "name": "Anthropic",
        "base_url": "https://api.anthropic.com/v1",
        "api_type": "anthropic",
        "key_prefix": "sk-ant-",
        "default_model": "claude-sonnet-4-20250514",
        "models": [
            {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "context_window": 200000, "max_tokens": 8192},
            {"id": "claude-opus-4-20250514", "name": "Claude Opus 4", "context_window": 200000, "max_tokens": 8192},
        ],
    },
    "nvidia": {
        "name": "NVIDIA NIM",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "api_type": "openai-completions",
        "key_prefix": "nvapi-",
        "default_model": "kimi-k2.5",
        "models": [
            {"id": "kimi-k2.5", "name": "Kimi K2.5 (NIM)", "context_window": 256000, "max_tokens": 8192},
        ],
    },
    "kimi_code": {
        "name": "Kimi Code (Advanced)",
        "base_url": "https://api.kimi.com/coding/",
        "api_type": "anthropic-messages",
        "key_prefix": "sk-kimi-",
        "default_model": "k2p5",
        "note": "Requires manual OpenClaw setup. Use Moonshot provider instead for automatic configuration.",
        "models": [
            {"id": "k2p5", "name": "K2P5", "context_window": 262144, "max_tokens": 32768},
        ],
    },
    "custom": {
        "name": "Custom (OpenAI-compatible)",
        "base_url": "",
        "api_type": "openai-completions",
        "key_prefix": "",
        "default_model": "",
        "models": [],
    },
}


def get_provider_config(provider: str) -> dict:
    return PROVIDERS.get(provider, PROVIDERS["custom"])
