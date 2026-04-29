# Cascade Master 🏔️

**Universal AI Traffic Controller** - Maximize free-tier LLM usage through intelligent routing, task-awareness, and real-time monitoring.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## ✨ Features

- 🚀 **Intelligent Routing** - Automatic provider selection based on task type and availability
- 💰 **Cost Optimization** - Maximize free-tier usage, track savings vs GPT-4o pricing
- 🎯 **Task-Aware** - Detects coding, summarization, and general tasks automatically
- 🔄 **Smart Cascading** - Falls back gracefully when providers hit rate limits
- 📊 **Real-time Monitoring** - Live dashboard with request tracing and analytics
- 🔐 **Secure Access** - IP-restricted API keys with granular permissions
- ⚡ **High Performance** - Optimized for 1vCPU/1GB RAM environments
- 🛠️ **Easy Integration** - Drop-in replacement for OpenAI-compatible APIs

## 🚀 Quick Start

### One-Click Installation

```bash
# Download and run the installer
curl -fsSL https://raw.githubusercontent.com/your-repo/cascade-engine/main/install.sh | bash
```

**Or install manually:**

```bash
# Clone the repository
git clone https://github.com/your-repo/cascade-engine.git
cd cascade-engine

# Install dependencies
bun install  # or npm install

# Start the integrated application (UI + API)
PORT=3001 bun run dev  # or set custom port: PORT=58008 bun run dev
```

### Access the Web Interface

Open [http://localhost:3001](http://localhost:3001) (or your custom port) in your browser. You'll be prompted to enter your access key to log in and access the dashboard for configuring providers and monitoring usage.

## 📚 Documentation

- **[Complete User Guide & Tutorial](USER_GUIDE.md)** - Step-by-step setup, advanced configuration, and troubleshooting
- **[Session Development Log](SESSION_LOG.md)** - Complete development history and technical implementation details
- **[Plugin Integration Guide](CASCADE_PLUGIN.md)** - Integration with Kilo CLI and other tools

## 🛠️ Integration Options

### Option 1: Simple API Override (Recommended)

Replace your OpenAI base URL with Cascade Master's endpoint:

```javascript
// Instead of:
const client = new OpenAI({
  baseURL: "https://api.openai.com/v1",
  apiKey: "sk-..."
});

// Use:
const client = new OpenAI({
  baseURL: "http://localhost:3001/api/cascade",
  apiKey: "your-cascade-master-key"  // Optional
});
```

**Works with any tool:**
- Claude Desktop
- OpenClaw
- Cursor
- Any OpenAI-compatible client

### Option 2: CLI Commands

```bash
# Start server
cascade-master

# Or with specific port
PORT=3001 cascade-master

# Check status
curl http://localhost:3001/health

# View API
curl http://localhost:3001/api/cascade
```

## ⚙️ Configuration

### 1. Add Providers

In the web interface (`http://localhost:3001`):

1. Go to **Providers** tab
2. Click **"+ Add Provider"**
3. Configure:
   - Provider name (e.g., "NVIDIA NIM")
   - Base URL (e.g., `https://api.nvidia.com/v1`)
   - API Key

### 2. Configure Models

1. Go to **Models** tab
2. Add models for each provider:
   - Model ID (e.g., `llama-3.1-70b`)
   - Context window, RPM/TPM limits
   - Cost per token (0 for free models)

### 3. Set Up Cascade Rules

1. Go to **Cascade** tab
2. Create routing rules:
   - **Coding Tasks** (priority 1): Routes to fastest coding models
   - **Summarization** (priority 2): Routes to high-context models
   - **General** (priority 99): Fallback for everything else

### 4. Configure Security (Optional)

1. Go to **Security** tab
2. Add API keys with IP restrictions
3. Set permissions (read, write, admin)

## 📊 Monitoring

### Web Dashboard
- **Real-time logs** - Live request tracing
- **Statistics** - Success rates, costs saved
- **Heatmaps** - Usage patterns by provider and time
- **Performance metrics** - Latency and throughput

### API Endpoints
```bash
# Health check
GET /health

# API status
GET /api/cascade

# Send requests
POST /api/cascade
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐
│   Your Tools    │────│  Cascade Master  │
│                 │    │   API Gateway    │
│ Claude Desktop  │    │                  │
│ OpenClaw        │    │ ┌──────────────┐ │
│ Cursor          │    │ │   Cascade    │ │
│ Any OpenAI      │────│ │   Engine     │ │
│ Compatible      │    │ └──────────────┘ │
└─────────────────┘    │                  │
                       │ ┌──────────────┐ │
                       │ │  Providers   │ │
                       │ │              │ │
                       │ │ NVIDIA NIM   │ │
                       │ │ Groq         │ │
                       │ │ OpenRouter   │ │
                       │ │ Anthropic    │ │
                       │ └──────────────┘ │
                       └──────────────────┘
```

## 🔧 Advanced Configuration

### Environment Variables

```bash
# Server configuration
PORT=3001                    # Server port (default: 3001)
NODE_ENV=production          # Environment (development/production)

# Provider API keys (optional, can be set in UI)
NVIDIA_API_KEY=your_key
GROQ_API_KEY=your_key
OPENROUTER_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
```

### Database

Cascade Master uses SQLite for configuration persistence:
- **Location**: `./cascade.db`
- **Tables**: providers, models, cascade_rules, auth_keys, request_logs

### System Service (Linux)

```bash
# Install as system service
sudo cp cascade-master.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cascade-master
sudo systemctl start cascade-master
```

## 🚀 Deployment Options

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci --production
EXPOSE 3001
CMD ["npm", "start"]
```

### PM2
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

### Binary Distribution
```bash
# Build standalone binary
npm run build:binary

# Distribute single executable
./cascade-master
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [Fastify](https://fastify.dev/)
- Database powered by [Drizzle ORM](https://orm.drizzle.team/) and SQLite
- UI styled with [Tailwind CSS](https://tailwindcss.com/)

---

## 📖 Documentation Overview

Cascade Master includes comprehensive documentation:

### 📚 [Complete User Guide](USER_GUIDE.md)
- Step-by-step installation and setup
- Basic and advanced configuration tutorials
- Production deployment guides
- Troubleshooting and optimization tips
- API reference and integration examples

### 📋 [Development Session Log](SESSION_LOG.md)
- Complete development history
- Technical implementation details
- Architecture decisions and rationale
- Testing and validation results
- Future enhancement roadmap

### 🔌 [Plugin Integration Guide](CASCADE_PLUGIN.md)
- Integration with Kilo CLI and other tools
- Simple API override methods
- Advanced plugin development
- Deployment and distribution options

**🎯 You're now a Cascade Master expert!**

For support, check the documentation first, then open an issue on GitHub or join our Discord community.