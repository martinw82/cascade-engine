import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

// Create SQLite database
const sqlite = new Database('./cascade.db');

// Enable WAL mode for better concurrency
sqlite.exec("PRAGMA journal_mode = WAL");

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Run migrations (in a real app, you'd use proper migrations)
// For now, we'll create tables manually
function initializeDatabase() {
  // Create providers table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
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
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      context_window INTEGER NOT NULL,
      rpm_limit INTEGER NOT NULL,
      tpm_limit INTEGER NOT NULL,
      daily_quota INTEGER NOT NULL,
      is_free BOOLEAN DEFAULT 1,
      cost_per_token REAL DEFAULT 0,
      status TEXT DEFAULT 'ready',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );
  `);

  // Create cascade_rules table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cascade_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL,
      trigger_type TEXT NOT NULL, -- 'task_type', 'keyword', 'header', 'custom'
      trigger_value TEXT NOT NULL,
      model_order TEXT NOT NULL, -- JSON array of model IDs
      word_limit INTEGER DEFAULT 5,
      enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add word_limit column if it doesn't exist (for existing databases)
  try {
    sqlite.exec(`ALTER TABLE cascade_rules ADD COLUMN word_limit INTEGER DEFAULT 5;`);
  } catch (e) {
    // Column might already exist, ignore
  }

  // Rename provider_order to model_order for existing databases
  try {
    sqlite.exec(`ALTER TABLE cascade_rules RENAME COLUMN provider_order TO model_order;`);
  } catch (e) {
    // Column might already be renamed or not exist, ignore
  }

  // Migrate existing provider_order data to model_order (convert provider IDs to model IDs)
  try {
    // Get all existing cascade rules
    const existingRules = sqlite.prepare('SELECT id, model_order FROM cascade_rules').all() as Array<{id: string, model_order: string}>;

    for (const rule of existingRules) {
      try {
        const providerOrder = JSON.parse(rule.model_order);
        if (Array.isArray(providerOrder) && providerOrder.length > 0) {
          // Convert provider IDs to model IDs (this is a simple mapping for common cases)
          const modelOrder = providerOrder.map((providerId: string) => {
            switch (providerId) {
              case 'groq': return 'llama-3.1-8b-instant';
              case 'nvidia-nim': return 'llama-3.1-70b';
              case 'openrouter': return 'gemini-1.5-flash';
              default: return providerId; // Keep as-is if not recognized
            }
          });

          // Update the rule with new model order
          sqlite.prepare('UPDATE cascade_rules SET model_order = ? WHERE id = ?').run(JSON.stringify(modelOrder), rule.id);
        }
      } catch (e) {
        // Skip if parsing fails
        console.log(`Skipping migration for rule ${rule.id}: ${e.message}`);
      }
    }
  } catch (e) {
    // Migration failed, but don't crash - user can recreate rules if needed
    console.log('Data migration warning:', e.message);
  }

  // Create auth_keys table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_value TEXT NOT NULL UNIQUE,
      allowed_ips TEXT, -- JSON array of allowed IP addresses
      permissions TEXT DEFAULT '["read","write"]', -- JSON array of permissions
      enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create request_logs table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      provider_id TEXT,
      model_id TEXT,
      task_type TEXT,
      tokens_used INTEGER DEFAULT 0,
      response_time_ms INTEGER,
      status TEXT, -- 'success', 'error', 'rate_limit'
      error_message TEXT,
      cost_saved REAL DEFAULT 0,
      client_ip TEXT,
      user_agent TEXT
    );
  `);

  // Insert default data
  initializeDefaultData();
}

function initializeDefaultData() {
  // Check if we already have data
  const providerCount = sqlite.prepare('SELECT COUNT(*) as count FROM providers').get() as { count: number };
  if (providerCount.count > 0) return;

  // Insert default providers
  const providers = [
    {
      id: 'nvidia-nim',
      name: 'NVIDIA NIM',
      base_url: 'https://api.nvidia.com/v1',
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
    INSERT INTO providers (id, name, base_url, api_key, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const provider of providers) {
    insertProvider.run(provider.id, provider.name, provider.base_url, provider.api_key, provider.status);
  }

  // Insert default models
  const models = [
    {
      id: 'llama-3.1-70b',
      provider_id: 'nvidia-nim',
      model_id: 'llama-3.1-70b',
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
      model_id: 'gemini-1.5-flash',
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
    INSERT INTO models (id, provider_id, model_id, context_window, rpm_limit, tpm_limit, daily_quota, is_free, cost_per_token, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const model of models) {
    insertModel.run(
      model.id,
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
    INSERT INTO cascade_rules (id, name, priority, trigger_type, trigger_value, model_order, word_limit, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const rule of cascadeRules) {
    insertRule.run(
      rule.id,
      rule.name,
      rule.priority,
      rule.trigger_type,
      rule.trigger_value,
      rule.model_order,
      rule.word_limit,
      rule.enabled
    );
  }

  // Insert default auth key
  const insertAuthKey = sqlite.prepare(`
    INSERT INTO auth_keys (id, name, key_value, allowed_ips, permissions, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertAuthKey.run(
    'default-key',
    'Default Access Key',
    'cascade-master-default-key-2026',
    JSON.stringify(['127.0.0.1', '::1']),
    JSON.stringify(['read', 'write', 'admin']),
    1
  );
}

// Initialize database on import
initializeDatabase();

export default db;