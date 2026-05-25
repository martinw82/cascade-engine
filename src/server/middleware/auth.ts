import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../lib/db';
import { eq, and } from 'drizzle-orm';
import { authKeys, users } from '../lib/schema';

export async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
  if (request.url === '/health') {
    return;
  }

  const isLocalhost = request.ip === '127.0.0.1' || request.ip === '::1' || request.ip === '::ffff:127.0.0.1';
  // Only allow x-internal bypass in development environment
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (request.headers['x-internal'] && isLocalhost && isDevelopment) {
    (request as any).auth = {
      keyId: 'internal',
      userId: 'default-user',
      permissions: ['read', 'write', 'admin'],
      clientIp: '127.0.0.1',
      isInternal: true
    };
    return;
  }

  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    return reply.code(401).send({
      error: 'Authentication required',
      message: 'Missing X-API-Key header'
    });
  }

  try {
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

    // Get user info
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, key.userId))
      .limit(1);

    if (user.length === 0 || !user[0].enabled) {
      return reply.code(403).send({
        error: 'Access denied',
        message: 'User account is disabled'
      });
    }

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

    (request as any).auth = {
      keyId: key.id,
      userId: key.userId,
      username: user[0].username,
      role: user[0].role,
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

// Helper to get current user ID from request
export function getUserId(request: FastifyRequest): string {
  return (request as any).auth?.userId || 'default-user';
}

// Helper to check if user has required permission
export function hasPermission(request: FastifyRequest, permission: string): boolean {
  const permissions = (request as any).auth?.permissions || [];
  return permissions.includes(permission) || permissions.includes('admin');
}

function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'] as string;
  const realIp = request.headers['x-real-ip'] as string;
  const cfConnectingIp = request.headers['cf-connecting-ip'] as string;

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return (request as any).ip || '127.0.0.1';
}

function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  for (const allowedIp of allowedIps) {
    if (allowedIp.includes('/')) {
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
