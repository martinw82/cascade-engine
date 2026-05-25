import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { auditLogs } from '../lib/schema';

// Paths to exclude from audit logging (noise reduction)
const EXCLUDED_PATHS = ['/health', '/favicon.ico'];

// Paths that are sensitive (auth operations) - always logged
const SENSITIVE_PATHS = [
  '/api/auth-keys',
  '/api/validate-key',
  '/api/users',
  '/api/admin',
];

// Map HTTP methods + paths to audit actions
function determineAction(method: string, statusCode: number, path: string): string {
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 401) return 'auth_failure';
  if (statusCode >= 500) return 'error';

  switch (method) {
    case 'POST':
      if (path.includes('/rotate') || path.includes('/revoke')) return 'update';
      return 'create';
    case 'PUT':
      return 'update';
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    case 'GET':
      if (SENSITIVE_PATHS.some(p => path.startsWith(p))) return 'read';
      return 'read';
    default:
      return 'unknown';
  }
}

// Determine resource type from path
function determineResource(path: string): string {
  if (path.includes('/api/providers')) return 'provider';
  if (path.includes('/api/models')) return 'model';
  if (path.includes('/api/cascade-rules')) return 'cascade_rule';
  if (path.includes('/api/auth-keys')) return 'auth_key';
  if (path.includes('/api/users')) return 'user';
  if (path.includes('/api/settings')) return 'settings';
  if (path.includes('/api/cascade')) return 'api_request';
  if (path.includes('/api/chat/completions')) return 'api_request';
  if (path.includes('/api/admin')) return 'admin';
  return 'unknown';
}

// Determine severity based on status code and action
function determineSeverity(statusCode: number, action: string): string {
  if (statusCode >= 500) return 'error';
  if (statusCode === 429) return 'warning';
  if (statusCode === 401 || statusCode === 403) return 'warning';
  if (statusCode >= 400) return 'warning';
  if (action === 'delete') return 'warning';
  if (action === 'auth_failure') return 'warning';
  return 'info';
}

// Insert audit log entry into database
async function insertAuditLog(entry: {
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ipAddress: string;
  userAgent: string;
  status: string;
  severity: string;
}) {
  try {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await db.insert(auditLogs).values({
      id,
      ...entry,
      timestamp: new Date().toISOString(),
    });

    // Auto-cleanup old logs (keep 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(auditLogs)
      .where(/* sql */ `timestamp < '${thirtyDaysAgo}'`)
      .limit(1000);
  } catch (error) {
    console.error('Failed to insert audit log:', error);
  }
}

export async function auditLogPlugin(fastify: FastifyInstance) {
  fastify.addHook('onResponse', async (request: FastifyReply) => {
    const req = request.request as FastifyRequest;
    const url = req.url.split('?')[0];

    // Skip excluded paths
    if (EXCLUDED_PATHS.some(path => url === path)) {
      return;
    }

    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';
    const method = req.method;
    const statusCode = request.statusCode;
    const responseTime = getResponseTime(req);
    const apiKey = (req.headers['x-api-key'] as string);
    const keyPreview = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'none';

    const auth = (req as any).auth;
    const userId = auth?.userId || 'anonymous';
    const username = auth?.username || 'anonymous';

    const action = determineAction(method, statusCode, url);
    const resource = determineResource(url);
    const severity = determineSeverity(statusCode, action);
    const status = statusCode >= 400 ? 'failure' : 'success';

    const details = JSON.stringify({
      method,
      statusCode,
      responseTimeMs: responseTime,
      apiKey: keyPreview,
      ...(auth?.keyId ? { keyId: auth.keyId } : {}),
    });

    // Insert into database
    await insertAuditLog({
      userId,
      username,
      action,
      resource,
      resourceId: auth?.keyId,
      details,
      ipAddress: clientIp,
      userAgent: userAgent.slice(0, 200),
      status,
      severity,
    });

    // Also log to stdout
    const logData = {
      method,
      url,
      statusCode,
      responseTimeMs: responseTime,
      clientIp,
      userAgent: userAgent.slice(0, 200),
      apiKey: keyPreview,
      severity,
    };

    if (statusCode >= 500) {
      fastify.log.error(logData, `AUDIT: ${statusCode} - ${method} ${url}`);
    } else if (statusCode >= 400) {
      fastify.log.warn(logData, `AUDIT: ${statusCode} - ${method} ${url}`);
    } else if (severity === 'warning') {
      fastify.log.info(logData, `AUDIT: ${method} ${url}`);
    } else {
      fastify.log.debug(logData, `AUDIT: ${method} ${url}`);
    }
  });
}

// Manual audit log function for non-request events (login, password change, etc.)
export async function createAuditLog(entry: {
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  status?: string;
  severity?: string;
}) {
  await insertAuditLog({
    userId: entry.userId,
    username: entry.username,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    details: entry.details,
    ipAddress: entry.ipAddress || 'unknown',
    userAgent: entry.userAgent || 'system',
    status: entry.status || 'success',
    severity: entry.severity || 'info',
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
  return (request as any).responseTime || 0;
}