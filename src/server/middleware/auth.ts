import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../lib/db';
import { eq } from 'drizzle-orm';
import { authKeys } from '../lib/schema';

export async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
  // Skip authentication for health check and internal requests
  if (request.url === '/health' || request.headers['x-internal']) {
    return;
  }

  // Get API key from header
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    return reply.code(401).send({
      error: 'Authentication required',
      message: 'Missing X-API-Key header'
    });
  }

  try {
    // Find the auth key in database
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

    // Check if key is enabled
    if (!key.enabled) {
      return reply.code(403).send({
        error: 'Access denied',
        message: 'API key is disabled'
      });
    }

    // Check IP restrictions if configured
    if (key.allowedIps) {
      const allowedIps = JSON.parse(key.allowedIps);
      const clientIp = getClientIp(request);

      if (allowedIps.length > 0 && !isIpAllowed(clientIp, allowedIps)) {
        return reply.code(403).send({
          error: 'Access denied',
          message: 'IP address not allowed'
        });
      }
    }

    // Add authentication info to request
    (request as any).auth = {
      keyId: key.id,
      permissions: JSON.parse(key.permissions || '["read"]'),
      clientIp: getClientIp(request)
    };

  } catch (error) {
    console.error('Authentication error:', error);
    return reply.code(500).send({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    });
  }
}

function getClientIp(request: FastifyRequest): string {
  // Try various headers for client IP
  const forwardedFor = request.headers['x-forwarded-for'] as string;
  const realIp = request.headers['x-real-ip'] as string;
  const cfConnectingIp = request.headers['cf-connecting-ip'] as string;

  // Use the first IP from x-forwarded-for if multiple
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to connection remote address
  return (request as any).ip || '127.0.0.1';
}

function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  for (const allowedIp of allowedIps) {
    if (allowedIp.includes('/')) {
      // CIDR notation - simple check (could be enhanced with proper CIDR library)
      const [network, mask] = allowedIp.split('/');
      const maskNum = parseInt(mask);
      if (clientIp.startsWith(network.split('.').slice(0, Math.ceil(maskNum/8)).join('.'))) {
        return true;
      }
    } else if (allowedIp === clientIp) {
      return true;
    }
  }
  return false;
}