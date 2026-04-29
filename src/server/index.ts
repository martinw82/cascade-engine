import Fastify, { FastifyInstance } from 'fastify';
import staticPlugin from '@fastify/static';
import sensiblePlugin from '@fastify/sensible';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cascadeRoutes } from './routes/api/cascade';
import { authenticateRequest } from './middleware/auth';
import { validateRequest } from './middleware/validation';
import { db } from './lib/db';
import { eq } from 'drizzle-orm';
import { requestLogs, providers, models, cascadeRules, authKeys } from './lib/schema';

// Initialize Fastify server
const fastify: FastifyInstance = Fastify({
  logger: true,
});

// Register plugins
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
    const [providers, models, rules, authKeys] = await Promise.all([
      db.select().from(providers),
      db.select().from(models),
      db.select().from(cascadeRules),
      db.select().from(authKeys)
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      providers,
      models,
      cascadeRules: rules,
      authKeys: authKeys.map(key => ({ ...key, keyValue: '[REDACTED]' })) // Don't export actual keys
    };

    reply.header('Content-Disposition', `attachment; filename="cascade-backup-${new Date().toISOString().split('T')[0]}.json"`);
    reply.send(backup);
  } catch (error) {
    reply.code(500).send({ error: 'Failed to create backup' });
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