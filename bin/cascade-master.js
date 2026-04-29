#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get the directory where this script is located
const scriptDir = path.dirname(__filename);
const serverPath = path.join(scriptDir, '..', 'src', 'server', 'index.ts');

// Set default environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3001';

// Start the Cascade Master server
const child = spawn('bun', ['run', serverPath], {
  stdio: 'inherit',
  cwd: path.join(scriptDir, '..'),
  env: process.env
});

child.on('error', (error) => {
  console.error('Failed to start Cascade Master:', error.message);

  // Fallback to node if bun is not available
  if (error.code === 'ENOENT') {
    console.log('Bun not found, trying with Node.js...');
    const nodeChild = spawn('node', ['--loader', 'ts-node/esm', serverPath], {
      stdio: 'inherit',
      cwd: path.join(scriptDir, '..'),
      env: process.env
    });

    nodeChild.on('error', (nodeError) => {
      console.error('Failed to start with Node.js either:', nodeError.message);
      console.log('Please ensure you have Bun or Node.js with TypeScript support installed.');
      process.exit(1);
    });
  }
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(0);
});