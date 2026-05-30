# Technical Context: Cascade Master

## Technology Stack

| Technology   | Purpose |
| ------------ | ------- |
| Next.js 16   | React framework with App Router (UI) |
| Fastify      | High-performance API server |
| React 19     | UI library |
| TypeScript 5.9 | Type-safe JavaScript |
| Tailwind CSS 4 | Utility-first CSS |
| Bun          | Package manager + runtime |
| SQLite       | File-based database |
| Drizzle ORM  | Type-safe SQL queries |

## Development Commands

```bash
bun install              # Install dependencies
bun dev                  # Next.js dev server (port 3000)
bun run server           # Fastify API server (port 3001)
bun run test             # Integration tests (test.sh)
bun run lint             # ESLint
bun run typecheck        # tsc --noEmit (excludes src/server/**)
bun run build            # next build + server build
```

## Server Startup

```bash
# Terminal 1: API server
NODE_ENV=development bun run server

# Terminal 2: UI server
NODE_ENV=development HOST=0.0.0.0 PORT=3000 bun dev
```

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3001` | Fastify server port |
| `NODE_ENV` | — | Set to `development` to bypass auth |
| `NVIDIA_API_KEY` | — | Provider key (also settable in UI) |
| `GROQ_API_KEY` | — | Provider key (also settable in UI) |
| `OPENROUTER_API_KEY` | — | Provider key (also settable in UI) |

## Key Dependencies

### Server
- `fastify` — API framework
- `@fastify/cors` — CORS handling
- `@fastify/rate-limit` — Rate limiting
- `@fastify/swagger` + `@fastify/swagger-ui` — API docs
- `@fastify/static` — Serve Next.js build
- `drizzle-orm` + `bun:sqlite` — Database
- `@fastify/sensible` — Error handling

### UI
- `next` — Framework
- `react` + `react-dom` — UI
- `tailwindcss` — Styling

## TypeScript Quirks

- `tsconfig.json` excludes `src/server/**/*` — server code is only typechecked by Bun at runtime
- `tsc --noEmit` only checks `src/app/` and non-server TS files
- Server uses Bun-native features (`bun:sqlite`, `import.meta.url`)

## Drizzle ORM Gotcha

**Chained `.where()` calls overwrite each other.** Always use `and()`:

```ts
// WRONG — only the second condition applies
db.select().from(table).where(eq(table.a, x)).where(eq(table.b, y))

// CORRECT — both conditions applied
db.select().from(table).where(and(eq(table.a, x), eq(table.b, y)))
```

## Database

- SQLite via `bun:sqlite`, Drizzle ORM
- File: `./cascade.db` (in `.gitignore`)
- Auto-initializes on import: creates tables + seeds default data
- WAL mode enabled for concurrency
- Default user: `admin` / `admin123`

## API Endpoints

### Core
- `POST /api/cascade` — Cascade LLM request (OpenAI-compatible, supports streaming, tools, caching)
- `POST /api/chat/completions` — OpenAI-compatible endpoint (for external tools)
- `POST /v1/chat/completions` — Standard OpenAI path alias
- `GET /api/cascade` — Engine status
- `GET /health` — Health check (no auth)

### Streaming Details
- Request body: `{ "stream": true, "messages": [...], "temperature": 0.7, "tools": [...] }`
- Response: `text/event-stream` with OpenAI-compatible chunks, terminated by `data: [DONE]`
- Three provider streaming implementations: OpenAI-compatible (SSE parser), Gemini (`streamGenerateContent`), Anthropic (content_block_delta events)
- Spillover: retries on HTTP/connection errors before first chunk; once streaming, commits to that model

### User-Agent Task Type Auto-Detection
- When `taskType` is not explicitly set in the request body, the cascade engine inspects `User-Agent` header:
  - opencode → `opencode`
  - claude → `chat`
  - cursor/vscode/windsurf/continue/aider/zed/jetbrains → `coding`
  - github copilot → `coding`
  - curl/httpie/wget → `cli`
- Matches against `task_type` cascade rules; falls through to keyword matching then `general` default

### Model Discovery Timeout
- All discovery endpoints use `fetchWithTimeout(url, options, 15000)` — 15 second timeout
- UI discovery modal uses AbortController with 30 second timeout
- Returns `504 Gateway Timeout` if provider doesn't respond in time

### Users
- `POST /api/users/register` — Create user + API key
- `POST /api/users/login` — Authenticate, get API key
- `GET /api/users/me` — Current user info
- `POST /api/users/change-password` — Change password

### Providers/Models/Rules
- `GET/POST /api/providers` — CRUD
- `GET/POST /api/models` — CRUD
- `POST /api/models/test` — Test a model
- `GET /api/models/discover/:providerId` — Discover available models
- `POST /api/models/bulk` — Bulk import
- `GET/POST/PUT/DELETE /api/cascade-rules` — CRUD

### Auth/Analytics
- `GET/POST/DELETE /api/auth-keys` — API key management
- `GET /api/analytics` — Analytics + stats
- `POST /api/cache/refresh` — Reload caches from DB
- `DELETE /api/logs` — Delete request logs
- `GET /api/docs` — Swagger UI

## Deployment

- Dockerfile included
- `render.yaml` for Render.com
- `cascade-master.service` for systemd
- `ecosystem.config.js` for PM2
- `install.sh` for one-click setup
