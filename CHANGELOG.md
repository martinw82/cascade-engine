# Changelog

All notable changes to Cascade Master will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Model testing endpoint (`POST /api/models/test`) - validate models before adding them
- Test button in model add/edit form with inline result display
- Test button in model discovery modal with per-model and "Test All" options
- "Select Working" button in discovery modal to auto-select only verified models
- Drag-and-drop reordering for model order in cascade rules
- Bulk delete endpoints:
  - `DELETE /api/providers` - delete all providers and models
  - `DELETE /api/models` - delete all models
  - `DELETE /api/models/provider/:id` - delete models by provider
- UI buttons for bulk delete with confirmation dialogs
- "By Provider" dropdown in Models tab for selective deletion
- Multi-format API support (Gemini, Anthropic, OpenAI-compatible)
- DELETE and PUT endpoints for cascade rules
- Detailed error reporting with provider-specific error messages
- Model discovery for Mistral, Gemini, and NVIDIA providers

### Changed
- Fixed `baseURL` vs `baseUrl` field name mismatch in model test endpoint
- Updated README with accurate repository URLs and documentation links
- Added LICENSE file (MIT)
- Added `.gitignore` entries for database files and logs

### Fixed
- Login page loading issues
- Provider creation (POST handles both update/create)
- Model discovery for Mistral/Gemini/NVIDIA providers
- Analytics replaced hardcoded data with real request_logs data
- Test suite updated to use `x-internal` header
- Standalone `makeApiCall` function for test endpoint

### Removed
- Database files (`cascade.db*`) and log files from git tracking

## [0.1.0] - 2026-04-29

### Added
- Initial release of Cascade Master
- Fastify API server with cascade engine
- Next.js management UI with tabbed interface
- SQLite persistence with Drizzle ORM
- Task-aware routing with keyword detection
- Provider cascade with spillover logic
- Authentication system with API keys
- Analytics dashboard
- Model configuration UI
- Provider management UI
- Cascade rules management
- Bulk model import with JSON templates
- Model discovery API for OpenRouter, Groq
- Installation script (`install.sh`)
- CLI binary (`bin/cascade-master.js`)
- PM2 configuration
- Systemd service file
- Comprehensive documentation
