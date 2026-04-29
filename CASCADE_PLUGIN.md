# Cascade Master Skill for Kilo CLI
# Allows Kilo to manage and interact with Cascade Master

## Commands

### cascade:start
Starts the Cascade Master server
```bash
kilo cascade:start
```

### cascade:stop
Stops the Cascade Master server
```bash
kilo cascade:stop
```

### cascade:status
Shows Cascade Master status and configuration
```bash
kilo cascade:status
```

### cascade:config
Opens Cascade Master configuration in your browser
```bash
kilo cascade:config
```

### cascade:logs
Shows recent Cascade Master request logs
```bash
kilo cascade:logs
```

### cascade:add-provider
Adds a new provider to Cascade Master
```bash
kilo cascade:add-provider --name "My Provider" --url "https://api.example.com/v1" --key "sk-..."
```

### cascade:set-rule
Creates or updates a cascade rule
```bash
kilo cascade:set-rule --name "Coding Tasks" --priority 1 --keywords "code,debug,function" --providers "groq,nvidia-nim"
```

## Integration Options

### Option 1: Simple API Override (Recommended)
Your CLI tools just change their API endpoint:

```javascript
// Instead of:
openai.baseURL = "https://api.openai.com/v1"

// Use:
openai.baseURL = "http://localhost:3001/api/cascade"
```

**Pros:**
- ✅ Zero code changes required
- ✅ Works with any OpenAI-compatible tool
- ✅ Configuration managed in Cascade Master's UI

**Cons:**
- ❌ No direct CLI integration for config changes

### Option 2: Kilo CLI Plugin (Advanced)
Full integration with Kilo's command system:

```bash
# Install the skill
kilo skill:install cascade-master

# Use integrated commands
kilo cascade:config  # Opens web UI
kilo cascade:status  # Shows current config
kilo cascade:logs    # Views request logs
```

**Pros:**
- ✅ Full CLI management
- ✅ Integrated with Kilo's workflow
- ✅ Can manage config from command line

**Cons:**
- ❌ More complex to implement
- ❌ Requires Kilo CLI plugin development

## Recommended Approach

For most users, **Option 1 (Simple API Override)** is perfect:

1. **Install Cascade Master** using the installer script
2. **Configure providers** through the web interface at `http://localhost:3001`
3. **Update your tools** to use `http://localhost:3001/api/cascade` as the base URL
4. **Monitor usage** through the web dashboard

This approach gives you:
- ✅ Easy installation and setup
- ✅ Powerful configuration UI
- ✅ Works with any OpenAI-compatible tool
- ✅ No changes needed to existing workflows
- ✅ Full monitoring and analytics

## Example Tool Integration

### For Claude Desktop:
```json
{
  "mcpServers": {
    "cascade-master": {
      "command": "cascade-master",
      "args": [],
      "env": {
        "PORT": "3001"
      }
    }
  }
}
```

### For OpenClaw:
```yaml
tools:
  - name: cascade-master
    command: cascade-master
    port: 3001
```

### For Generic OpenAI Tools:
```javascript
// Replace this:
const client = new OpenAI({
  baseURL: "https://api.openai.com/v1",
  apiKey: "sk-..."
});

// With this:
const client = new OpenAI({
  baseURL: "http://localhost:3001/api/cascade",
  apiKey: "your-cascade-master-key"  // Optional, for authentication
});
```

The simple API override approach makes Cascade Master a **drop-in replacement** for any OpenAI-compatible API, giving you intelligent routing, cost savings, and monitoring without changing how you use your tools! 🎯