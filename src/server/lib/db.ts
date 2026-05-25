import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

// Create SQLite database
const sqlite = new Database('./cascade.db');

// Enable WAL mode for better concurrency
sqlite.exec("PRAGMA journal_mode = WAL");

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Run migrations
function initializeDatabase() {
  // Create users table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create providers table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      status TEXT DEFAULT 'ready',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create models table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      context_window INTEGER NOT NULL,
      rpm_limit INTEGER NOT NULL,
      tpm_limit INTEGER NOT NULL,
      daily_quota INTEGER NOT NULL,
      is_free INTEGER DEFAULT 1,
      cost_per_token REAL DEFAULT 0,
      status TEXT DEFAULT 'ready',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create cascade_rules table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cascade_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_value TEXT NOT NULL,
      model_order TEXT NOT NULL,
      word_limit INTEGER DEFAULT 5,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create auth_keys table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_value TEXT NOT NULL UNIQUE,
      allowed_ips TEXT,
      permissions TEXT DEFAULT '["read","write"]',
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create request_logs table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      parent_request_id TEXT,
      cascade_rule_id TEXT,
      attempt_order INTEGER,
      provider_id TEXT,
      model_id TEXT,
      task_type TEXT,
      tokens_used INTEGER DEFAULT 0,
      response_time_ms INTEGER,
      status TEXT,
      error_message TEXT,
      cost_saved REAL DEFAULT 0,
      client_ip TEXT,
      user_agent TEXT
    );
  `);

   // Migrate existing tables: add user_id column if not present
   migrateAddUserIdColumn('providers', 'user_id');
   migrateAddUserIdColumn('models', 'user_id');
   migrateAddUserIdColumn('cascade_rules', 'user_id');
   migrateAddUserIdColumn('auth_keys', 'user_id');
   migrateAddUserIdColumn('request_logs', 'user_id');

   // Migrate request_logs: add new columns for fallback analytics
   migrateAddColumn('request_logs', 'parent_request_id');
   migrateAddColumn('request_logs', 'cascade_rule_id');
   migrateAddColumn('request_logs', 'attempt_order');

   // Assign existing data to default user if user_id is NULL
   assignDataToDefaultUser();

  // Insert default data
  initializeDefaultData();
}

function migrateAddUserIdColumn(tableName: string, columnName: string) {
  try {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT;`);
  } catch (e) {
    // Column might already exist, ignore
  }
}

function migrateAddColumn(tableName: string, columnName: string, columnType: string = 'TEXT') {
  try {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType};`);
  } catch (e) {
    // Column might already exist, ignore
  }
}

function assignDataToDefaultUser() {
  const defaultUser = sqlite.prepare("SELECT id FROM users WHERE id = 'default-user'").get() as { id: string } | undefined;
  if (!defaultUser) return;

  const defaultUserId = defaultUser.id;

  try {
    sqlite.run(`UPDATE providers SET user_id = ? WHERE user_id IS NULL`, defaultUserId);
    sqlite.run(`UPDATE models SET user_id = ? WHERE user_id IS NULL`, defaultUserId);
    sqlite.run(`UPDATE cascade_rules SET user_id = ? WHERE user_id IS NULL`, defaultUserId);
    sqlite.run(`UPDATE auth_keys SET user_id = ? WHERE user_id IS NULL`, defaultUserId);
    sqlite.run(`UPDATE request_logs SET user_id = ? WHERE user_id IS NULL`, defaultUserId);
  } catch (e) {
    console.log('Migration warning: could not assign data to default user:', e.message);
  }
}

function initializeDefaultData() {
  // Create settings table to track if defaults have been seeded
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Check if we've seeded before
  const seeded = sqlite.prepare("SELECT value FROM settings WHERE key = 'defaults_seeded'").get() as { value: string } | undefined;
  if (seeded && seeded.value === 'true') return;

  // Create default user
  const defaultPasswordHash = hashPassword('admin123');
  sqlite.prepare(`
    INSERT OR IGNORE INTO users (id, username, email, password_hash, role, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('default-user', 'admin', 'admin@localhost', defaultPasswordHash, 'admin', 1);

  // Insert default providers
  const providers = [
    {
      id: 'nvidia-nim',
      name: 'NVIDIA NIM',
      base_url: 'https://integrate.api.nvidia.com/v1',
      api_key: process.env.NVIDIA_API_KEY || '',
      status: 'ready'
    },
    {
      id: 'groq',
      name: 'Groq',
      base_url: 'https://api.groq.com/openai/v1',
      api_key: process.env.GROQ_API_KEY || '',
      status: 'ready'
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      base_url: 'https://openrouter.ai/api/v1',
      api_key: process.env.OPENROUTER_API_KEY || '',
      status: 'ready'
    }
  ];

  const insertProvider = sqlite.prepare(`
    INSERT OR IGNORE INTO providers (id, user_id, name, base_url, api_key, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const provider of providers) {
    insertProvider.run(provider.id, 'default-user', provider.name, provider.base_url, provider.api_key, provider.status);
  }

  // Insert default models
  const models = [
    {
      id: 'llama-3.1-70b',
      provider_id: 'nvidia-nim',
      model_id: 'meta/llama-3.1-70b-instruct',
      context_window: 128000,
      rpm_limit: 40,
      tpm_limit: 10000,
      daily_quota: 1000,
      is_free: 1,
      cost_per_token: 0,
      status: 'ready'
    },
    {
      id: 'llama-3.1-8b-instant',
      provider_id: 'groq',
      model_id: 'llama-3.1-8b-instant',
      context_window: 128000,
      rpm_limit: 30,
      tpm_limit: 10000,
      daily_quota: 1000,
      is_free: 1,
      cost_per_token: 0,
      status: 'ready'
    },
    {
      id: 'gemini-1.5-flash',
      provider_id: 'openrouter',
      model_id: 'google/gemini-2.5-flash',
      context_window: 1000000,
      rpm_limit: 50,
      tpm_limit: 10000,
      daily_quota: 1000,
      is_free: 1,
      cost_per_token: 0,
      status: 'ready'
    }
  ];

  const insertModel = sqlite.prepare(`
    INSERT OR IGNORE INTO models (id, user_id, provider_id, model_id, context_window, rpm_limit, tpm_limit, daily_quota, is_free, cost_per_token, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const model of models) {
    insertModel.run(
      model.id,
      'default-user',
      model.provider_id,
      model.model_id,
      model.context_window,
      model.rpm_limit,
      model.tpm_limit,
      model.daily_quota,
      model.is_free,
      model.cost_per_token,
      model.status
    );
  }

  // Insert default cascade rules
  const ruleCount = sqlite.prepare('SELECT COUNT(*) as count FROM cascade_rules').get() as { count: number };
  if (ruleCount.count === 0) {
    const cascadeRules = [
      {
        id: 'coding-rule',
        name: 'Coding Tasks',
        priority: 1,
        trigger_type: 'keyword',
        trigger_value: 'code|program|function|debug|programming',
        model_order: JSON.stringify(['llama-3.1-8b-instant', 'llama-3.1-70b', 'gemini-1.5-flash']),
        word_limit: 5,
        enabled: 1
      },
      {
        id: 'summarization-rule',
        name: 'Summarization Tasks',
        priority: 2,
        trigger_type: 'keyword',
        trigger_value: 'summarize|extract|analyze|document|summary',
        model_order: JSON.stringify(['gemini-1.5-flash', 'llama-3.1-70b', 'llama-3.1-8b-instant']),
        word_limit: 5,
        enabled: 1
      },
      {
        id: 'default-rule',
        name: 'Default Fallback',
        priority: 99,
        trigger_type: 'task_type',
        trigger_value: 'general',
        model_order: JSON.stringify(['llama-3.1-70b', 'llama-3.1-8b-instant', 'gemini-1.5-flash']),
        word_limit: 5,
        enabled: 1
      }
    ];

    const insertRule = sqlite.prepare(`
      INSERT OR IGNORE INTO cascade_rules (id, user_id, name, priority, trigger_type, trigger_value, model_order, word_limit, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of cascadeRules) {
      insertRule.run(
        rule.id,
        'default-user',
        rule.name,
        rule.priority,
        rule.trigger_type,
        rule.trigger_value,
        rule.model_order,
        rule.word_limit,
        rule.enabled
      );
    }
  }

  // Insert default auth key
  const authKeyCount = sqlite.prepare('SELECT COUNT(*) as count FROM auth_keys').get() as { count: number };
  if (authKeyCount.count === 0) {
    const insertAuthKey = sqlite.prepare(`
      INSERT OR IGNORE INTO auth_keys (id, user_id, name, key_value, allowed_ips, permissions, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const defaultApiKey = 'cm-' + Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log(`\n⚠️  NEW DEFAULT API KEY GENERATED ⚠️`);
    console.log(`Key: ${defaultApiKey}`);
    console.log(`Save this key - you will need it to access the API!\n`);

    insertAuthKey.run(
      'default-key',
      'default-user',
      'Default Access Key',
      defaultApiKey,
      null,
      JSON.stringify(['read', 'write', 'admin']),
      1
    );

    // Insert fallback key for UI (hardcoded in components)
    insertAuthKey.run(
      'fallback-key',
      'default-user',
      'UI Fallback Key',
      'cascade-master-default-key-2026',
      null,
      JSON.stringify(['read', 'write', 'admin']),
      1
    );
  } else {
    // Ensure fallback key exists even if other keys were added before
    const fallbackExists = sqlite.prepare("SELECT COUNT(*) as count FROM auth_keys WHERE key_value = 'cascade-master-default-key-2026'").get() as { count: number };
    if (fallbackExists.count === 0) {
      sqlite.prepare(`
        INSERT OR IGNORE INTO auth_keys (id, user_id, name, key_value, allowed_ips, permissions, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'fallback-key',
        'default-user',
        'UI Fallback Key',
        'cascade-master-default-key-2026',
        null,
        JSON.stringify(['read', 'write', 'admin']),
        1
      );
      console.log('Added missing UI fallback key');
    }
  }

  // Mark defaults as seeded
  sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('defaults_seeded', 'true')").run();
}

// Simple password hashing using SHA-256 (for production, use bcrypt)
export function hashPassword(password: string): string {
  const salt = 'cascade-engine-salt-2026';
  const data = new TextEncoder().encode(salt + password);
  // Use Node.js crypto module for synchronous hashing
  const { createHash } = require('crypto');
  return createHash('sha256').update(data).digest('hex');
}

// Verify password against stored hash
export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// Initialize database on import
initializeDatabase();

export default db;
