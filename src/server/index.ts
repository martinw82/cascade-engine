import Fastify, { FastifyInstance } from 'fastify';
import corsPlugin from '@fastify/cors';
import staticPlugin from '@fastify/static';
import sensiblePlugin from '@fastify/sensible';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cascadeRoutes, providerCache, modelCache } from './routes/api/cascade';
import { authenticateRequest } from './middleware/auth';
import { validateRequest } from './middleware/validation';
import { db } from './lib/db';
import { eq, and, sql } from 'drizzle-orm';
import { requestLogs, providers, models as modelsTable, cascadeRules, authKeys } from './lib/schema';

// Initialize Fastify server
const fastify: FastifyInstance = Fastify({
  logger: true,
});

// Register plugins
fastify.register(corsPlugin, {
  origin: true, // Allow all origins for development
});
fastify.register(sensiblePlugin);

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

// Login endpoint for UI authentication (no API key required)
fastify.post('/api/login', async (request, reply) => {
  try {
    const { username, password } = request.body as { username: string; password: string };

    // Simple validation - in production, validate against database
    if (!username || !password) {
      return reply.code(400).send({
        error: 'Validation failed',
        message: 'Username and password are required'
      });
    }

    // Validate against hardcoded credentials
    if (username === 'admin' && password === 'myn3wp4ssw0rd') {
      // Return success - the UI will handle session storage
      reply.send({
        success: true,
        message: 'Login successful',
        user: {
          username: 'admin',
          role: 'admin'
        }
      });
    } else {
      return reply.code(401).send({
        error: 'Authentication failed',
        message: 'Invalid username or password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    reply.code(500).send({
      error: 'Login error',
      message: 'Internal server error during login'
    });
  }
});

// Apply authentication to all API routes except health, internal requests, and login
fastify.addHook('preHandler', async (request, reply) => {
  // Skip authentication for health check, internal requests, and login endpoint
  if (request.url === '/health' || request.headers['x-internal'] || request.url === '/api/login') {
    return;
  }
  // Only apply to routes under /api/
  if (request.url?.startsWith('/api/')) {
    await authenticateRequest(request, reply);
  }
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
    const [providersData, modelsData, rulesData, authKeysData] = await Promise.all([
      db.select().from(providers),
      db.select().from(modelsTable),
      db.select().from(cascadeRules),
      db.select().from(authKeys)
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      providers: providersData,
      models: modelsData,
      cascadeRules: rulesData,
      authKeys: authKeysData.map((key: any) => ({ ...key, keyValue: '[REDACTED]' })) // Don't export actual keys
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
    const result = await db.select().from(providers);
    const mapped = result.map(p => ({
      id: p.id,
      name: p.name,
      baseURL: p.baseUrl,
      apiKey: p.apiKey,
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
    const data = request.body as any;

    // Check if provider exists
    const existing = await db.select().from(providers).where(eq(providers.id, data.id)).limit(1);

    if (existing.length > 0) {
      // Update existing (allows partial updates)
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.base_url !== undefined) updateData.baseUrl = data.base_url;
      if (data.api_key !== undefined) updateData.apiKey = data.api_key;
      if (data.status !== undefined) updateData.status = data.status;

      const result = await db.update(providers).set(updateData).where(eq(providers.id, data.id)).returning();

      const mapped = {
        id: result[0].id,
        name: result[0].name,
        baseURL: result[0].baseUrl,
        apiKey: result[0].apiKey,
        status: result[0].status,
        created: result[0].createdAt
      };
      return reply.send(mapped);
    } else {
      // Create new provider
      const newId = data.id || `provider-${Date.now()}`;
      const result = await db.insert(providers).values({
        id: newId,
        name: data.name || '',
        baseUrl: data.base_url || '',
        apiKey: data.api_key || '',
        status: data.status || 'ready',
        createdAt: data.created_at || new Date().toISOString()
      }).returning();

      const mapped = {
        id: result[0].id,
        name: result[0].name,
        baseURL: result[0].baseUrl,
        apiKey: result[0].apiKey,
        status: result[0].status,
        created: result[0].createdAt
      };
      return reply.code(201).send(mapped);
    }
  } catch (error) {
    console.error('Provider save error:', error);
    return reply.code(500).send({ error: 'Failed to save provider' });
  }
});

// Models CRUD routes
fastify.get('/api/models', async (request, reply) => {
  try {
    const result = await db.select().from(modelsTable);
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
    const data = request.body as any;
    const modelData = {
      id: data.id,
      providerId: data.providerId,
      modelId: data.modelId,
      contextWindow: data.contextWindow,
      rpmLimit: data.rpmLimit,
      tpmLimit: data.tpmLimit,
      dailyQuota: data.dailyQuota,
      isFree: data.isFree,
      costPerToken: data.costPerToken,
      status: data.status,
      createdAt: data.createdAt
    };

    // Check if model exists
    const existing = await db.select().from(models).where(eq(models.id, data.id)).limit(1);

    let result;
    if (existing.length > 0) {
      // Update existing
      result = await db.update(modelsTable).set({
        providerId: data.providerId,
        modelId: data.modelId,
        contextWindow: data.contextWindow,
        rpmLimit: data.rpmLimit,
        tpmLimit: data.tpmLimit,
        dailyQuota: data.dailyQuota,
        isFree: data.isFree,
        costPerToken: data.costPerToken,
        status: data.status
      }).where(eq(models.id, data.id)).returning();
    } else {
      // Insert new
      result = await db.insert(modelsTable).values(modelData).returning();
    }

    return reply.send(result[0]);
  } catch (error) {
    console.error('Model save error:', error);
    return reply.code(500).send({ error: 'Failed to save model' });
  }
});

// Cascade rules CRUD routes
fastify.get('/api/cascade-rules', async (request, reply) => {
  try {
    const result = await db.select().from(cascadeRules);
    return reply.send(result);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to fetch cascade rules' });
  }
});

fastify.post('/api/cascade-rules', async (request, reply) => {
  try {
    const data = request.body as any;
    const result = await db.insert(cascadeRules).values(data).returning();
    return reply.send(result[0]);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to create cascade rule' });
  }
});

fastify.delete('/api/cascade-rules', async (request, reply) => {
  try {
    const data = request.body as any;
    if (!data.id) {
      return reply.code(400).send({ error: 'Rule ID is required' });
    }
    await db.delete(cascadeRules).where(eq(cascadeRules.id, data.id));
    return reply.send({ success: true });
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to delete cascade rule' });
  }
});

fastify.put('/api/cascade-rules', async (request, reply) => {
  try {
    const data = request.body as any;
    if (!data.id) {
      return reply.code(400).send({ error: 'Rule ID is required' });
    }
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.triggerType !== undefined) updateData.triggerType = data.triggerType;
    if (data.triggerValue !== undefined) updateData.triggerValue = data.triggerValue;
    if (data.modelOrder !== undefined) updateData.modelOrder = data.modelOrder;
    if (data.wordLimit !== undefined) updateData.wordLimit = data.wordLimit;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    updateData.updatedAt = new Date().toISOString();

    const result = await db.update(cascadeRules).set(updateData).where(eq(cascadeRules.id, data.id)).returning();
    return reply.send(result[0]);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to update cascade rule' });
  }
});

// Auth keys CRUD routes
fastify.get('/api/auth-keys', async (request, reply) => {
  try {
    const result = await db.select().from(authKeys);
    return reply.send(result);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to fetch auth keys' });
  }
});

fastify.post('/api/auth-keys', async (request, reply) => {
  try {
    const data = request.body as any;
    const result = await db.insert(authKeys).values(data).returning();
    return reply.send(result[0]);
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to create auth key' });
  }
});

// Model discovery routes
fastify.get('/api/models/discover/:providerId', async (request, reply) => {
  try {
    const { providerId } = request.params as { providerId: string };

    // Get provider from database
    const provider = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1);
    if (!provider.length) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const p = provider[0];
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
          const data = await response.json();
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
fastify.post('/api/models/bulk', async (request, reply) => {
  try {
    const { models } = request.body as { models: any[] };

    if (!Array.isArray(models)) {
      return reply.code(400).send({ error: 'Models must be an array' });
    }

    const results = [];
    const errors = [];

    for (const modelData of models) {
      try {
        // Validate required fields
        if (!modelData.providerId || !modelData.modelId) {
          errors.push({ model: modelData, error: 'Missing providerId or modelId' });
          continue;
        }

        // Check if model already exists
        const existing = await db.select().from(modelsTable)
          .where(eq(modelsTable.providerId, modelData.providerId))
          .where(eq(modelsTable.modelId, modelData.modelId))
          .limit(1);

        if (existing.length > 0) {
          errors.push({ model: modelData, error: 'Model already exists' });
          continue;
        }

        // Insert the model
        const result = await db.insert(modelsTable).values({
          id: modelData.id || `${modelData.providerId}-${modelData.modelId.replace(/[^a-zA-Z0-9-_]/g, '-')}`,
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
    const data = request.body as any;
    const { providerId, modelId, messages } = data;

    // Get provider and model from cache
    const provider = Array.from(providerCache.values()).find(p => p.id === providerId);
    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const model = modelCache.get(modelId);
    if (!model) {
      return reply.code(404).send({ error: 'Model not found' });
    }

    // Import makeApiCall
    const { makeApiCall } = await import('./routes/api/cascade');
    const startTime = Date.now();
    const response = await makeApiCall(provider, messages, modelId);
    const responseTime = Date.now() - startTime;

    // Log the test request
    try {
      await db.insert(requestLogs).values({
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
    // Log the failed test request
    try {
      const data = request.body as any;
      await db.insert(requestLogs).values({
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
    // Get provider stats
    const providerStats = await db.select({
      providerId: requestLogs.providerId,
      totalRequests: requestLogs.providerId,
    }).from(requestLogs)
    .groupBy(requestLogs.providerId);

    // Get all logs for detailed stats
    const allLogs = await db.select().from(requestLogs).orderBy(requestLogs.timestamp);

    // Calculate stats per provider
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

    // Get provider names
    const providersList = await db.select().from(providers);
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

    // Get hourly data (last 24 hours)
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

    // Get recent logs
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

    return reply.send({
      providerStats: providerStatsResult,
      hourlyData,
      recentLogs,
      totalRequests: allLogs.length,
      totalSuccesses: allLogs.filter(l => l.status === 'success').length,
      totalErrors: allLogs.filter(l => l.status === 'error').length,
      totalCostSaved: allLogs.reduce((sum, l) => sum + (l.costSaved || 0), 0).toFixed(2)
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return reply.code(500).send({ error: 'Failed to fetch analytics' });
  }
});

// Register API routes (cascade routes keep their own validation hook)
fastify.register(async (fastify) => {
  // POST route gets additional validation
  fastify.post('/api/cascade', {
    preHandler: [validateRequest]
  }, cascadeRoutes.POST);

  fastify.get('/api/cascade', cascadeRoutes.GET);
}, { prefix: '' });

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

start();

export default fastify;