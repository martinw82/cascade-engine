import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../lib/db';
import { eq } from 'drizzle-orm';
import { authKeys } from '../lib/schema';
import { authenticateRequest } from './auth';

// In-memory rate limiting store
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export async function enhancedRateLimit(request: FastifyRequest, reply: FastifyReply) {
  // Skip rate limiting for health checks
  if (request.url === '/health') {
    return;
  }

  // Authenticate the request first
  await authenticateRequest(request, reply);
  if (reply.sent) {
    return;
  }

  const auth = (request as any).auth;
  if (!auth) {
    return;
  }

  try {
    // Get the API key's rate limiting configuration
    const authKey = await db
      .select()
      .from(authKeys)
      .where(eq(authKeys.id, auth.keyId))
      .limit(1);

    if (authKey.length === 0 || !authKey[0].enabled) {
      return reply.code(403).send({
        error: 'Access denied',
        message: 'API key is disabled'
      });
    }

    const keyConfig = authKey[0];
    
    // Skip rate limiting if disabled for this key
    if (!keyConfig.rateLimitEnabled) {
      return;
    }

    const maxRequests = keyConfig.rateLimitMax || 100;
    const windowMs = parseTimeWindow(keyConfig.rateLimitWindow || '1 minute');
    
    // Generate rate limit key
    const rateLimitKey = `${auth.keyId}:${Math.floor(Date.now() / windowMs)}`;
    
    // Get current entry
    let entry = rateLimitStore.get(rateLimitKey);
    
    if (!entry || entry.resetTime < Date.now()) {
      // Create new entry
      entry = {
        count: 1,
        resetTime: Date.now() + windowMs
      };
      rateLimitStore.set(rateLimitKey, entry);
      
      // Set rate limit headers
      reply.header('X-RateLimit-Limit', maxRequests);
      reply.header('X-RateLimit-Remaining', maxRequests - 1);
      reply.header('X-RateLimit-Reset', Math.floor(entry.resetTime / 1000));
      return;
    }
    
    // Check if limit exceeded
    if (entry.count >= maxRequests) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${maxRequests} per ${keyConfig.rateLimitWindow}`,
        retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000)
      });
    }
    
    // Increment counter
    entry.count++;
    rateLimitStore.set(rateLimitKey, entry);
    
    // Set rate limit headers
    reply.header('X-RateLimit-Limit', maxRequests);
    reply.header('X-RateLimit-Remaining', maxRequests - entry.count);
    reply.header('X-RateLimit-Reset', Math.floor(entry.resetTime / 1000));
    
  } catch (error) {
    console.error('Rate limiting error:', error);
    // If rate limiting fails, allow the request to proceed
  }
}

function parseTimeWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(second|minute|hour|day)$/i);
  if (!match) {
    return 60 * 1000; // Default to 1 minute
  }
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case 'second': return value * 1000;
    case 'minute': return value * 60 * 1000;
    case 'hour': return value * 60 * 60 * 1000;
    case 'day': return value * 24 * 60 * 60 * 1000;
    default: return 60 * 1000;
  }
}

// Function to get current rate limit status for a user
export async function getRateLimitStatus(userId: string, keyId: string) {
  const windowMs = 60 * 1000; // 1 minute window for status check
  const rateLimitKey = `${keyId}:${Math.floor(Date.now() / windowMs)}`;
  
  const entry = rateLimitStore.get(rateLimitKey);
  
  if (!entry || entry.resetTime < Date.now()) {
    return {
      used: 0,
      limit: 100,
      remaining: 100,
      reset: Date.now() + windowMs
    };
  }
  
  // Get the key's actual limit
  const authKey = await db
    .select()
    .from(authKeys)
    .where(eq(authKeys.id, keyId))
    .limit(1);
  
  const maxRequests = authKey.length > 0 ? authKey[0].rateLimitMax || 100 : 100;
  
  return {
    used: entry.count,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    reset: entry.resetTime
  };
}