import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

// Paths to exclude from audit logging (noise reduction)
const EXCLUDED_PATHS = ['/health', '/favicon.ico'];

// Paths that are sensitive (auth operations) - always logged
const SENSITIVE_PATHS = [
  '/api/auth-keys',
  '/api/validate-key',
];

export async function auditLogPlugin(fastify: FastifyInstance) {
  fastify.addHook('onResponse', async (request: FastifyReply) => {
    const req = request.request as FastifyRequest;
    const url = req.url.split('?')[0];

    // Skip excluded paths
    if (EXCLUDED_PATHS.some(path => url === path)) {
      return;
    }

    // Get client IP
    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';
    const method = req.method;
    const statusCode = request.statusCode;
    const responseTime = getResponseTime(req);
    const apiKey = (req.headers['x-api-key'] as string);
    const keyPreview = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'none';

    // Determine log level based on status code and sensitivity
    const isSensitive = SENSITIVE_PATHS.some(path => url.startsWith(path));
    const isError = statusCode >= 400;

    const logData = {
      method,
      url,
      statusCode,
      responseTimeMs: responseTime,
      clientIp,
      userAgent: userAgent.slice(0, 200), // Truncate long user agents
      apiKey: keyPreview,
      sensitive: isSensitive,
    };

    if (isError) {
      fastify.log.warn(logData, `HTTP ${statusCode} - ${method} ${url}`);
    } else if (isSensitive) {
      fastify.log.info(logData, `Sensitive operation: ${method} ${url}`);
    } else {
      fastify.log.debug(logData, `${method} ${url}`);
    }
  });
}

function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'] as string;
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers['x-real-ip'] as string;
  if (realIp) {
    return realIp;
  }

  const cfConnectingIp = request.headers['cf-connecting-ip'] as string;
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return (request as any).ip || 'unknown';
}

function getResponseTime(request: FastifyRequest): number {
  // Fastify adds responseTime in milliseconds when logging is enabled
  return (request as any).responseTime || 0;
}
