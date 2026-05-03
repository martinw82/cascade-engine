# Active Context: Next.js Starter Template

## Current State

**Template Status**: 🚀 Cascade Master API Gateway Implementation

The template has been expanded to include a basic implementation of Cascade Master - a lightweight, intelligent API gateway designed to maximize free-tier LLM usage through sophisticated rotation, task-awareness, and real-time monitoring.

## Recently Completed

- [x] Base Next.js 16 setup with App Router
- [x] TypeScript configuration with strict mode
- [x] Tailwind CSS 4 integration
- [x] ESLint configuration
- [x] Memory bank documentation
- [x] Recipe system for common features
- [x] Created Fastify server implementation for Cascade Master API gateway
- [x] Implemented cascade engine with task-aware routing and spillover logic
- [x] Added API routes for handling LLM requests through provider cascade
- [x] Updated home page with tabbed interface for management UI
- [x] Created provider management UI (add/edit/delete providers with API keys)
- [x] Created model configuration UI (add/edit models per provider with limits)
- [x] Added analytics dashboard with provider success rate heatmaps
- [x] Added money saved calculations against GPT-4o pricing
- [x] Created server directory structure with proper TypeScript types
- [x] Upgraded cascade logic from provider-specific to model-specific routing
- [x] Updated database schema to use modelOrder instead of providerOrder
- [x] Modified UI to select models instead of providers for cascade rules
- [x] Updated server cascade engine to iterate through modelOrder with proper provider validation
- [x] Added bulk model import feature with JSON template support
- [x] Implemented model discovery API for automatic model fetching from providers
- [x] Created model discovery UI with provider selection and selective import
- [x] Fixed TypeScript compilation issue by excluding cascade-deploy directory from tsconfig
- [x] Built Next.js application with standalone output for deployment
- [x] Set up cascade-deploy directory with built files for production deployment

## Current Structure

| File/Directory | Purpose | Status |
|----------------|---------|--------|
| `src/app/page.tsx` | Home page with tabbed UI | ✅ Ready |
| `src/app/layout.tsx` | Root layout | ✅ Ready |
| `src/app/globals.css` | Global styles | ✅ Ready |
| `src/components/cascade/Dashboard.tsx` | Live dashboard with logs | ✅ Ready |
| `src/components/cascade/Providers.tsx` | Provider management UI | ✅ Ready |
| `src/components/cascade/Models.tsx` | Model configuration UI | ✅ Ready |
| `src/components/cascade/Cascade.tsx` | Cascade rules management | ✅ Ready |
| `src/components/cascade/Analytics.tsx` | Analytics dashboard | ✅ Ready |
| `src/components/cascade/Auth.tsx` | Authentication management | ✅ Ready |
| `src/server/index.ts` | Fastify server with auth | ✅ Ready |
| `src/server/lib/db.ts` | SQLite database setup | ✅ Ready |
| `src/server/lib/schema.ts` | Database schema definitions | ✅ Ready |
| `src/server/middleware/auth.ts` | IP + key authentication | ✅ Ready |
| `src/server/routes/api/cascade.ts` | Enhanced cascade engine | ✅ Ready |

## Current Focus

Cascade Engine is fully functional with model-specific cascading. The system now intelligently routes LLM requests through prioritized model lists based on task detection (keywords or task types).

## Current State

- ✅ Model-specific cascade engine working
- ✅ Database schema updated for modelOrder
- ✅ UI updated to manage models in cascade rules
- ✅ API endpoints functional
- ✅ Authentication and security in place

## Next Steps

The implementation is complete. Users can now:

1. Configure cascade rules with specific model priorities
2. Monitor request routing through analytics
3. Test cascade behavior with the test interface
4. Deploy the system for production use

## Quick Start Guide

### To add a new page:

Create a file at `src/app/[route]/page.tsx`:
```tsx
export default function NewPage() {
  return <div>New page content</div>;
}
```

### To add components:

Create `src/components/` directory and add components:
```tsx
// src/components/ui/Button.tsx
export function Button({ children }: { children: React.ReactNode }) {
  return <button className="px-4 py-2 bg-blue-600 text-white rounded">{children}</button>;
}
```

### To add a database:

Follow `.kilocode/recipes/add-database.md`

### To add API routes:

Create `src/app/api/[route]/route.ts`:
```tsx
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Hello" });
}
```

## Available Recipes

| Recipe | File | Use Case |
|--------|------|----------|
| Add Database | `.kilocode/recipes/add-database.md` | Data persistence with Drizzle + SQLite |

## Pending Improvements

- [ ] Add more recipes (auth, email, etc.)
- [ ] Add example components
- [ ] Add testing setup recipe

## Session History

| Date | Changes |
|------|---------|
| Initial | Template created with base setup |
| 2026-04-29 AM | Implemented Cascade Master API gateway with Fastify server, cascade engine with task-aware routing, and basic dashboard UI |
| 2026-04-29 PM | Added complete management UI (Providers, Models, Cascade Rules, Analytics, Security), SQLite persistence, authentication system, enhanced cascade engine with queuing, and configurable keyword word limits |
| 2026-04-29 CLI | Created one-click installation script, CLI binary, systemd service, PM2 config, comprehensive README, and plugin integration guides for Kilo CLI and other tools |
| 2026-05-02 | Upgraded cascade system from provider-level to model-specific routing, updated database schema, UI components, and server logic for granular model prioritization |
| 2026-05-02 PM | Added bulk model import with JSON templates and model discovery API with automatic fetching from OpenRouter, Groq, and NVIDIA providers |
| 2026-05-03 | Fixed build issues for standalone deployment, updated tsconfig excludes, and prepared cascade-deploy package |
