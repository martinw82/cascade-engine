#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const scriptDir = path.dirname(__filename);
const serverPath = path.join(scriptDir, '..', 'src', 'server', 'index.ts');
const baseUrl = process.env.API_URL || 'http://localhost:3001';

const args = process.argv.slice(2);
const command = args[0];

function makeRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.CASCADE_API_KEY || '',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function startServer() {
  console.log('Starting Cascade Master server...');
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.PORT = process.env.PORT || '3001';

  const child = spawn('bun', ['run', serverPath], {
    stdio: 'inherit',
    cwd: path.join(scriptDir, '..'),
    env: process.env
  });

  child.on('error', (error) => {
    console.error('Failed to start Cascade Master:', error.message);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    process.exit(0);
  });
}

async function showStatus() {
  try {
    const response = await makeRequest('GET', '/api/cascade');
    if (response.status === 200) {
      console.log('✅ Cascade Master is running');
      console.log(`   API: ${baseUrl}`);
      console.log(`   Models: ${response.data.modelCount || 'N/A'}`);
      console.log(`   Rules: ${response.data.ruleCount || 'N/A'}`);
    } else {
      console.log('❌ Cascade Master returned error:', response.status);
    }
  } catch {
    console.log('❌ Cannot connect to Cascade Master');
    console.log(`   Is the server running at ${baseUrl}?`);
  }
}

async function showHealth() {
  try {
    const response = await makeRequest('GET', '/health');
    console.log('Health:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Failed to get health:', error.message);
  }
}

async function listProviders() {
  try {
    const response = await makeRequest('GET', '/api/providers');
    if (response.data && Array.isArray(response.data)) {
      console.log('\nProviders:');
      response.data.forEach(p => {
        console.log(`  - ${p.name} (${p.baseURL}) [${p.status}]`);
      });
    }
  } catch (error) {
    console.error('Failed to list providers:', error.message);
  }
}

async function listModels() {
  try {
    const response = await makeRequest('GET', '/api/models');
    if (response.data && Array.isArray(response.data)) {
      console.log('\nModels:');
      response.data.forEach(m => {
        console.log(`  - ${m.modelId} (${m.provider}, ${m.contextWindow} ctx)`);
      });
    }
  } catch (error) {
    console.error('Failed to list models:', error.message);
  }
}

async function triggerHealthCheck() {
  try {
    const response = await makeRequest('GET', '/health');
    const health = response.data;
    console.log('\nSystem Health:');
    console.log(`  Status: ${health.status}`);
    console.log(`  Uptime: ${Math.floor(health.uptime / 60)} minutes`);
    console.log(`  Memory: ${Math.round(health.memory?.heapUsed / 1024 / 1024)}MB`);
    console.log(`  Platform: ${health.platform}`);
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

async function createBackup() {
  try {
    const response = await makeRequest('GET', '/api/admin/backup');
    if (response.status === 200) {
      const filename = `cascade-backup-${Date.now()}.json`;
      require('fs').writeFileSync(filename, JSON.stringify(response.data, null, 2));
      console.log(`✅ Backup saved to ${filename}`);
    } else {
      console.log('❌ Backup failed:', response.data?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Backup failed:', error.message);
  }
}

async function main() {
  switch (command) {
    case 'start':
      await startServer();
      break;

    case 'status':
      await showStatus();
      break;

    case 'health':
      await showHealth();
      break;

    case 'providers':
      await listProviders();
      break;

    case 'models':
      await listModels();
      break;

    case 'backup':
      await createBackup();
      break;

    case '--help':
    case 'help':
    default:
      console.log(`
Cascade Master CLI - Management Tool

Usage:
  cascade-master <command> [options]

Commands:
  start       Start the Cascade Master server
  status      Check if server is running
  health      Show system health information
  providers   List all configured providers
  models      List all configured models
  backup      Create a configuration backup

Options:
  --help      Show this help message

Environment Variables:
  CASCADE_API_KEY   API key for authenticated commands
  API_URL           Server URL (default: http://localhost:3001)
  PORT              Server port (default: 3001)
      `);
  }
}

main().catch(console.error);