# Active Context: Cascade Master v2.0

## Current State

**Project Status**: 🚀 Cascade Master - Universal AI Traffic Controller
**Version**: 2.0 (multi-user, security hardened, OpenAI-compatible)

Intelligent API gateway that routes LLM requests through cascading model chains with task-aware routing, automatic failover, multi-user auth, and real-time analytics.

## Recently Completed (2026-05-18 Session)

### Bug Fixes
- [x] Fixed auth-wrapper infinite "Loading..." hang — added `setIsAuthenticated(false)` before redirect
- [x] Fixed login API endpoint mismatch — frontend called `/api/login`, server had `/api/users/login`
- [x] Fixed login page password hint — showed wrong password (`myn3wp4ssw0rd` vs actual `admin123`)
- [x] Fixed API key not stored on login — login now saves to `cascadeApiKey` localStorage key
- [x] Fixed provider creation overwriting existing — Drizzle chained `.where()` bug across ALL endpoints
- [x] Fixed model discovery returning wrong provider's models — same `.where()` bug
- [x] Fixed model bulk import only adding first model — same `.where()` bug
- [x] Fixed discovery modal test using hardcoded API key — now uses user's actual key
- [x] Fixed model ID collisions — unique IDs with `provider-${Date.now()}-${random}`
- [x] Fixed Turbopack cache corruption — full `.next` cleanup required on restarts
- [x] Fixed `allowedDevOrigins` — added external IP for remote access

### Drizzle ORM `.where()` Bug (Root Cause)
Chained `.where()` calls in Drizzle ORM **overwrite** each other instead of combining. The fix: replace all `.where(eq()).where(eq())` with `.where(and(eq(), eq()))`. Affected 13+ endpoints across providers, models, cascade rules, auth keys, and discovery.

### New Features
- [x] OpenAI-compatible endpoint: `POST /api/chat/completions`
- [x] Cascade rules created: Coding (Codestral→Qwen→Groq70B), Summarization (Cerebras→Mistral→Groq70B), General (Mistral→Cerebras→Groq8B)
- [x] opencode.json config created for using Cascade Master as a provider in OpenCode
- [x] End-to-end cascade routing tested and verified working

## Current Structure

| File/Directory | Purpose |
|----------------|---------|
| `src/app/page.tsx` | Home page with tabbed UI (7 tabs) |
| `src/app/login/page.tsx` | Login page |
| `src/app/auth-wrapper.tsx` | Auth guard with redirect |
| `src/app/layout.tsx` | Root layout with auth providers |
| `src/context/AuthContext.tsx` | API key context (for components) |
| `src/context/UIAuthContext.tsx` | UI auth context (login/logout) |
| `src/components/cascade/Dashboard.tsx` | Live request trace + stats |
| `src/components/cascade/Providers.tsx` | Provider CRUD |
| `src/components/cascade/Models.tsx` | Model CRUD + discovery + bulk import |
| `src/components/cascade/Cascade.tsx` | Cascade rules management |
| `src/components/cascade/Analytics.tsx` | Real analytics dashboard |
| `src/components/cascade/Auth.tsx` | API key management |
| `src/components/cascade/Test.tsx` | Test interface |
| `src/server/index.ts` | Fastify API server (all routes) |
| `src/server/lib/db.ts` | SQLite init + migrations + seeding |
| `src/server/lib/schema.ts` | Drizzle schema (users, providers, models, rules, auth_keys, logs) |
| `src/server/lib/env.ts` | Environment validation |
| `src/server/middleware/auth.ts` | Multi-user auth + permissions |
| `src/server/middleware/validation.ts` | Input sanitization + validation |
| `src/server/middleware/audit.ts` | Audit logging |
| `src/server/middleware/security.ts` | Security headers |
| `src/server/routes/api/cascade.ts` | Cascade engine + routing logic |
| `opencode.json` | OpenCode provider config |

## Next Steps

- [ ] Full documentation run (README, USER_GUIDE, API docs)
- [ ] Prepare for public GitHub release
- [ ] Consider: per-endpoint rate limiting UI, audit log viewer in UI
- [ ] Consider: password reset flow, email notifications

## Default Credentials

- **Username**: `admin`
- **Password**: `admin123`
- **Default API Key**: auto-generated on first run (check Security tab in UI)

## Server URLs

- **UI**: `http://localhost:3000` (or `http://<external-ip>:3000`)
- **API**: `http://localhost:3001` (or `http://<external-ip>:3001`)
- **Swagger Docs**: `http://localhost:3001/api/docs`

## Session History

| Date | Changes |
|------|---------|
| 2026-05-18 PM | User testing session: fixed auth-wrapper hang, login endpoint mismatch, API key storage, Drizzle `.where()` bug (13+ endpoints), model discovery, bulk import, unique ID generation. Created cascade rules. Added OpenAI-compatible endpoint. Tested cascade routing end-to-end. Created opencode.json config. |
