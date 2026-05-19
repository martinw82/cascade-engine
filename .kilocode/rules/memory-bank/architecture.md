# Architecture: Cascade Master

## System Overview

Dual-server architecture: Next.js UI (port 3000) + Fastify API (port 3001). Next.js rewrites `/api/*` to the Fastify server via `next.config.ts`.

```
┌─────────────────────────────────────────────────┐
│  Browser (port 3000)                             │
│  ┌───────────────────────────────────────────┐  │
│  │  Next.js UI (React)                       │  │
│  │  - Dashboard, Providers, Models, Rules    │  │
│  │  - Analytics, Security, Test              │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ /api/* rewrite             │
└─────────────────────┼────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│  Fastify API Server (port 3001)                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Auth Middleware (multi-user, API keys)   │  │
│  │  Validation + Sanitization                │  │
│  │  Rate Limiting                            │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
│  ┌──────────────────▼────────────────────────┐  │
│  │  Cascade Engine                            │  │
│  │  1. Detect task type / keywords            │  │
│  │  2. Match cascade rule                     │  │
│  │  3. Try models in priority order           │  │
│  │  4. Spillover on failure                   │  │
│  │  5. Log request + analytics                │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
│  ┌──────────────────▼────────────────────────┐  │
│  │  SQLite (cascade.db)                       │  │
│  │  - users, providers, models               │  │
│  │  - cascade_rules, auth_keys, request_logs │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Cascade Routing Flow

```
POST /api/cascade
       │
       ▼
┌─────────────────┐
│  Input Valid.   │  ← messages array, max_tokens, etc.
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│  Auth Check     │  ← API key → user → permissions
└───────┬─────────┘
        │
        ▼
┌─────────────────┐
│  Rate Limit     │  ← 30 req/min per key
└───────┬─────────┘
        │
        ▼
┌─────────────────┐     No      ┌─────────────────┐
│  Task Detect    │────────────▶│  Default Model  │
│  (keyword/type) │             │  or fallback    │
└───────┬─────────┘             └─────────────────┘
        │ Yes
        ▼
┌─────────────────┐
│  Match Rule     │  ← Priority-ordered rules
└───────┬─────────┘
        │
        ▼
┌─────────────────┐     Fail     ┌─────────────────┐
│  Try Model 1    │─────────────▶│  Try Model 2    │
└─────────────────┘              └───────┬─────────┘
        │ Success                        │
        ▼                                ▼
┌─────────────────┐              ┌─────────────────┐
│  Return Response│              │  ...spillover... │
└─────────────────┘              └─────────────────┘
```

## Database Schema

```
users ──┬── providers ──┬── models
        │               │
        ├── cascade_rules
        │
        ├── auth_keys
        │
        └── request_logs
```

All tables have `user_id` FK for multi-user isolation. Cascade delete on user deletion.

## Key Design Decisions

1. **Model-specific routing** (not provider-level) — granular control over which exact model handles each task
2. **Drizzle ORM with `and()`** — chained `.where()` overwrites; always use `and(eq(), eq())`
3. **SQLite file-based** — zero-config persistence, survives reboots
4. **One-time seeding** — `settings` table tracks `defaults_seeded` to prevent duplicate data on restart
5. **OpenAI-compatible** — `POST /api/chat/completions` accepts standard format, enabling integration with any OpenAI-compatible tool

## Authentication Flow

```
User → POST /api/users/login → username/password → returns API key
     → All subsequent requests → X-API-Key header → auth middleware
     → Middleware: key → user → permissions → request proceeds
```

## Deployment

- `output: 'standalone'` in next.config.ts
- Dockerfile included
- render.yaml for Render.com
- systemd service + PM2 config
- install.sh for one-click setup
