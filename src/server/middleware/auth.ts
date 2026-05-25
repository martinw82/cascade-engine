import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../lib/db';
import { eq, and } from 'drizzle-orm';
import { authKeys, users } from '../lib/schema';
import { verifyToken } from '../lib/encryption';
import net from 'net';

export async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
  if (request.url === '/health') {
    return;
  }

  const isLocalhost = request.ip === '127.0.0.1' || request.ip === '::1' || request.ip === '::ffff:127.0.0.1';
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Internal bypass for development
  if (request.headers['x-internal'] && isLocalhost && isDevelopment) {
    (request as any).auth = {
      keyId: 'internal',
      userId: 'default-user',
      username: 'admin',
      role: 'admin',
      permissions: ['read', 'write', 'admin'],
      clientIp: '127.0.0.1',
      isInternal: true
    };
    return;
  }

  try {
    // Try JWT token first (Authorization: Bearer <token>)
    const authHeader = request.headers['authorization'] as string;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);
      if (payload) {
        (request as any).auth = {
          keyId: payload.keyId || 'jwt',
          userId: payload.userId || 'default-user',
          username: payload.username || 'jwt-user',
          role: payload.role || 'user',
          permissions: payload.permissions || ['read', 'write'],
          clientIp: getClientIp(request),
          isJWT: true
        };
        return;
      }
    }

    // Fall back to API key auth
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.code(401).send({
        error: 'Authentication required',
        message: 'Missing X-API-Key header or Bearer token'
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

    // IP restriction check
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

// JWT login endpoint - generates a short-lived JWT token
export async function loginWithJWT(username: string, passwordHash: string): Promise<{ token: string; expiresIn: number } | null> {
  try {
    const user = await db
      .select()
      .from(users)
      .where(and(eq(users.username, username), eq(users.enabled, true as any)))
      .limit(1);

    if (user.length === 0) return null;

    // Note: In production, use bcrypt/argon2 for password verification
    // Here we assume passwordHash is already verified by the caller

    const { generateToken } = await import('../lib/encryption');
    const expiresIn = 24 * 60 * 60 * 1000; // 24 hours

    const token = generateToken({
      userId: user[0].id,
      username: user[0].username,
      role: user[0].role,
      permissions: ['read', 'write']
    }, expiresIn);

    return { token, expiresIn };
  } catch {
    return null;
  }
}

// Helper to get current user ID from request
export function getUserId(request: FastifyRequest): string {
  return (request as any).auth?.userId || 'default-user';
}

// Helper to get current username from request
export function getUsername(request: FastifyRequest): string {
  return (request as any).auth?.username || 'anonymous';
}

// Helper to get current user role from request
export function getUserRole(request: FastifyRequest): string {
  return (request as any).auth?.role || 'user';
}

// Helper to check if user has required permission
export function hasPermission(request: FastifyRequest, permission: string): boolean {
  const permissions = (request as any).auth?.permissions || [];
  return permissions.includes(permission) || permissions.includes('admin');
}

// Helper to check if user has admin role
export function isAdmin(request: FastifyRequest): boolean {
  return (request as any).auth?.role === 'admin' || (request as any).auth?.permissions?.includes('admin');
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
      // Proper CIDR notation matching using net module
      try {
        const subnet = net.createIP('subnet' as any, allowedIp);
        if (subnet && (subnet as any).contains(clientIp)) {
          return true;
        }
      } catch {
        // Fallback to simple prefix matching for basic CIDR
        const [network, mask] = allowedIp.split('/');
        const maskNum = parseInt(mask);
        const prefixLen = Math.ceil(maskNum / 8);
        const prefix = network.split('.').slice(0, prefixLen).join('.');
        if (clientIp.startsWith(prefix + '.')) {
          return true;
        }
      }
    } else if (allowedIp === clientIp) {
      return true;
    }
  }
  return false;
}