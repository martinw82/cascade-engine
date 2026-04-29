import Fastify, { FastifyInstance } from 'fastify';
import staticPlugin from '@fastify/static';
import sensiblePlugin from '@fastify/sensible';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cascadeRoutes } from './routes/api/cascade';

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
  reply.send({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register API routes
fastify.register(async (fastify) => {
  fastify.post('/api/cascade', cascadeRoutes.POST);
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