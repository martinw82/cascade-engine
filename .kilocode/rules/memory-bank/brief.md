# Project Brief: Cascade Master

## Purpose

Cascade Master is an intelligent AI traffic controller — a lightweight API gateway that maximizes free-tier LLM usage through model-specific cascade routing, automatic failover, and real-time analytics.

## Target Users

- Developers who want to maximize free-tier LLM usage across multiple providers
- Teams managing multiple LLM providers and models
- Anyone building AI-powered tools who needs intelligent model routing with fallback

## Core Use Case

1. User adds LLM providers (Mistral, Cerebras, Groq, NVIDIA, etc.) with API keys
2. User discovers and imports models from each provider
3. User creates cascade rules mapping task types/keywords to model priority chains
4. External tools send requests via OpenAI-compatible endpoint
5. Cascade engine routes to the best model, with automatic spillover on failure
6. Analytics track usage, success rates, response times, and cost savings

## Key Requirements

### Must Have

- Multi-provider LLM management with API key storage
- Model discovery and bulk import from provider APIs
- Task-aware cascade routing with keyword detection
- Automatic spillover/failover across models
- Multi-user authentication with per-user data isolation
- OpenAI-compatible API endpoint
- Real-time analytics and request logging
- Input validation and rate limiting
- Web-based management UI

### Nice to Have

- Docker deployment
- Systemd/PM2 service management
- Swagger/OpenAPI documentation
- Plugin system for external integrations

## Success Metrics

- All cascade rules correctly route to appropriate models
- Automatic failover works when primary model fails
- OpenAI-compatible endpoint works with external tools (OpenCode, etc.)
- Multi-user isolation prevents data leakage between users
- Zero unhandled errors in production

## Constraints

- Runtime: Bun (required for `bun:sqlite`)
- Database: SQLite (file-based, single-file deployment)
- UI: Next.js 16 + React 19 + Tailwind CSS 4
- API: Fastify on port 3001
- Package manager: Bun
