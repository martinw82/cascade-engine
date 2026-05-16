# Session Development Log

## Session: 2026-05-16

### Context Recovery
- Session had crashed, recovered from git history and memory bank
- Found 16 modified files and several untracked files
- Both servers had crashed, restarted them
- Database (`cascade.db`) was intact with all data

### Changes Made

#### 1. Git Cleanup
- Committed all pending work (27 files, 2041 insertions)
- Removed runtime files from git tracking:
  - `cascade.db`, `cascade.db-shm`, `cascade.db-wal`
  - `server.log`, `ui.log`
- Added these to `.gitignore` to prevent future commits
- Pushed to `github.com/martinw82/cascade-engine`

#### 2. Drag-and-Drop Model Reordering
- **File**: `src/components/cascade/Cascade.tsx`
- Added drag-and-drop reordering for model order in cascade rules
- Uses native HTML5 drag events (`draggable`, `onDragStart`, `onDragOver`, `onDragEnd`)
- Visual feedback with opacity change during drag
- Kept arrow buttons for precise adjustments
- Users can now easily reorder large model lists

#### 3. Model Testing System
- **Problem**: Auto-discovery was importing broken models (invalid model IDs, unsupported models)
- **Files**: `src/server/index.ts`, `src/components/cascade/Models.tsx`
- **Solution**:
  - Added `POST /api/models/test` endpoint that sends a minimal test request to validate a model
  - Added "Test" button in model add/edit form with inline result display
  - Added test buttons in discovery modal (per-model + "Test All")
  - Added "Select Working" button to auto-select only verified models
  - Supports OpenAI-compatible, Gemini, and Anthropic formats
  - Returns detailed error messages on failure

#### 4. Bulk Delete Operations
- **Problem**: No way to clean up and start fresh with providers/models
- **Files**: `src/server/index.ts`, `src/components/cascade/Providers.tsx`, `src/components/cascade/Models.tsx`
- **Solution**:
  - `DELETE /api/providers` - deletes all providers and models
  - `DELETE /api/models` - deletes all models
  - `DELETE /api/models/provider/:id` - deletes models by provider
  - UI buttons with confirmation dialogs
  - "By Provider" dropdown for selective deletion

#### 5. Bug Fix: Field Name Mismatch
- **File**: `src/server/index.ts`
- Fixed `p.baseURL` → `p.baseUrl` in model test endpoint
- Schema uses `baseUrl` but API response maps to `baseURL`

### Key User Feedback
- NVIDIA models failing with 404 (model not found)
- Mistral models failing with "Invalid model" errors
- Groq models failing with invalid model IDs
- OpenRouter models with `:free` suffix failing
- User wanted to start fresh with clean data
- User confirmed need for verbose error reporting
- User asked about production readiness

### Production Readiness Assessment
Score: **4/10** - Functional prototype, not production-ready

**Critical gaps identified:**
1. Hardcoded credentials in `/api/login` endpoint
2. CORS allows all origins
3. API keys stored in plaintext
4. Default auth key is well-known
5. `x-internal` header bypasses all auth from any IP
6. No database migration system
7. Request logs grow unbounded with no indexes
8. `today_requests` metric is broken
9. Next.js and Fastify not properly integrated
10. No graceful shutdown handling
11. No proper test framework
12. No LICENSE file (now fixed)

**What's working well:**
- Cascade engine logic (task detection, model selection, spillover)
- Multi-provider API format support
- Database schema design with WAL mode
- Request validation middleware
- Error handling with detailed messages
- Model discovery for major providers
- Analytics from real data
- Clean project structure

### Current State
- Both servers running and functional
- All data intact in database
- New features tested and working
- Documentation updated
