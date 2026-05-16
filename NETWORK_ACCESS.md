# Network Access Guide for Cascade Master

## Current Status ✅

**Application is running correctly:**
- UI Server: `http://10.3.0.10:3000` → Serving Cascade Master dashboard
- API Server: `http://10.3.0.10:3001` → Health check returns `{"status":"ok"}`
- Next.js proxy: Fixed to correctly forward `/api/*` to port 3001
- Authentication: Bypassed in development mode (default)

## Network Configuration

**This machine's actual network interfaces:**
```
lo: 127.0.0.1/8
eth0: 10.3.0.10/22 (primary interface)
```

**External perspective:**
```
Public IP: 101.32.162.2 (as seen by ifconfig.me and your SSH connection)
```

## Access Methods

### 1. From this machine's terminal (no browser needed)
Install a text-based browser:
```bash
sudo apt update && sudo apt install -y lynx
lynx http://10.3.0.10:3000
```

### 2. From another device on the same local network
Open browser to: `http://10.3.0.10:3000`

### 3. Via your external IP (101.32.162.2) - Requires port forwarding
Your SSH connection works because port 22 is forwarded:
```
External: 101.32.162.2:22  →  Internal: 10.3.0.10:22
```

For the web UI to work via external IP, you need similar forwarding:
```
External: 101.32.162.2:3000  →  Internal: 10.3.0.10:3000  (UI)
External: 101.32.162.2:3001  →  Internal: 10.3.0.10:3001  (API)
```

## Verification Commands

Run these on the machine to confirm everything works internally:
```bash
# Check UI
curl -s http://10.3.0.10:3000 | grep -i "cascade master"

# Check API health
curl -s http://10.3.0.10:3001/health

# Test API endpoint
curl -s -X POST http://10.3.0.10:3001/api/cascade \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}' | head -c 100
```

## Troubleshooting

If you had this working before and now it doesn't via external IP:

1. **Check if port forwarding is still configured** on your router/gateway/cloud provider
2. **Verify no firewall changes** that might block ports 3000/3001
3. **Confirm the external IP hasn't changed** (run `curl ifconfig.me` to check)
4. **Try accessing via local IP first** (`http://10.3.0.10:3000`) to confirm app is running

## Important Notes

- The application binds to `0.0.0.0` so it listens on all available interfaces
- No code changes are needed - the issue is purely network configuration
- Once port forwarding is restored, access via:
  - Dashboard: `http://101.32.162.2:3000`
  - API: `http://101.32.162.2:3001/api/*`

## Quick Test

To verify port forwarding would work if configured:
```bash
# This tests if a service would respond on the external IP
# (Will fail without port forwarding, but shows the app is ready)
timeout 3 curl -s http://101.32.162.2:3000 2>&1 | head -5
```