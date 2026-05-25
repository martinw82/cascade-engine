import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email'),
  passwordHash: text('password_hash').notNull(),
  role: text('role').default('user'), // 'admin', 'user'
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Providers table
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  priority: integer('priority').notNull(),
  triggerType: text('trigger_type').notNull(),
  triggerValue: text('trigger_value').notNull(),
  modelOrder: text('model_order').notNull(),
  wordLimit: integer('word_limit').default(5),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Auth keys table
export const authKeys = sqliteTable('auth_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyValue: text('key_value').notNull().unique(),
  allowedIps: text('allowed_ips'),
  permissions: text('permissions').default('["read","write"]'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  rateLimitMax: integer('rate_limit_max').default(100), // Requests per window
  rateLimitWindow: text('rate_limit_window').default('1 minute'), // Time window
  rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Request logs table
export const requestLogs = sqliteTable('request_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  timestamp: text('timestamp').default('CURRENT_TIMESTAMP'),
  parentRequestId: text('parent_request_id'), // Groups attempts from same cascade
  cascadeRuleId: text('cascade_rule_id'), // Which cascade rule was matched
  attemptOrder: integer('attempt_order'), // Sequence number within cascade (1,2,3...)
  providerId: text('provider_id'),
  modelId: text('model_id'),
  taskType: text('task_type'),
  tokensUsed: integer('tokens_used').default(0),
  responseTimeMs: integer('response_time_ms'),
  status: text('status'),
  errorMessage: text('error_message'),
  costSaved: real('cost_saved').default(0),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
});

// Settings table
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Audit logs table
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').default('CURRENT_TIMESTAMP'),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  username: text('username'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  details: text('details'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  status: text('status').notNull(),
  severity: text('severity').default('info'),
});

// Webhooks table
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: text('events').notNull(), // JSON array of event types
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  secret: text('secret'),
  retryCount: integer('retry_count').default(3),
  timeout: integer('timeout').default(5000),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Marketplace rules table (community-shared cascade rule templates)
export const marketplaceRules = sqliteTable('marketplace_rules', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  triggerType: text('trigger_type').notNull(),
  triggerValue: text('trigger_value').notNull(),
  modelOrder: text('model_order').notNull(),
  wordLimit: integer('word_limit').default(5),
  category: text('category').default('general'),
  tags: text('tags'), // JSON array
  downloads: integer('downloads').default(0),
  likes: integer('likes').default(0),
  rating: real('rating').default(0),
  published: integer('published', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});
