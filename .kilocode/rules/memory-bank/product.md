# Product Context: Cascade Master

## Why This Exists

LLM API costs add up fast. Many providers offer generous free tiers (Mistral, Cerebras, Groq, NVIDIA) but each has different models, rate limits, and capabilities. Cascade Master is an intelligent API gateway that maximizes free-tier LLM usage by:

1. Routing requests to the best free model for each task type
2. Automatically failing over to backup models when one fails
3. Tracking usage, costs saved, and provider performance
4. Supporting multiple users with isolated data

## Problems It Solves

1. **Cost** — Routes to free models first, only uses paid when necessary
2. **Reliability** — Automatic spillover across models if one fails or rate-limits
3. **Task Optimization** — Coding tasks go to coding-optimized models, summarization to fast models
4. **Multi-Provider Management** — Single interface to manage 7+ providers and 100+ models
5. **Multi-Tenancy** — Each user has their own providers, models, rules, and API keys

## How It Works

1. User configures LLM providers with their API keys
2. User discovers and imports available models from each provider
3. User creates cascade rules: "if request contains X keywords, try models A→B→C"
4. External tools send requests to `POST /api/cascade` (OpenAI-compatible format)
5. Cascade engine detects task type, matches rules, tries models in priority order
6. If a model fails, automatically tries the next one (spillover)
7. All requests logged with analytics, cost savings, and performance metrics

## Key User Experience Goals

- **Zero Config Start** — Ships with 3 providers, default rules, and admin account
- **Visual Management** — Full UI for providers, models, rules, analytics, and security
- **Drop-in Replacement** — OpenAI-compatible endpoint works with any existing tool
- **Transparent** — See exactly which model handled each request, response times, costs saved

## Target Users

- Developers wanting to maximize free-tier LLM usage
- Teams managing multiple LLM providers
- Anyone building AI-powered tools who wants intelligent model routing

## Integration

Cascade Master exposes an OpenAI-compatible endpoint (`POST /api/chat/completions`) so any tool that supports OpenAI can use it as a provider:
- OpenCode (configured via `opencode.json`)
- Cursor, Continue, Copilot-compatible tools
- Any SDK that supports OpenAI format
