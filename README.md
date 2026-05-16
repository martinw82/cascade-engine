# Cascade Master 🏔️

**Universal AI Traffic Controller** - Maximize free-tier LLM usage through intelligent routing, task-awareness, and real-time monitoring.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## ✨ Features

- 🚀 **Intelligent Routing** - Automatic model selection based on task type and availability
- 💰 **Cost Optimization** - Maximize free-tier usage, track savings vs GPT-4o pricing
- 🎯 **Task-Aware** - Detects coding, summarization, and general tasks automatically via keyword matching
- 🔄 **Smart Cascading** - Falls back gracefully when models hit rate limits or fail
- 📊 **Real-time Monitoring** - Live dashboard with request tracing and analytics
- 🔐 **Secure Access** - API key authentication with IP restrictions
- ⚡ **High Performance** - Optimized for low-resource environments (1vCPU/1GB RAM)
- 🛠️ **Easy Integration** - Drop-in replacement for OpenAI-compatible APIs
- 🔍 **Model Discovery** - Auto-discover available models from OpenRouter, Groq, NVIDIA, Mistral, and Gemini
- ✅ **Model Testing** - Test models before adding them to verify they work
- 🗑️ **Bulk Operations** - Delete all models/providers or filter by provider

## 🚀 Quick Start

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/martinw82/cascade-engine.git
cd cascade-engine

# Install dependencies (Bun is required)
bun install

# Start servers:
# API server (port 3001)
bun run server

# UI dev server (port 3000)
bun dev
```

### Access the Web Interface

Open [http://localhost:3000](http://localhost:3000) in your browser. The API server runs on port 3001.

**For network access:**
```bash
HOST=0.0.0.0 PORT=3000 bun dev  # UI
PORT=3001 bun run server         # API (already binds to 0.0.0.0)
```

## 📚 Documentation

- **[Complete User Guide](USER_GUIDE.md)** - Step-by-step setup, advanced configuration, and troubleshooting
- **[Session Development Log](SESSION_LOG.md)** - Complete development history and technical implementation details
- **[Production Readiness Report](PRODUCTION_READINESS.md)** - Gap analysis and roadmap for production deployment
- **[Agent Guide](AGENTS.md)** - Internal development commands and architecture reference

## 🛠️ Integration Options

### OpenAI-Compatible API

Replace your OpenAI base URL with Cascade Master's endpoint:

```javascript
// Instead of:
const client = new OpenAI({
  baseURL: "https://api.openai.com/v1",
  apiKey: "sk-..."
});

// Use:
const client = new OpenAI({
  baseURL: "http://your-server-ip:3001/api/cascade",
  apiKey: "your-cascade-api-key"
});
```

**Works with any OpenAI-compatible client:**
- opencode
- Claude Code
- Cursor
- Continue
- Any OpenAI SDK

### Direct API Usage

```bash
curl http://your-server-ip:3001/api/cascade \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, summarize this text: ..."}
    ]
  }'
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (no auth required) |
| GET | `/api/cascade` | API status info |
| POST | `/api/cascade` | Send LLM request through cascade engine |
| GET | `/api/providers` | List all providers |
| POST | `/api/providers` | Create/update provider |
| DELETE | `/api/providers` | Delete all providers and models |
| GET | `/api/models` | List all models |
| POST | `/api/models` | Create/update model |
| DELETE | `/api/models` | Delete all models |
| DELETE | `/api/models/provider/:id` | Delete models by provider |
| POST | `/api/models/test` | Test if a model works |
| GET | `/api/models/discover/:providerId` | Discover available models |
| POST | `/api/models/bulk` | Bulk import models |
| GET | `/api/cascade-rules` | List cascade rules |
| POST | `/api/cascade-rules` | Create cascade rule |
| PUT | `/api/cascade-rules` | Update cascade rule |
| DELETE | `/api/cascade-rules` | Delete cascade rule |
| GET | `/api/analytics` | Get analytics and stats |
| GET | `/api/config/backup` | Export configuration (keys redacted) |

## ⚙️ Configuration

### 1. Add Providers

In the web interface:
1. Go to **Providers** tab
2. Click **"+ Add Provider"**
3. Configure:
   - Provider name (e.g., "NVIDIA NIM")
   - Base URL (e.g., `https://integrate.api.nvidia.com/v1`)
   - API Key

### 2. Configure Models

1. Go to **Models** tab
2. Use **🔍 Discover Models** to auto-discover, or add manually
3. **Test models** before adding to verify they work
4. Configure context window, RPM/TPM limits, daily quotas

### 3. Set Up Cascade Rules

1. Go to **Cascade** tab
2. Create routing rules with:
   - **Trigger type**: Keyword match (regex), task type, header match, or custom
   - **Trigger value**: Keywords like `summarize|extract|analyze`
   - **Model order**: Drag-and-drop to set priority order
   - **Word limit**: How many words from message start to check for keywords
3. Rules are evaluated by priority (lower number = higher priority)

### 4. Configure Security

1. Go to **Security** tab
2. Add API keys with optional IP restrictions
3. Set permissions (read, write, admin)

## 📊 Monitoring

### Web Dashboard
- **Real-time logs** - Live request tracing with error details
- **Statistics** - Success rates, costs saved, response times
- **Heatmaps** - Usage patterns by provider and time
- **Performance metrics** - Latency and throughput

### Error Reporting
Every request is logged with full error details:
- HTTP status codes mapped to user-friendly messages
- Raw provider error messages included
- Model/provider identification in error output
- Response time tracking

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐
│   Your Tools    │────│  Cascade Master  │
│                 │    │   API Gateway    │
│ opencode        │    │   (Fastify)      │
│ Claude Code     │    │                  │
│ Cursor          │    │ ┌──────────────┐ │
│ Any OpenAI      │────│ │   Cascade    │ │
│ Compatible      │    │ │   Engine     │ │
└─────────────────┘    │ └──────────────┘ │
                       │                  │
                       │ ┌──────────────┐ │
                       │ │  Models      │ │
                       │ │              │ │
                       │ │ NVIDIA NIM   │ │
                       │ │ Groq         │ │
                       │ │ OpenRouter   │ │
                       │ │ Mistral      │ │
                       │ │ Gemini       │ │
                       │ └──────────────┘ │
                       └──────────────────┘

┌─────────────────┐
│   Web UI        │
│   (Next.js)     │
│                 │
│ Dashboard       │
│ Providers       │
│ Models          │
│ Cascade Rules   │
│ Analytics       │
│ Security        │
└─────────────────┘
```

## 🔧 Advanced Configuration

### Environment Variables

```bash
# Server configuration
PORT=3001                    # API server port (default: 3001)
NODE_ENV=development         # Skips auth when set to "development"

# Provider API keys (optional, can be set in UI)
NVIDIA_API_KEY=your_key
GROQ_API_KEY=your_key
OPENROUTER_API_KEY=your_key
```

### Database

Cascade Master uses SQLite for configuration persistence:
- **Location**: `./cascade.db`
- **Tables**: providers, models, cascade_rules, auth_keys, request_logs
- **Mode**: WAL (Write-Ahead Logging) for concurrent access

### Supported Provider Formats

The cascade engine automatically handles different API formats:
- **OpenAI-compatible** (Groq, Mistral, OpenRouter, NVIDIA NIM, etc.)
- **Google Gemini** (generativelanguage.googleapis.com)
- **Anthropic** (api.anthropic.com)

## 🚀 Deployment Options

### Systemd (Linux)

```bash
sudo cp cascade-master.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cascade-master
sudo systemctl start cascade-master
```

### PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

### Standalone Deploy

```bash
bun run build                    # Build Next.js + server
tar -czf cascade-deploy.tar.gz cascade-deploy/
# Transfer and extract on target server
cd cascade-deploy && bun run start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [Fastify](https://fastify.dev/)
- Database powered by [Drizzle ORM](https://orm.drizzle.team/) and SQLite
- UI styled with [Tailwind CSS](https://tailwindcss.com/)

---

For support, check the documentation or open an issue on GitHub.
