import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Providers table
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  status: text('status').default('ready'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Models table
export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(),
  contextWindow: integer('context_window').notNull(),
  rpmLimit: integer('rpm_limit').notNull(),
  tpmLimit: integer('tpm_limit').notNull(),
  dailyQuota: integer('daily_quota').notNull(),
  isFree: integer('is_free', { mode: 'boolean' }).default(true),
  costPerToken: real('cost_per_token').default(0),
  status: text('status').default('ready'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Cascade rules table
export const cascadeRules = sqliteTable('cascade_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  priority: integer('priority').notNull(),
  triggerType: text('trigger_type').notNull(), // 'task_type', 'keyword', 'header', 'custom'
  triggerValue: text('trigger_value').notNull(),
  providerOrder: text('provider_order').notNull(), // JSON array of provider IDs
  wordLimit: integer('word_limit').default(5), // Number of words to check for keyword matching
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Auth keys table
export const authKeys = sqliteTable('auth_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keyValue: text('key_value').notNull().unique(),
  allowedIps: text('allowed_ips'), // JSON array of allowed IP addresses
  permissions: text('permissions').default('["read","write"]'), // JSON array of permissions
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Request logs table
export const requestLogs = sqliteTable('request_logs', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').default('CURRENT_TIMESTAMP'),
  providerId: text('provider_id'),
  modelId: text('model_id'),
  taskType: text('task_type'),
  tokensUsed: integer('tokens_used').default(0),
  responseTimeMs: integer('response_time_ms'),
  status: text('status'), // 'success', 'error', 'rate_limit'
  errorMessage: text('error_message'),
  costSaved: real('cost_saved').default(0),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
});