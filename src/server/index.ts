import Fastify, { FastifyInstance } from 'fastify';
import corsPlugin from '@fastify/cors';
import staticPlugin from '@fastify/static';
import sensiblePlugin from '@fastify/sensible';
import rateLimitPlugin from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cascadeRoutes, providerCache, modelCache, cascadeEngine, cascadeSchema } from './routes/api/cascade';
import { authenticateRequest, getUserId } from './middleware/auth';
import { validateRequest, validateProviderInput, validateModelInput, validateCascadeRuleInput, validateAuthKeyInput } from './middleware/validation';
import { auditLogPlugin } from './middleware/audit';
import { validateEnv } from './lib/env';
import { db, hashPassword, verifyPassword } from './lib/db';
import { eq, and, sql } from 'drizzle-orm';
import { requestLogs, providers, models as modelsTable, cascadeRules, authKeys, users } from './lib/schema';

// Validate environment variables on startup
const envValidation = validateEnv();
if (envValidation.errors.length > 0) {
  console.error('Environment validation errors:');
  envValidation.errors.forEach(e => console.error(`  ❌ ${e}`));
  process.exit(1);
}
if (envValidation.warnings.length > 0) {
  console.warn('Environment warnings:');
  envValidation.warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
}

// Initialize Fastify server
const fastify: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  },
  bodyLimit: parseInt(process.env.BODY_SIZE_LIMIT || '10485760'), // 10MB default
});

// Register plugins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

// Security headers hook (applied globally to all routes)
fastify.addHook('preHandler', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  } else {
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
  }
});

fastify.register(auditLogPlugin);
fastify.register(corsPlugin, {
  origin: allowedOrigins,
  credentials: true,
});
fastify.register(sensiblePlugin);

// OpenAPI/Swagger documentation
fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Cascade Engine API',
      description: 'AI-ready API for managing LLM providers, models, cascade rules, and routing requests through multiple models with automatic failover.',
      version: '2.0.0',
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Local development' }
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API key for authentication. Get one via POST /api/users/register or POST /api/users/login'
        }
      }
    },
    tags: [
      { name: 'health', description: 'Health and status endpoints' },
      { name: 'users', description: 'User registration, login, and profile' },
      { name: 'cascade', description: 'Main LLM request routing through cascade engine' },
      { name: 'providers', description: 'LLM provider management (NVIDIA, Groq, Mistral, etc.)' },
      { name: 'models', description: 'Model management and discovery' },
      { name: 'cascade-rules', description: 'Routing rules for task-aware model selection' },
      { name: 'auth-keys', description: 'API key management' },
      { name: 'analytics', description: 'Request logs, metrics, and analytics' },
      { name: 'system', description: 'Cache management and configuration' }
    ]
  }
});

fastify.register(swaggerUi, {
  routePrefix: '/api/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true
  }
});

// Global rate limit
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '100');
const rateLimitWindow = process.env.RATE_LIMIT_WINDOW || '1 minute';

fastify.register(rateLimitPlugin, {
  max: rateLimitMax,
  timeWindow: rateLimitWindow,
  keyGenerator: (request) => {
    return (request.headers['x-api-key'] as string) || request.ip || 'unknown';
  },
  errorResponseBuilder: (request, context) => ({
    error: 'Rate limit exceeded',
    message: `Too many requests, please try again later. Limit: ${context.max} requests per ${context.after}`,
    retryAfter: context.after
  }),
});

// Serve Next.js static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', '..', '.next', 'static');

try {
  await fastify.register(staticPlugin, {
    root: publicDir,
    prefix: '/_next/', // only for the static assets
  });
} catch (err) {
  // Static files might not exist yet in development
  // @ts-ignore
  fastify.log.warn('Could not register static plugin:', err);
}

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  reply.send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    version: process.version,
    platform: process.platform,
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024), // MB
    },
    database: 'sqlite', // Could add connection check
    providers: 'configured', // Could add provider health checks
  });
});

// Validate API key endpoint - external apps can test their key here
fastify.post('/api/validate-key', {
  preHandler: [createEndpointRateLimiter(20, '1 minute')],
}, async (request, reply) => {
  try {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.code(400).send({
        error: 'Validation failed',
        message: 'X-API-Key header is required'
      });
    }

    const authKey = await db
      .select()
      .from(authKeys)
      .where(eq(authKeys.keyValue, apiKey))
      .limit(1);

    if (authKey.length === 0) {
      return reply.code(401).send({
        error: 'Authentication failed',
        message: 'Invalid API key'
      });
    }

    const key = authKey[0];

    if (!key.enabled) {
      return reply.code(403).send({
        error: 'Access denied',
        message: 'API key is disabled'
      });
    }

    reply.send({
      success: true,
      message: 'API key is valid',
      key: {
        id: key.id,
        name: key.name,
        permissions: JSON.parse(key.permissions || '["read"]'),
        enabled: key.enabled
      }
    });
  } catch (error) {
    console.error('Key validation error:', error);
    reply.code(500).send({
      error: 'Validation error',
      message: 'Internal server error during validation'
    });
  }
});

// Apply authentication to all API routes except health and validate-key
fastify.addHook('preHandler', async (request, reply) => {
  const publicRoutes = ['/health', '/api/validate-key', '/api/users/register', '/api/users/login', '/api/docs', '/api/docs/', '/api/docs/json', '/api/docs/index.html'];
  if (publicRoutes.some(route => request.url === route || request.url?.startsWith(route))) {
    return;
  }

  const isLocalhost = request.ip === '127.0.0.1' || request.ip === '::1' || request.ip === '::ffff:127.0.0.1';
  if (request.headers['x-internal'] && isLocalhost) {
    return;
  }

  if (request.url?.startsWith('/api/')) {
    await authenticateRequest(request, reply);
  }
});

// Global error handler - sanitize errors in production
fastify.setErrorHandler((error, request, reply) => {
  // Log the full error internally
  fastify.log.error({ err: error, url: request.url, method: request.method }, 'Unhandled error');

  const isProd = process.env.NODE_ENV === 'production';

  // Sanitize error response
  const statusCode = error.statusCode || (reply.statusCode !== 200 ? reply.statusCode : 500);
  const response: any = {
    error: error.name || 'Error',
    message: isProd ? 'Internal server error' : error.message,
  };

  // Only include stack trace in development
  if (!isProd && error.stack) {
    response.stack = error.stack;
  }

  // Include validation details if available
  if (error.validation) {
    response.details = error.validation;
  }

  return reply.code(statusCode).send(response);
});

// Metrics endpoint
fastify.get('/api/metrics', async (request, reply) => {
  try {
    // Get request counts from database
    const totalRequests = await db.$count(requestLogs);
    const todayRequests = await db.$count(requestLogs, eq(requestLogs.timestamp, new Date().toISOString().split('T')[0]));
    const errorCount = await db.$count(requestLogs, eq(requestLogs.status, 'error'));

    // Calculate success rate
    const successRate = totalRequests > 0 ? ((totalRequests - errorCount) / totalRequests * 100).toFixed(1) : '100.0';

    reply.send({
      total_requests: totalRequests,
      today_requests: todayRequests,
      success_rate: `${successRate}%`,
      error_count: errorCount,
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    });
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch metrics' });
  }
});

// Configuration backup endpoint
fastify.get('/api/config/backup', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const [providersData, modelsData, rulesData, authKeysData] = await Promise.all([
      db.select().from(providers).where(eq(providers.userId, userId)),
      db.select().from(modelsTable).where(eq(modelsTable.userId, userId)),
      db.select().from(cascadeRules).where(eq(cascadeRules.userId, userId)),
      db.select().from(authKeys).where(eq(authKeys.userId, userId))
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      providers: providersData,
      models: modelsData,
      cascadeRules: rulesData,
      authKeys: authKeysData.map((key: any) => ({ ...key, keyValue: '[REDACTED]' }))
    };

    reply.header('Content-Disposition', `attachment; filename="cascade-backup-${new Date().toISOString().split('T')[0]}.json"`);
    reply.send(backup);
  } catch (error) {
    reply.code(500).send({ error: 'Failed to create backup' });
  }
});

// Providers CRUD routes
fastify.get('/api/providers', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const result = await db.select().from(providers).where(eq(providers.userId, userId));
    const mapped = result.map(p => ({
      id: p.id,
      name: p.name,
      baseURL: p.baseUrl,
      apiKey: '[REDACTED]',
      status: p.status,
      created: p.createdAt
    }));
    return reply.send(mapped);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to fetch providers' });
  }
});

fastify.post('/api/providers', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const data = request.body as any;
    const validation = validateProviderInput(data);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.error });
    }
    const sanitized = validation.sanitized;

    // Only check for existing provider if an ID was provided (update path)
    const providerId = sanitized.id || data.id;
    const existing = providerId
      ? await db.select().from(providers).where(and(eq(providers.id, providerId), eq(providers.userId, userId))).limit(1)
      : [];

    if (existing.length > 0) {
      const updateData: any = {};
      if (sanitized.name !== undefined) updateData.name = sanitized.name;
      if (sanitized.base_url !== undefined) updateData.baseUrl = sanitized.base_url;
      if (sanitized.api_key !== undefined) updateData.apiKey = sanitized.api_key;
      if (sanitized.status !== undefined) updateData.status = sanitized.status;

      const result = await db.update(providers).set(updateData).where(eq(providers.id, existing[0].id)).returning();

      const mapped = {
        id: result[0].id,
        name: result[0].name,
        baseURL: result[0].baseUrl,
        apiKey: '[REDACTED]',
        status: result[0].status,
        created: result[0].createdAt
      };
      await cascadeEngine.refreshCaches();
      return reply.send(mapped);
    } else {
      const newId = providerId || `provider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const result = await db.insert(providers).values({
        id: newId,
        userId,
        name: sanitized.name || '',
        baseUrl: sanitized.base_url || '',
        apiKey: sanitized.api_key || '',
        status: sanitized.status || 'ready',
        createdAt: sanitized.created_at || new Date().toISOString()
      }).returning();

      const mapped = {
        id: result[0].id,
        name: result[0].name,
        baseURL: result[0].baseUrl,
        apiKey: '[REDACTED]',
        status: result[0].status,
        created: result[0].createdAt
      };
      await cascadeEngine.refreshCaches();
      return reply.code(201).send(mapped);
    }
  } catch (error) {
    console.error('Provider save error:', error);
    return reply.code(500).send({ error: 'Failed to save provider' });
  }
});

// Delete all providers (and their models due to cascade)
fastify.delete('/api/providers', async (request, reply) => {
  try {
    const userId = getUserId(request);
    await db.delete(modelsTable).where(eq(modelsTable.userId, userId));
    await db.delete(providers).where(eq(providers.userId, userId));
    await cascadeEngine.refreshCaches();
    return reply.send({ success: true, message: 'All providers and models deleted' });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to delete providers' });
  }
});

// Delete single provider (and its models)
fastify.delete('/api/providers/:id', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    await db.delete(modelsTable).where(and(eq(modelsTable.providerId, id), eq(modelsTable.userId, userId)));
    await db.delete(providers).where(and(eq(providers.id, id), eq(providers.userId, userId)));
    await cascadeEngine.refreshCaches();
    return reply.send({ success: true, message: `Provider "${id}" and its models deleted` });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to delete provider' });
  }
});

// Models CRUD routes
fastify.get('/api/models', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const result = await db.select().from(modelsTable).where(eq(modelsTable.userId, userId));
    const mapped = result.map(m => ({
      id: m.id,
      name: m.modelId,
      providerId: m.providerId,
      modelId: m.modelId
    }));
    return reply.send(mapped);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to fetch models' });
  }
});

fastify.post('/api/models', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const data = request.body as any;
    const validation = validateModelInput(data);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.error });
    }
    const sanitized = validation.sanitized;

    const existing = await db.select().from(modelsTable).where(and(eq(modelsTable.id, sanitized.id), eq(modelsTable.userId, userId))).limit(1);

    let result;
    if (existing.length > 0) {
      result = await db.update(modelsTable).set({
        providerId: sanitized.providerId,
        modelId: sanitized.modelId,
        contextWindow: sanitized.contextWindow,
        rpmLimit: sanitized.rpmLimit,
        tpmLimit: sanitized.tpmLimit,
        dailyQuota: sanitized.dailyQuota,
        isFree: sanitized.isFree,
        costPerToken: sanitized.costPerToken,
        status: sanitized.status
      }).where(eq(modelsTable.id, sanitized.id)).returning();
    } else {
      result = await db.insert(modelsTable).values({ ...sanitized, userId }).returning();
    }

    return reply.send(result[0]);
  } catch (error) {
    console.error('Model save error:', error);
    return reply.code(500).send({ error: 'Failed to save model' });
  } finally {
    await cascadeEngine.refreshCaches();
  }
});

// Delete all models
fastify.delete('/api/models', async (request, reply) => {
  try {
    const userId = getUserId(request);
    await db.delete(modelsTable).where(eq(modelsTable.userId, userId));
    await cascadeEngine.refreshCaches();
    return reply.send({ success: true, message: 'All models deleted' });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to delete models' });
  }
});

// Delete models by provider
fastify.delete('/api/models/provider/:providerId', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { providerId } = request.params as { providerId: string };
    await db.delete(modelsTable).where(and(eq(modelsTable.providerId, providerId), eq(modelsTable.userId, userId)));
    await cascadeEngine.refreshCaches();
    return reply.send({ success: true, message: `All models for provider ${providerId} deleted` });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to delete models' });
  }
});

// Cascade rules CRUD routes
fastify.get('/api/cascade-rules', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const result = await db.select().from(cascadeRules).where(eq(cascadeRules.userId, userId));
    return reply.send(result);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to fetch cascade rules' });
  }
});

fastify.post('/api/cascade-rules', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const data = request.body as any;
    const validation = validateCascadeRuleInput(data);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.error });
    }
    const result = await db.insert(cascadeRules).values({ ...validation.sanitized, userId }).returning();
    await cascadeEngine.refreshCaches();
    return reply.send(result[0]);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to create cascade rule' });
  }
});

fastify.delete('/api/cascade-rules', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const data = request.body as any;
    if (!data.id) {
      return reply.code(400).send({ error: 'Rule ID is required' });
    }
    await db.delete(cascadeRules).where(and(eq(cascadeRules.id, data.id), eq(cascadeRules.userId, userId)));
    await cascadeEngine.refreshCaches();
    return reply.send({ success: true });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to delete cascade rule' });
  }
});

fastify.put('/api/cascade-rules', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const data = request.body as any;
    if (!data.id) {
      return reply.code(400).send({ error: 'Rule ID is required' });
    }
    const validation = validateCascadeRuleInput(data);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.error });
    }
    const updateData: any = {};
    if (validation.sanitized.name !== undefined) updateData.name = validation.sanitized.name;
    if (validation.sanitized.priority !== undefined) updateData.priority = validation.sanitized.priority;
    if (validation.sanitized.triggerType !== undefined) updateData.triggerType = validation.sanitized.triggerType;
    if (validation.sanitized.triggerValue !== undefined) updateData.triggerValue = validation.sanitized.triggerValue;
    if (validation.sanitized.modelOrder !== undefined) updateData.modelOrder = validation.sanitized.modelOrder;
    if (validation.sanitized.wordLimit !== undefined) updateData.wordLimit = validation.sanitized.wordLimit;
    if (validation.sanitized.enabled !== undefined) updateData.enabled = validation.sanitized.enabled;
    updateData.updatedAt = new Date().toISOString();

    const result = await db.update(cascadeRules).set(updateData).where(and(eq(cascadeRules.id, data.id), eq(cascadeRules.userId, userId))).returning();
    await cascadeEngine.refreshCaches();
    return reply.send(result[0]);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to update cascade rule' });
  }
});

// Auth keys CRUD routes
fastify.get('/api/auth-keys', {
  preHandler: [createEndpointRateLimiter(20, '1 minute')],
}, async (request, reply) => {
  try {
    const userId = getUserId(request);
    const result = await db.select().from(authKeys).where(eq(authKeys.userId, userId));
    const redacted = result.map(k => ({
      ...k,
      keyValue: '[REDACTED]'
    }));
    return reply.send(redacted);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to fetch auth keys' });
  }
});

fastify.post('/api/auth-keys', {
  preHandler: [createEndpointRateLimiter(10, '1 minute')],
}, async (request, reply) => {
  try {
    const userId = getUserId(request);
    const data = request.body as any;
    const validation = validateAuthKeyInput(data);
    if (!validation.valid) {
      return reply.code(400).send({ error: validation.error });
    }
    const sanitized = validation.sanitized;

    // Check if this is an update (id provided and exists)
    const keyId = sanitized.id || data.id;
    if (keyId) {
      const existing = await db.select().from(authKeys).where(and(eq(authKeys.id, keyId), eq(authKeys.userId, userId))).limit(1);
      if (existing.length > 0) {
        // Update existing key
        const updateData: any = {};
        if (sanitized.name !== undefined) updateData.name = sanitized.name;
        if (sanitized.allowedIps !== undefined) updateData.allowedIps = sanitized.allowedIps;
        if (sanitized.permissions !== undefined) updateData.permissions = sanitized.permissions;
        if (sanitized.enabled !== undefined) updateData.enabled = sanitized.enabled;
        if (data.keyValue && data.keyValue !== '[REDACTED]') updateData.keyValue = data.keyValue;
        updateData.updatedAt = new Date().toISOString();

        const result = await db.update(authKeys).set(updateData).where(eq(authKeys.id, existing[0].id)).returning();
        return reply.send(result[0]);
      }
    }

    // Create new key
    let keyValue = data.keyValue;
    if (!keyValue) {
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      keyValue = 'cm-' + Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    const result = await db.insert(authKeys).values({
      id: keyId || `key-${Date.now()}`,
      userId,
      name: sanitized.name,
      keyValue: keyValue,
      allowedIps: sanitized.allowedIps || null,
      permissions: sanitized.permissions || JSON.stringify(['read']),
      enabled: sanitized.enabled !== undefined ? sanitized.enabled : true,
    }).returning();

    return reply.code(201).send({
      ...result[0],
      keyValue: keyValue,
      warning: 'Save this key - it will not be shown again'
    });
  } catch (error) {
    console.error('Auth key save error:', error);
    return reply.code(500).send({ error: 'Failed to save auth key', details: error.message });
  }
});

// Rotate an API key
fastify.post('/api/auth-keys/:id/rotate', {
  preHandler: [createEndpointRateLimiter(5, '1 minute')],
}, async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const existing = await db.select().from(authKeys).where(and(eq(authKeys.id, id), eq(authKeys.userId, userId))).limit(1);
    if (existing.length === 0) {
      return reply.code(404).send({ error: 'Auth key not found' });
    }

    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const newKeyValue = 'cm-' + Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const result = await db.update(authKeys)
      .set({ keyValue: newKeyValue, updatedAt: new Date().toISOString() })
      .where(and(eq(authKeys.id, id), eq(authKeys.userId, userId)))
      .returning();

    return reply.send({
      ...result[0],
      keyValue: newKeyValue,
      warning: 'Save this key - it will not be shown again. The old key is now invalid.'
    });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to rotate auth key' });
  }
});

// Revoke (disable) an API key
fastify.post('/api/auth-keys/:id/revoke', {
  preHandler: [createEndpointRateLimiter(5, '1 minute')],
}, async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const existing = await db.select().from(authKeys).where(and(eq(authKeys.id, id), eq(authKeys.userId, userId))).limit(1);
    if (existing.length === 0) {
      return reply.code(404).send({ error: 'Auth key not found' });
    }

    const result = await db.update(authKeys)
      .set({ enabled: false, updatedAt: new Date().toISOString() })
      .where(and(eq(authKeys.id, id), eq(authKeys.userId, userId)))
      .returning();

    return reply.send({ success: true, message: `Key "${result[0].name}" has been revoked`, key: result[0] });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to revoke auth key' });
  }
});

// Delete an API key
fastify.delete('/api/auth-keys/:id', {
  preHandler: [createEndpointRateLimiter(5, '1 minute')],
}, async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const existing = await db.select().from(authKeys).where(and(eq(authKeys.id, id), eq(authKeys.userId, userId))).limit(1);
    if (existing.length === 0) {
      return reply.code(404).send({ error: 'Auth key not found' });
    }

    if (id === 'default-key') {
      return reply.code(400).send({ error: 'Cannot delete default key. Use revoke instead.' });
    }

    await db.delete(authKeys).where(and(eq(authKeys.id, id), eq(authKeys.userId, userId)));
    return reply.send({ success: true, message: 'Auth key deleted' });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to delete auth key' });
  }
});

// Model test endpoint
fastify.post('/api/models/test', {
  preHandler: [createEndpointRateLimiter(10, '1 minute')],
}, async (request, reply) => {
   try {
     const userId = getUserId(request);
     const { providerId, modelId } = request.body as { providerId: string; modelId: string };

     if (!providerId || !modelId) {
       return reply.code(400).send({ error: 'providerId and modelId are required' });
     }

      // Validate provider exists and belongs to user
      const provider = await db.select().from(providers).where(and(eq(providers.id, providerId), eq(providers.userId, userId))).limit(1);
      if (!provider.length) {
        return reply.code(404).send({ error: 'Provider not found' });
      }

     const p = provider[0];
     const baseUrl = p.baseUrl.endsWith('/') ? p.baseUrl.slice(0, -1) : p.baseUrl;

     // Determine API format based on provider
     let url: string;
     let headers: Record<string, string>;
     let body: any;

     if (p.id === 'gemini' || p.id === 'google') {
       // Google Gemini format
        url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId.replace(/^models\//, '')}:generateContent?key=${p.apiKey}`;
       headers = { 'Content-Type': 'application/json' };
       body = {
         contents: [{ role: 'user', parts: [{ text: 'Say "OK" in one word.' }] }],
         generationConfig: { maxOutputTokens: 10 }
       };
     } else {
       // OpenAI-compatible format
       url = `${baseUrl}/chat/completions`;
       headers = {
         'Authorization': `Bearer ${p.apiKey}`,
         'Content-Type': 'application/json'
       };
       body = {
         model: modelId,
         messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
         max_tokens: 10
       };
     }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (response.ok) {
      return reply.send({
        success: true,
        message: `Model "${modelId}" is working on ${p.name}`,
        response: data
      });
    } else {
      return reply.send({
        success: false,
        message: `Model "${modelId}" failed on ${p.name}`,
        error: data.error?.message || data.message || JSON.stringify(data).slice(0, 200),
        statusCode: response.status,
        response: data
      });
    }
  } catch (error: any) {
    return reply.send({
      success: false,
      message: 'Model test failed',
      error: error.message,
      statusCode: 0
    });
  }
});

// Model discovery routes
fastify.get('/api/models/discover/:providerId', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { providerId } = request.params as { providerId: string };

    const provider = await db.select().from(providers).where(and(eq(providers.id, providerId), eq(providers.userId, userId))).limit(1);
    if (!provider.length) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const p = provider[0];
    console.log(`[DISCOVERY] Looking up: ${providerId}, Found: ${p.id} (${p.name}), Base URL: ${p.baseUrl}`);
    let models: any[] = [];

    try {
      if (p.id === 'openrouter') {
        // OpenRouter model discovery
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const text = await response.text();
          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            return reply.code(502).send({ error: 'Failed to parse OpenRouter response', raw: text.slice(0, 500) });
          }

          if (data.data && Array.isArray(data.data)) {
            models = data.data.map((model: any) => ({
              id: `${p.id}-${model.id.replace('/', '-')}`,
              providerId: p.id,
              modelId: model.id,
              contextWindow: model.context_length || 4096,
              rpmLimit: 50,
              tpmLimit: 10000,
              dailyQuota: 1000,
              isFree: model.pricing?.prompt === '0' && model.pricing?.completion === '0',
              costPerToken: model.pricing?.prompt ? parseFloat(model.pricing.prompt) : 0,
              status: 'ready'
            }));
          }
        }
      } else if (p.id === 'groq') {
        // Groq model discovery
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: {
            'Authorization': `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          models = data.data.map((model: any) => ({
            id: `${p.id}-${model.id}`,
            providerId: p.id,
            modelId: model.id,
            contextWindow: 128000,
            rpmLimit: 30,
            tpmLimit: 10000,
            dailyQuota: 1000,
            isFree: true,
            costPerToken: 0,
            status: 'ready'
          }));
        }
      } else if (p.id === 'nvidia-nim') {
        // NVIDIA NIM - use their model catalog
        const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          models = data.data?.map((model: any) => ({
            id: `${p.id}-${model.id}`,
            providerId: p.id,
            modelId: model.id,
            contextWindow: 128000,
            rpmLimit: 40,
            tpmLimit: 10000,
            dailyQuota: 1000,
            isFree: true,
            costPerToken: 0,
            status: 'ready'
          })) || [];
        }
      } else if (p.id === 'mistral') {
        // Mistral AI model discovery
        const response = await fetch('https://api.mistral.ai/v1/models', {
          headers: {
            'Authorization': `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          models = data.data?.map((model: any) => ({
            id: `${p.id}-${model.id}`,
            providerId: p.id,
            modelId: model.id,
            contextWindow: model.max_context_length || 32000,
            rpmLimit: 30,
            tpmLimit: 10000,
            dailyQuota: 1000,
            isFree: false,
            costPerToken: 0,
            status: 'ready'
          })) || [];
        }
      } else if (p.id === 'gemini' || p.id === 'google') {
        // Google Gemini model discovery
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${p.apiKey}`);

        if (response.ok) {
          const data = await response.json();
          models = data.models?.map((model: any) => ({
            id: `${p.id}-${model.name.replace('models/', '')}`,
            providerId: p.id,
            modelId: model.name.replace('models/', ''),
            contextWindow: model.inputTokenLimit ? Math.floor(model.inputTokenLimit * 1.5) : 32000,
            rpmLimit: 15,
            tpmLimit: 10000,
            dailyQuota: 1000,
            isFree: model.name.includes('flash') || model.name.includes('pro') && !model.name.includes('paid'),
            costPerToken: 0,
            status: 'ready'
          })) || [];
        }
      } else {
        // Generic OpenAI-compatible provider discovery
        // Try the standard OpenAI /models endpoint
        const modelsUrl = p.baseUrl.endsWith('/') ? `${p.baseUrl}models` : `${p.baseUrl}/models`;
        console.log(`[DISCOVERY] Provider: ${p.id}, Base URL: ${p.baseUrl}, Models URL: ${modelsUrl}`);
        const response = await fetch(modelsUrl, {
          headers: {
            'Authorization': `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          const modelList = data.data || data.models || [];
          models = modelList.map((model: any) => ({
            id: `${p.id}-${model.id || model.name}`,
            providerId: p.id,
            modelId: model.id || model.name,
            contextWindow: model.context_length || model.contextWindow || 32000,
            rpmLimit: 30,
            tpmLimit: 10000,
            dailyQuota: 1000,
            isFree: model.isFree || model.pricing === 'free' || false,
            costPerToken: 0,
            status: 'ready'
          }));
        }
      }

      return reply.send(models);
    } catch (error: any) {
      console.error(`Failed to discover models for ${p.id}:`, error);
      return reply.code(500).send({ error: `Failed to discover models: ${error.message}` });
    }
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get provider' });
  }
});

// Bulk model import route
fastify.post('/api/models/bulk', {
  preHandler: [createEndpointRateLimiter(5, '1 minute')],
}, async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { models } = request.body as { models: any[] };

    if (!Array.isArray(models)) {
      return reply.code(400).send({ error: 'Models must be an array' });
    }

    const results = [];
    const errors = [];

    for (const modelData of models) {
      try {
        if (!modelData.providerId || !modelData.modelId) {
          errors.push({ model: modelData, error: 'Missing providerId or modelId' });
          continue;
        }

        const existing = await db.select().from(modelsTable)
          .where(and(
            eq(modelsTable.providerId, modelData.providerId),
            eq(modelsTable.modelId, modelData.modelId),
            eq(modelsTable.userId, userId)
          ))
          .limit(1);

        if (existing.length > 0) {
          errors.push({ model: modelData, error: 'Model already exists' });
          continue;
        }

        const result = await db.insert(modelsTable).values({
          id: modelData.id || `${modelData.providerId}-${modelData.modelId.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
          userId,
          providerId: modelData.providerId,
          modelId: modelData.modelId,
          contextWindow: modelData.contextWindow || 4096,
          rpmLimit: modelData.rpmLimit || 60,
          tpmLimit: modelData.tpmLimit || 10000,
          dailyQuota: modelData.dailyQuota || 1000,
          isFree: modelData.isFree !== undefined ? modelData.isFree : true,
          costPerToken: modelData.costPerToken || 0,
          status: modelData.status || 'ready'
        }).returning();

        results.push(result[0]);
      } catch (error) {
        errors.push({ model: modelData, error: error.message });
      }
    }

    await cascadeEngine.refreshCaches();
    return reply.send({
      success: results.length,
      errors: errors.length,
      inserted: results,
      failed: errors
    });
  } catch (error) {
    return reply.code(500).send({ error: 'Bulk import failed' });
  }
});

// Test specific provider/model route
fastify.post('/api/test', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const data = request.body as any;
    const { providerId, modelId, messages } = data;

    const provider = Array.from(providerCache.values()).find(p => p.id === providerId);
    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const model = modelCache.get(modelId);
    if (!model) {
      return reply.code(404).send({ error: 'Model not found' });
    }

    const { makeApiCall } = await import('./routes/api/cascade');
    const startTime = Date.now();
    const response = await makeApiCall(provider, messages, model.modelId);
    const responseTime = Date.now() - startTime;

    try {
      await db.insert(requestLogs).values({
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        providerId: provider.id,
        modelId: modelId,
        taskType: 'test',
        tokensUsed: response?.usage?.total_tokens || 0,
        responseTimeMs: responseTime,
        status: 'success',
        costSaved: 0
      });
    } catch (logError) {
      console.error('Failed to log test request:', logError);
    }

    return reply.send(response);
  } catch (error: any) {
    console.error('Test API error:', error);
    try {
      const userId = getUserId(request);
      const data = request.body as any;
      await db.insert(requestLogs).values({
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        providerId: data.providerId || 'unknown',
        modelId: data.modelId || 'unknown',
        taskType: 'test',
        tokensUsed: 0,
        responseTimeMs: 0,
        status: 'error',
        errorMessage: error.message || 'Test failed',
        costSaved: 0
      });
    } catch (logError) {
      console.error('Failed to log test request:', logError);
    }
    return reply.code(500).send({
      error: error.message || 'Test failed',
      details: error.details || ''
    });
  }
});

// Analytics endpoint
fastify.get('/api/analytics', async (request, reply) => {
  try {
    const userId = getUserId(request);

    const allLogs = await db.select().from(requestLogs).where(eq(requestLogs.userId, userId)).orderBy(requestLogs.timestamp);

    const statsMap = new Map();
    for (const log of allLogs) {
      const pid = log.providerId || 'unknown';
      if (!statsMap.has(pid)) {
        statsMap.set(pid, {
          providerId: pid,
          requests: 0,
          successes: 0,
          errors: 0,
          totalResponseTime: 0,
          totalTokens: 0,
          totalCostSaved: 0
        });
      }
      const stat = statsMap.get(pid);
      stat.requests++;
      if (log.status === 'success') stat.successes++;
      else stat.errors++;
      stat.totalResponseTime += log.responseTimeMs || 0;
      stat.totalTokens += log.tokensUsed || 0;
      stat.totalCostSaved += log.costSaved || 0;
    }

    const providersList = await db.select().from(providers).where(eq(providers.userId, userId));
    const providerNames = new Map(providersList.map(p => [p.id, p.name]));

    const providerStatsResult = Array.from(statsMap.values()).map(stat => ({
      provider: providerNames.get(stat.providerId) || stat.providerId,
      providerId: stat.providerId,
      requests: stat.requests,
      successRate: stat.requests > 0 ? ((stat.successes / stat.requests) * 100).toFixed(1) : 0,
      averageLatency: stat.requests > 0 ? Math.round(stat.totalResponseTime / stat.requests) : 0,
      costSavings: stat.totalCostSaved.toFixed(2),
      totalTokens: stat.totalTokens
    }));

    const hourlyData = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 3600000);
      const hourStr = hour.toISOString().slice(0, 13) + ':00:00';
      const nextHourStr = new Date(hour.getTime() + 3600000).toISOString().slice(0, 13) + ':00:00';

      const hourLogs = allLogs.filter(log => log.timestamp >= hourStr && log.timestamp < nextHourStr);
      hourlyData.push({
        hour: hour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        requests: hourLogs.length,
        successes: hourLogs.filter(l => l.status === 'success').length,
        errors: hourLogs.filter(l => l.status === 'error').length
      });
    }

     const recentLogs = allLogs.slice(-50).reverse().map(log => ({
       id: log.id,
       timestamp: log.timestamp,
       provider: providerNames.get(log.providerId || '') || log.providerId,
       model: log.modelId,
       taskType: log.taskType,
       status: log.status,
       responseTime: log.responseTimeMs,
       tokensUsed: log.tokensUsed,
       errorMessage: log.errorMessage
     }));

     // --- Fallback Analytics ---
     
     // Fetch cascade rules for name mapping
     const rulesList = await db.select().from(cascadeRules).where(eq(cascadeRules.userId, userId));
     const ruleNames = new Map(rulesList.map(r => [r.id, r.name]));

     // Group logs by parentRequestId (only those with parentRequestId set)
     const parentGroups = new Map<string, any[]>();
     for (const log of allLogs) {
       if (log.parentRequestId) {
         if (!parentGroups.has(log.parentRequestId)) {
           parentGroups.set(log.parentRequestId, []);
         }
         parentGroups.get(log.parentRequestId)!.push(log);
       }
     }

     // Compute overall fallback stats
     let totalParentRequests = parentGroups.size;
     let fallbackRequests = 0; // requests with >1 attempt
     let totalAttempts = 0;
     const ruleStatsMap = new Map<string, any>(); // ruleId -> { totalRequests, successfulRequests, totalAttempts }

     for (const [parentId, logs] of parentGroups) {
       const attempts = logs.length;
       totalAttempts += attempts;
       if (attempts > 1) {
         fallbackRequests++;
       }

       // Get ruleId (should be same for all logs in this group)
       const ruleId = logs[0]?.cascadeRuleId || 'unknown';
       if (!ruleStatsMap.has(ruleId)) {
         ruleStatsMap.set(ruleId, {
           ruleId,
           totalRequests: 0,
           successfulRequests: 0,
           totalAttempts: 0
         });
       }
       const stats = ruleStatsMap.get(ruleId);
       stats.totalRequests++;
       stats.totalAttempts += attempts;
       if (logs.some(l => l.status === 'success')) {
         stats.successfulRequests++;
       }
     }

     // Build rule usage array
     const ruleUsage = Array.from(ruleStatsMap.values()).map(stats => ({
       ruleId: stats.ruleId,
       ruleName: ruleNames.get(stats.ruleId) || stats.ruleId,
       totalRequests: stats.totalRequests,
       successfulRequests: stats.successfulRequests,
       successRate: stats.totalRequests > 0 ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1) : 0,
       avgAttempts: stats.totalRequests > 0 ? (stats.totalAttempts / stats.totalRequests).toFixed(2) : 0
     }));

     const overallFallbackRate = totalParentRequests > 0 ? ((fallbackRequests / totalParentRequests) * 100).toFixed(1) : 0;
     const avgAttemptsPerRequest = totalParentRequests > 0 ? (totalAttempts / totalParentRequests).toFixed(2) : 0;

     // Build recent fallback chains (last 20 parent requests by latest timestamp)
     const sortedParentIds = Array.from(parentGroups.keys()).sort((a, b) => {
       const logsA = parentGroups.get(a)!;
       const logsB = parentGroups.get(b)!;
       const timeA = Math.max(...logsA.map(l => new Date(l.timestamp).getTime()));
       const timeB = Math.max(...logsB.map(l => new Date(l.timestamp).getTime()));
       return timeB - timeA; // descending
     });

     const recentChains = sortedParentIds.slice(0, 20).map(parentId => {
       const logs = parentGroups.get(parentId)!;
       const ruleId = logs[0]?.cascadeRuleId || 'unknown';
       return {
         parentRequestId: parentId,
         ruleId,
         ruleName: ruleNames.get(ruleId) || ruleId,
         totalAttempts: logs.length,
         successful: logs.some(l => l.status === 'success'),
         attempts: logs.sort((a,b) => (a.attemptOrder || 0) - (b.attemptOrder || 0)).map(l => ({
           order: l.attemptOrder,
           providerId: l.providerId,
           modelId: l.modelId,
           status: l.status,
           errorMessage: l.errorMessage
         }))
       };
     });

     return reply.send({
       providerStats: providerStatsResult,
       hourlyData,
       recentLogs,
       totalRequests: allLogs.length,
       totalSuccesses: allLogs.filter(l => l.status === 'success').length,
       totalErrors: allLogs.filter(l => l.status === 'error').length,
       totalCostSaved: allLogs.reduce((sum, l) => sum + (l.costSaved || 0), 0).toFixed(2),
       // New fallback analytics
       fallbackAnalytics: {
         overallFallbackRate: parseFloat(overallFallbackRate),
         avgAttemptsPerRequest: parseFloat(avgAttemptsPerRequest),
         totalCascadeRequests: totalParentRequests,
         ruleUsage,
         recentChains
       }
     });
  } catch (error) {
    console.error('Analytics error:', error);
    return reply.code(500).send({ error: 'Failed to fetch analytics' });
  }
});

// User management endpoints
fastify.post('/api/users/register', {
  schema: {
    tags: ['users'],
    summary: 'Register a new user',
    description: 'Creates a new user account with a unique API key. Each user has isolated providers, models, cascade rules, and logs.',
    body: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string', minLength: 3, maxLength: 50, description: 'Unique username' },
        email: { type: 'string', format: 'email', description: 'Optional email address' },
        password: { type: 'string', minLength: 6, description: 'Password (min 6 characters)' }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          user: { type: 'object', properties: { id: { type: 'string' }, username: { type: 'string' }, role: { type: 'string' } } },
          apiKey: { type: 'string', description: 'Save this - will not be shown again' },
          warning: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { username, email, password } = request.body as any;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required' });
    }

    if (username.length < 3 || username.length > 50) {
      return reply.code(400).send({ error: 'Username must be 3-50 characters' });
    }

    if (password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }

    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Username already exists' });
    }

    const passwordHash = hashPassword(password);
    const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = await db.insert(users).values({
      id: userId,
      username,
      email: email || null,
      passwordHash,
      role: 'user',
      enabled: true
    }).returning();

    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const apiKey = 'cm-' + Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    await db.insert(authKeys).values({
      id: `key-${userId}`,
      userId,
      name: `${username}'s API Key`,
      keyValue: apiKey,
      permissions: JSON.stringify(['read', 'write', 'admin']),
      enabled: true
    });

    // Copy default providers, models, and cascade rules from default-user to new user
    try {
      // First, ensure default-user has providers (re-seed if they were deleted)
      const defaultProviders = await db.select().from(providers).where(eq(providers.userId, 'default-user'));

      if (defaultProviders.length === 0) {
        console.log('Default-user has no providers, re-seeding defaults...');
        const defaultProviderDefs = [
          { id: 'nvidia-nim', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: process.env.NVIDIA_API_KEY || '', status: 'ready' },
          { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY || '', status: 'ready' },
          { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY || '', status: 'ready' },
        ];

        for (const dp of defaultProviderDefs) {
          await db.insert(providers).values({ id: dp.id, userId: 'default-user', name: dp.name, baseUrl: dp.baseUrl, apiKey: dp.apiKey, status: dp.status }).onConflictDoNothing();
        }

        const defaultModelDefs = [
          { id: 'llama-3.1-70b', providerId: 'nvidia-nim', modelId: 'meta/llama-3.1-70b-instruct', contextWindow: 128000, rpmLimit: 40, tpmLimit: 10000, dailyQuota: 1000, isFree: true, costPerToken: 0, status: 'ready' },
          { id: 'llama-3.1-8b-instant', providerId: 'groq', modelId: 'llama-3.1-8b-instant', contextWindow: 128000, rpmLimit: 30, tpmLimit: 10000, dailyQuota: 1000, isFree: true, costPerToken: 0, status: 'ready' },
          { id: 'gemini-1.5-flash', providerId: 'openrouter', modelId: 'google/gemini-2.5-flash', contextWindow: 1000000, rpmLimit: 50, tpmLimit: 10000, dailyQuota: 1000, isFree: true, costPerToken: 0, status: 'ready' },
        ];

        for (const dm of defaultModelDefs) {
          await db.insert(modelsTable).values({ id: dm.id, userId: 'default-user', providerId: dm.providerId, modelId: dm.modelId, contextWindow: dm.contextWindow, rpmLimit: dm.rpmLimit, tpmLimit: dm.tpmLimit, dailyQuota: dm.dailyQuota, isFree: dm.isFree, costPerToken: dm.costPerToken, status: dm.status }).onConflictDoNothing();
        }

        // Re-seed cascade rules if default-user has none
        const defaultRulesCheck = await db.select().from(cascadeRules).where(eq(cascadeRules.userId, 'default-user'));
        if (defaultRulesCheck.length === 0) {
          const defaultRuleDefs = [
            { id: 'coding-rule', name: 'Coding Tasks', priority: 1, triggerType: 'keyword', triggerValue: 'code|program|function|debug|programming', modelOrder: JSON.stringify(['llama-3.1-8b-instant', 'llama-3.1-70b', 'gemini-1.5-flash']), wordLimit: 5, enabled: true },
            { id: 'summarization-rule', name: 'Summarization Tasks', priority: 2, triggerType: 'keyword', triggerValue: 'summarize|extract|analyze|document|summary', modelOrder: JSON.stringify(['gemini-1.5-flash', 'llama-3.1-70b', 'llama-3.1-8b-instant']), wordLimit: 5, enabled: true },
            { id: 'default-rule', name: 'Default Fallback', priority: 99, triggerType: 'task_type', triggerValue: 'general', modelOrder: JSON.stringify(['llama-3.1-70b', 'llama-3.1-8b-instant', 'gemini-1.5-flash']), wordLimit: 5, enabled: true },
          ];
          for (const dr of defaultRuleDefs) {
            await db.insert(cascadeRules).values({ id: dr.id, userId: 'default-user', name: dr.name, priority: dr.priority, triggerType: dr.triggerType, triggerValue: dr.triggerValue, modelOrder: dr.modelOrder, wordLimit: dr.wordLimit, enabled: dr.enabled }).onConflictDoNothing();
          }
        }
      }

      // Re-fetch after potential re-seed
      const providersToCopy = await db.select().from(providers).where(eq(providers.userId, 'default-user'));
      const providerIdMap = new Map<string, string>();

      for (const dp of providersToCopy) {
        const newProviderId = `${dp.id}-${userId}`;
        providerIdMap.set(dp.id, newProviderId);
        await db.insert(providers).values({
          id: newProviderId,
          userId,
          name: dp.name,
          baseUrl: dp.baseUrl,
          apiKey: dp.apiKey,
          status: dp.status,
          createdAt: dp.createdAt
        });
      }

      const modelsToCopy = await db.select().from(modelsTable).where(eq(modelsTable.userId, 'default-user'));
      for (const dm of modelsToCopy) {
        const newProviderId = providerIdMap.get(dm.providerId);
        if (newProviderId) {
          await db.insert(modelsTable).values({
            id: `${dm.id}-${userId}`,
            userId,
            providerId: newProviderId,
            modelId: dm.modelId,
            contextWindow: dm.contextWindow,
            rpmLimit: dm.rpmLimit,
            tpmLimit: dm.tpmLimit,
            dailyQuota: dm.dailyQuota,
            isFree: dm.isFree,
            costPerToken: dm.costPerToken,
            status: dm.status,
            createdAt: dm.createdAt
          });
        }
      }

      const rulesToCopy = await db.select().from(cascadeRules).where(eq(cascadeRules.userId, 'default-user'));
      for (const dr of rulesToCopy) {
        const oldModelOrder = JSON.parse(dr.modelOrder) as string[];
        const newModelOrder = oldModelOrder.map((oldId: string) => `${oldId}-${userId}`);
        await db.insert(cascadeRules).values({
          id: `${dr.id}-${userId}`,
          userId,
          name: dr.name,
          priority: dr.priority,
          triggerType: dr.triggerType,
          triggerValue: dr.triggerValue,
          modelOrder: JSON.stringify(newModelOrder),
          wordLimit: dr.wordLimit,
          enabled: dr.enabled,
          createdAt: dr.createdAt
        });
      }

      await cascadeEngine.refreshCaches();
    } catch (seedError) {
      console.error('Failed to seed default data for new user:', seedError);
    }

    return reply.code(201).send({
      success: true,
      user: { id: result[0].id, username: result[0].username, role: result[0].role },
      apiKey,
      warning: 'Save this API key - it will not be shown again'
    });
  } catch (error: any) {
    console.error('User registration error:', error);
    return reply.code(500).send({ error: 'Failed to register user', details: error.message });
  }
});

fastify.post('/api/users/login', {
  schema: {
    tags: ['users'],
    summary: 'Login and get API key',
    description: 'Authenticate with username/password and retrieve your API key for subsequent requests.',
    body: {
      type: 'object',
      required: ['username', 'password'],
      properties: {
        username: { type: 'string', description: 'Username' },
        password: { type: 'string', description: 'Password' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          user: { type: 'object', properties: { id: { type: 'string' }, username: { type: 'string' }, role: { type: 'string' } } },
          apiKey: { type: 'string', nullable: true }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { username, password } = request.body as any;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required' });
    }

    const user = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (user.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    if (!verifyPassword(password, user[0].passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    if (!user[0].enabled) {
      return reply.code(403).send({ error: 'Account is disabled' });
    }

    const apiKey = await db.select().from(authKeys).where(and(eq(authKeys.userId, user[0].id), eq(authKeys.enabled, true))).limit(1);

    return reply.send({
      success: true,
      user: { id: user[0].id, username: user[0].username, role: user[0].role },
      apiKey: apiKey.length > 0 ? apiKey[0].keyValue : null
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return reply.code(500).send({ error: 'Login failed', details: error.message });
  }
});

fastify.get('/api/users/me', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const user = await db.select({ id: users.id, username: users.username, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }
    return reply.send(user[0]);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to fetch user' });
  }
});

fastify.post('/api/users/change-password', {
  schema: {
    tags: ['users'],
    summary: 'Change your password',
    description: 'Change the password for the currently authenticated user.',
    body: {
      type: 'object',
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string', description: 'Your current password' },
        newPassword: { type: 'string', description: 'New password (min 6 characters)' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { currentPassword, newPassword } = request.body as any;

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return reply.code(400).send({ error: 'New password must be at least 6 characters' });
    }

    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      return reply.code(404).send({ error: 'User not found' });
    }

    if (!verifyPassword(currentPassword, user[0].passwordHash)) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    const newHash = hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));

    return reply.send({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('Password change error:', error);
    return reply.code(500).send({ error: 'Failed to change password', details: error.message });
  }
});

// Cache refresh endpoint - reloads providers/models/rules from DB without restart
fastify.post('/api/cache/refresh', async (request, reply) => {
  try {
    const result = await cascadeEngine.refreshCaches();
    return reply.send({ success: true, message: 'Caches refreshed', ...result });
  } catch (error) {
    console.error('Cache refresh error:', error);
    return reply.code(500).send({ error: 'Failed to refresh caches' });
  }
});

// Delete logs endpoint
fastify.delete('/api/logs', async (request, reply) => {
  try {
    const userId = getUserId(request);
    const { olderThan } = (request.query as any) || {};

    if (olderThan) {
      const cutoffDate = new Date(olderThan).toISOString();
      const result = await db.delete(requestLogs).where(sql`${requestLogs.timestamp} < ${cutoffDate}`).where(eq(requestLogs.userId, userId)).run();
      return reply.send({ success: true, message: `Logs older than ${olderThan} deleted`, count: result.changes });
    }

    const result = await db.delete(requestLogs).where(eq(requestLogs.userId, userId)).run();
    return reply.send({ success: true, message: 'All logs deleted', count: result.changes });
  } catch (error) {
    console.error('Failed to delete logs:', error);
    return reply.code(500).send({ error: 'Failed to delete logs', details: error.message });
  }
});

// Per-endpoint rate limiting factory
// Stricter limits for sensitive endpoints
function createEndpointRateLimiter(max: number, timeWindow: string) {
  return async function endpointRateLimit(request: FastifyRequest, reply: FastifyReply) {
    try {
      await fastify.rateLimit({
        max,
        timeWindow,
        keyGenerator: (req) => (req.headers['x-api-key'] as string) || req.ip || 'unknown',
      });
    } catch {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${max} per ${timeWindow}`,
      });
    }
  };
}

// Register API routes
fastify.register(async (fastify) => {
  fastify.post('/api/cascade', {
    ...cascadeSchema,
    preHandler: [
      createEndpointRateLimiter(30, '1 minute'),
      validateRequest,
    ],
  }, cascadeRoutes.POST);

  fastify.get('/api/cascade', {
    schema: {
      tags: ['cascade'],
      summary: 'Get cascade engine status',
      description: 'Returns the current status and available endpoints for the cascade engine.'
    }
  }, cascadeRoutes.GET);
}, { prefix: '' });

// OpenAI-compatible endpoint for external tools (opencode, etc.)
fastify.post('/api/chat/completions', {
  preHandler: [
    createEndpointRateLimiter(30, '1 minute'),
    validateRequest,
  ],
}, cascadeRoutes.POST);

// Standard OpenAI path alias (many tools use /v1/chat/completions)
fastify.post('/v1/chat/completions', {
  preHandler: [
    createEndpointRateLimiter(30, '1 minute'),
    validateRequest,
  ],
}, cascadeRoutes.POST);

// Catch-all route to serve Next.js app for client-side routing
fastify.get('/*', async (request, reply) => {
  // For API routes, we'll handle them separately
  if (request.url?.startsWith('/api/')) {
    // This will be handled by our API routes
    reply.callNotFound();
    return;
  }
  
  // For everything else, serve a simple HTML page (Next.js would normally handle this)
  // In a production build, we'd serve the actual Next.js HTML
  reply.type('text/html').send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Cascade Master</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div id="__next">
          <h1>Cascade Master API Gateway</h1>
          <p>Server is running. API routes available at /api/*</p>
        </div>
      </body>
    </html>
  `);
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3001;
    const address = await fastify.listen({ 
      port: Number(port),
      host: '0.0.0.0'
    });
    // @ts-ignore
    fastify.log.info(`Server listening on ${address}`);
  } catch (err) {
    // @ts-ignore
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    await fastify.close();
    console.log('Server closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();

export default fastify;