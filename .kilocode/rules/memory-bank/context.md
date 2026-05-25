# Active Context: Cascade Master v2.0

## Current State

**Project Status**: 🚀 Cascade Master - Universal AI Traffic Controller
**Version**: 2.1 (streaming, tool calling, response caching)

Intelligent API gateway that routes LLM requests through cascading model chains with task-aware routing, automatic failover, multi-user auth, and real-time analytics.

## Recently Completed (2026-05-25 Session)

### New Features
- [x] **SSE Streaming** — `POST /api/cascade` supports `"stream": true` with token-by-token responses. Handles three provider formats: OpenAI-compatible, Gemini (`streamGenerateContent`), Anthropic (message events). Streaming spillover retries on connection failure, commits once streaming starts.
- [x] **Tool Calling** — `tools` and `tool_choice` parameters forwarded to upstream providers. Works in both streaming and non-streaming modes. Full tool call delta handling in streaming SSE chunks.
- [x] **Response Caching** — In-memory `ResponseCache` class with SHA-256 key generation. 5-min TTL, automatic eviction. Cache hits ~11ms vs ~200ms miss. Streaming bypasses cache.
- [x] **Fallback Analytics** — Added UI in Analytics overview to show which cascade rules were used and which providers failed before successful ones, including fallback rate, average attempts, and recent fallback chains.
- [x] All features verified via integration tests (non-streaming, streaming, tool calling, caching)

### Files Changed
- `src/server/routes/api/cascade.ts` — Major refactor (+518 lines): streaming paths for OpenAI/Gemini/Anthropic, ResponseCache class, tool forwarding, refactored exports with getters
- Documentation: AGENTS.md, README.md, CHANGELOG.md, memory bank updated

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

- [x] Full documentation run (README, USER_GUIDE, API docs)
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

## Latest Session (2026-05-25)

### Discussion
- User inquired about which cascade is used when hitting the API raw, confirming it should be cascade rules set 1, general, trigger "tasks general" unless prepending prompts with keywords like "code"
- User asked about the model I am using; I responded that I am powered by the model named cascade with ID cascade-master/cascade
- User requested updating cascade-engine documentation with latest session history and progress
- Noted that tool calling within opencode appears to have issues where tool calls stop output and return control without results

### Progress
- Updated session history in memory bank
- Verified file paths and project structure
- Confirmed cascade engine logic resides in `src/server/routes/api/cascade.ts`


## Latest Session (2026-05-25 PM)

### Completed: cascade-engine-v0.9 Pre-Release Features

**High Priority (ALL DONE)**
- ✅ Rate limiting: per-user/per-API key with configurable limits and windows, in-memory store with cleanup, management API endpoints, UI form integration
- ✅ Audit logging: full database-backed (`audit_logs` table) with severity levels (info/warning/error/critical), auto-cleanup (30 day retention), admin API endpoints with pagination/filtering, `createAuditLog()` helper for manual logging
- ✅ Enterprise security: JWT auth via Bearer token support, `Authorization: Bearer <token>` alongside existing API key auth, AES-256-GCM encryption for provider API keys at rest, proper CIDR-based IP restriction matching, enhanced auth helpers (`isAdmin`, `getUsername`, `getUserRole`)
- ✅ Admin panel: User management UI with CRUD, per-user analytics (provider usage, cascade rule usage, success rates, cost savings), system overview dashboard, role badge indicators
- ✅ Monitoring dashboard: System health metrics (uptime, memory heap/RSS, platform info), enhanced Analytics component with System Health tab, request rate overview

**Medium Priority (ALL DONE)**
- ✅ Webhook system: webhooks table in schema, CRUD API endpoints, event-driven `triggerWebhooks()` service with validation (8 event types: cascade.success/error/fallback, provider.error, rate_limit.exceeded, auth.failure), configurable retry/timeout/secret, test endpoint
- ✅ Backup/Restore: export full config backup (users, providers, models, cascade rules, auth keys, webhooks), selective restore (providers/models/rules only for safety), admin-only access
- ✅ CLI tool enhancement: status, health, providers list, models list, backup commands with colored output
- ✅ Rate limit management API endpoints (GET/PUT per-key, GET admin stats)
- ✅ OpenAPI spec updates for all new endpoints

**Deferred (Post-v0.9)**
- ❌ Multi-tenant
- ❌ SSO
- ❌ Business monetization
- ❌ Infrastructure scaling
- ❌ Platform ecosystem

**Pending (v0.9 Medium/Low)**
- ⏳ SDK libraries (Python, JavaScript, Go)
- ⏳ Model benchmarking interface
- ⏳ Cost calculator
- ⏳ A/B testing framework
- ⏳ Community marketplace
- ⏳ Plugin ecosystem
- ⏳ Rollback capabilities
- ⏳ Postman collection

### Git Status
- Commit `e00fd14` ready with v0.9 changes
- 13 files changed, 2095 insertions, 104 deletions
- Push blocked by GitHub internal server error (transient)
- To push: `git push origin main`
