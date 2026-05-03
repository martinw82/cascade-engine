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

    if (existing.length === 0) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

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
  } catch (error) {
    console.error('Provider update error:', error);
    return reply.code(500).send({ error: 'Failed to update provider' });
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
    const existing = await db.select().from(modelsTable).where(eq(modelsTable.id, data.id)).limit(1);

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
      }).where(eq(modelsTable.id, data.id)).returning();
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
            rpmLimit: 50, // Default, can be adjusted
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
            contextWindow: 128000, // Groq models typically have large context
            rpmLimit: 30, // Conservative default
            tpmLimit: 10000,
            dailyQuota: 1000,
            isFree: true, // Groq has free tier
            costPerToken: 0,
            status: 'ready'
          }));
        }
      } else if (p.id === 'nvidia-nim') {
        // NVIDIA NIM - use their model catalog
        const response = await fetch('https://api.nvidia.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${p.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          models = data.models?.map((model: any) => ({
            id: `${p.id}-${model.name}`,
            providerId: p.id,
            modelId: model.name,
            contextWindow: model.context_length || 128000,
            rpmLimit: 40, // NVIDIA NIM limits
            tpmLimit: 10000,
            dailyQuota: 1000,
            isFree: true, // NIM has free tier
            costPerToken: 0,
            status: 'ready'
          })) || [];
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
          .where(and(
            eq(modelsTable.providerId, modelData.providerId),
            eq(modelsTable.modelId, modelData.modelId)
          ))
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
        errors.push({ model: modelData, error: (error as Error).message });
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

    // Call makeApiCall method on cascadeEngine instance
    const { cascadeEngine } = await import('./routes/api/cascade');
    const response = await cascadeEngine.handleRequest({
      providerId,
      modelId,
      messages
    });

    return reply.send(response);
  } catch (error: any) {
    console.error('Test API error:', error);
    return reply.code(500).send({ error: error.message || 'Test failed' });
  }
});

// Register API routes
fastify.register(async (fastify) => {
  // Apply authentication and validation to cascade routes
  fastify.addHook('preHandler', authenticateRequest);

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
    const port = process.env.PORT || 3000;
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