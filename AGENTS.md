# Cascade Master — Agent Guide

## Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies (Bun is required, not npm/yarn) |
| `bun dev` | Next.js dev server on port 3000 (binds to localhost by default; use `HOST=0.0.0.0` for network access) |
| `bun run server` | Fastify API server on port 3001 (binds to `0.0.0.0` for network access) |
| `bun run lint` | ESLint (flat config, `eslint.config.mjs`) |
| `bun run typecheck` | `tsc --noEmit` — **skips `src/server/**/*`** (excluded in `tsconfig.json`) |
| `bun run test` | Runs `test.sh` — starts server, runs curl-based integration tests |
| `bun run build` | `next build && bun run build:server` (server build is a no-op placeholder) |
| `bun run start` | Production: `bun src/server/index.ts` on port 3001 |

## Important Setup Notes

- The Next.js config (`next.config.ts`) contains a rewrite rule that proxies `/api` to `http://localhost:3001/api/:path*` (API server port). This allows the UI to communicate with the API server.
- After fixing, run:
  - API server: `bun run server`
  - UI server (network accessible): `HOST=0.0.0.0 PORT=3000 bun dev`
- Then the UI will be available at `http://<machine-ip>:3000` and the API at `http://<machine-ip>:3001`.
- **Note on network access**: The machine's actual IP address (shown by `ip addr show`) may differ from the external IP used for SSH connections due to NAT/gateway forwarding. For external access via the SSH IP, port forwarding must be configured on the network gateway for ports 3000 (UI) and 3001 (API).

## Architecture

**Dual-server app**: Next.js UI (`src/app/`) + Fastify API server (`src/server/`).

- UI entry: `src/app/page.tsx` — tabbed management interface (Dashboard, Providers, Models, Cascade Rules, Analytics, Auth)
- API entry: `src/server/index.ts` — Fastify on port 3001, all routes defined inline
- CLI entry: `bin/cascade-master.js` — spawns `bun src/server/index.ts`
- Cascade engine: `src/server/routes/api/cascade.ts` — task-aware routing with spillover, SSE streaming, tool calling, and response caching
- Components: `src/components/cascade/` — one React component per UI tab
- Path alias: `@/*` → `src/*`

## Database

SQLite via Drizzle ORM (`drizzle-orm/bun-sqlite`). Auto-initializes on import with schema + default data (3 providers, 3 models, 3 cascade rules, 1 auth key). File: `./cascade.db` (in `.gitignore` — do not commit runtime files).

## Authentication

- **Skipped** when `NODE_ENV=development` or request URL is `/health` or header `x-internal` is set
- Default key in dev: `cascade-master-default-key-2026` (autocreated on first run)
- Auth middleware: `src/server/middleware/auth.ts`

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3001` | Fastify server port |
| `NODE_ENV` | — | Set to `development` to bypass auth |
| `NVIDIA_API_KEY` | — | Provider keys can also be set in UI |
| `GROQ_API_KEY` | — | |
| `OPENROUTER_API_KEY` | — | |

`.env*` files are in `.gitignore`.

## Testing

`test.sh` is a bash script that:
1. Checks if server is running (via `pgrep`); starts one if not
2. Runs curl tests against `localhost:3001`
3. Tests: health, API info, metrics, cascade POST, input validation, keyword detection

No unit test framework is configured.

## TypeScript Quirks

- `tsconfig.json` excludes `src/server/**/*` — server code is only typechecked by Bun at runtime
- `tsc --noEmit` only checks `src/app/` and other non-server TS files
- Server uses Bun-native features (`bun:sqlite`, `import.meta.url`) so AI edits to `src/server/` won't be caught by `bun run typecheck`

## Deployment / Operations

- PM2: `ecosystem.config.js` (start via `pm2 start ecosystem.config.js`)
- Systemd: `cascade-master.service`
- Installer: `install.sh` — clones repo, installs deps, creates systemd service
- Next.js config: `output: 'standalone'`
- Prebuilt deploy package: `cascade-deploy/` directory + `cascade-deploy.tar.gz`

## API Endpoints

### Core
- `POST /api/cascade` — Send LLM request through cascade engine (OpenAI-compatible, supports streaming, tool calling, and response caching)
- `GET /api/cascade` — API status info
- `POST /api/chat/completions` — OpenAI-compatible endpoint alias (for external tools)
- `POST /v1/chat/completions` — Standard OpenAI path alias
- `GET /health` — Health check (no auth)

### Providers
- `GET /api/providers` — List all providers
- `POST /api/providers` — Create/update provider
- `DELETE /api/providers` — Delete all providers and models

### Models
- `GET /api/models` — List all models
- `POST /api/models` — Create/update model
- `DELETE /api/models` — Delete all models
- `DELETE /api/models/provider/:id` — Delete models by provider
- `POST /api/models/test` — Test if a model works (sends minimal request)
- `GET /api/models/discover/:providerId` — Discover available models from provider
- `POST /api/models/bulk` — Bulk import models

### Cascade Rules
- `GET /api/cascade-rules` — List rules
- `POST /api/cascade-rules` — Create rule
- `PUT /api/cascade-rules` — Update rule
- `DELETE /api/cascade-rules` — Delete rule

### Other
- `GET /api/analytics` — Analytics and stats
- `GET /api/config/backup` — Export config (keys redacted)

## Style / Conventions

- Tailwind CSS v4 (CSS-first config via `@tailwindcss/postcss` in `postcss.config.mjs`)
- ESLint flat config (`eslint.config.mjs` extending `eslint-config-next`)
- Server Components by default, `"use client"` only for interactivity
- UI components in `src/components/cascade/` are all client components (use state/effects)

## Memory Bank

Context persistence files at `.kilocode/rules/memory-bank/`. After significant changes, update `context.md`.

## Recipes (Template Features)

See `.kilocode/recipes/` for guided feature additions (e.g., `add-database.md`).