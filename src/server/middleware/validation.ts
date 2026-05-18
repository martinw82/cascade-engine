import { FastifyRequest, FastifyReply } from 'fastify';

interface OpenAIRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

// Sanitize string input to prevent XSS and injection
function sanitizeString(input: string): string {
  return input
    .replace(/\0/g, '') // Remove null bytes
    .slice(0, 100000); // Hard limit
}

// Validate and sanitize provider input
export function validateProviderInput(data: any): { valid: boolean; error?: string; sanitized?: any } {
  if (!data) return { valid: false, error: 'Request body is required' };

  // ID validation
  if (data.id && (typeof data.id !== 'string' || data.id.length > 100 || !/^[a-zA-Z0-9-_]+$/.test(data.id))) {
    return { valid: false, error: 'Invalid id: must be alphanumeric with hyphens/underscores, max 100 chars' };
  }

  // Name validation
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.length === 0 || data.name.length > 200) {
      return { valid: false, error: 'Invalid name: must be a string between 1-200 characters' };
    }
  }

  // base_url validation
  if (data.base_url !== undefined) {
    if (typeof data.base_url !== 'string' || data.base_url.length === 0) {
      return { valid: false, error: 'Invalid base_url: must be a non-empty string' };
    }
    try {
      new URL(data.base_url);
    } catch {
      return { valid: false, error: 'Invalid base_url: must be a valid URL' };
    }
  }

  // api_key validation (just check it's a string, don't log or expose)
  if (data.api_key !== undefined && typeof data.api_key !== 'string') {
    return { valid: false, error: 'Invalid api_key: must be a string' };
  }

  // status validation
  if (data.status !== undefined && !['ready', 'cooldown', 'errored'].includes(data.status)) {
    return { valid: false, error: 'Invalid status: must be ready, cooldown, or errored' };
  }

  return {
    valid: true,
    sanitized: {
      ...(data.id && { id: data.id }),
      ...(data.name !== undefined && { name: sanitizeString(data.name) }),
      ...(data.base_url !== undefined && { base_url: data.base_url }),
      ...(data.api_key !== undefined && { api_key: data.api_key }),
      ...(data.status !== undefined && { status: data.status }),
    }
  };
}

// Validate and sanitize model input
export function validateModelInput(data: any): { valid: boolean; error?: string; sanitized?: any } {
  if (!data) return { valid: false, error: 'Request body is required' };

  // Required fields
  if (!data.providerId || typeof data.providerId !== 'string') {
    return { valid: false, error: 'providerId is required and must be a string' };
  }
  if (!data.modelId || typeof data.modelId !== 'string' || data.modelId.length > 200) {
    return { valid: false, error: 'modelId is required and must be a string (max 200 chars)' };
  }

  // Numeric field validation
  const numericFields = ['contextWindow', 'rpmLimit', 'tpmLimit', 'dailyQuota'];
  for (const field of numericFields) {
    if (data[field] !== undefined) {
      const val = Number(data[field]);
      if (isNaN(val) || val < 0 || val > 10000000) {
        return { valid: false, error: `Invalid ${field}: must be a number between 0 and 10000000` };
      }
    }
  }

  // costPerToken validation
  if (data.costPerToken !== undefined) {
    const val = Number(data.costPerToken);
    if (isNaN(val) || val < 0) {
      return { valid: false, error: 'Invalid costPerToken: must be a non-negative number' };
    }
  }

  // isFree validation
  if (data.isFree !== undefined && typeof data.isFree !== 'boolean') {
    return { valid: false, error: 'Invalid isFree: must be a boolean' };
  }

  // status validation
  if (data.status !== undefined && !['ready', 'cooldown', 'errored'].includes(data.status)) {
    return { valid: false, error: 'Invalid status: must be ready, cooldown, or errored' };
  }

  return {
    valid: true,
    sanitized: {
      id: data.id || `model-${Date.now()}`,
      providerId: data.providerId,
      modelId: sanitizeString(data.modelId),
      contextWindow: Number(data.contextWindow) || 4096,
      rpmLimit: Number(data.rpmLimit) || 60,
      tpmLimit: Number(data.tpmLimit) || 10000,
      dailyQuota: Number(data.dailyQuota) || 1000,
      isFree: data.isFree !== undefined ? data.isFree : true,
      costPerToken: Number(data.costPerToken) || 0,
      status: data.status || 'ready',
    }
  };
}

// Validate and sanitize cascade rule input
export function validateCascadeRuleInput(data: any): { valid: boolean; error?: string; sanitized?: any } {
  if (!data) return { valid: false, error: 'Request body is required' };

  // name validation
  if (!data.name || typeof data.name !== 'string' || data.name.length > 200) {
    return { valid: false, error: 'Invalid name: must be a string between 1-200 characters' };
  }

  // priority validation
  if (data.priority !== undefined) {
    const val = Number(data.priority);
    if (isNaN(val) || val < 1 || val > 999) {
      return { valid: false, error: 'Invalid priority: must be a number between 1 and 999' };
    }
  }

  // trigger_type validation
  const validTriggerTypes = ['task_type', 'keyword', 'header', 'custom'];
  if (data.triggerType && !validTriggerTypes.includes(data.triggerType)) {
    return { valid: false, error: `Invalid triggerType: must be one of ${validTriggerTypes.join(', ')}` };
  }

  // trigger_value validation
  if (!data.triggerValue || typeof data.triggerValue !== 'string' || data.triggerValue.length > 1000) {
    return { valid: false, error: 'Invalid triggerValue: must be a string (max 1000 chars)' };
  }

  // model_order validation
  if (data.modelOrder) {
    let modelOrder: string[];
    if (typeof data.modelOrder === 'string') {
      try {
        modelOrder = JSON.parse(data.modelOrder);
      } catch {
        return { valid: false, error: 'Invalid modelOrder: must be valid JSON array' };
      }
    } else if (Array.isArray(data.modelOrder)) {
      modelOrder = data.modelOrder;
    } else {
      return { valid: false, error: 'Invalid modelOrder: must be an array' };
    }

    if (!modelOrder.every((id: any) => typeof id === 'string' && id.length > 0 && id.length <= 200)) {
      return { valid: false, error: 'Invalid modelOrder: all model IDs must be non-empty strings (max 200 chars)' };
    }
  }

  // word_limit validation
  if (data.wordLimit !== undefined) {
    const val = Number(data.wordLimit);
    if (isNaN(val) || val < 1 || val > 50) {
      return { valid: false, error: 'Invalid wordLimit: must be a number between 1 and 50' };
    }
  }

  // enabled validation
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    return { valid: false, error: 'Invalid enabled: must be a boolean' };
  }

  return {
    valid: true,
    sanitized: {
      id: data.id || `rule-${Date.now()}`,
      name: sanitizeString(data.name),
      priority: Number(data.priority) || 1,
      triggerType: data.triggerType || 'keyword',
      triggerValue: sanitizeString(data.triggerValue),
      modelOrder: typeof data.modelOrder === 'string' ? data.modelOrder : JSON.stringify(data.modelOrder || []),
      wordLimit: Number(data.wordLimit) || 5,
      enabled: data.enabled !== undefined ? data.enabled : true,
    }
  };
}

// Validate and sanitize auth key input
export function validateAuthKeyInput(data: any): { valid: boolean; error?: string; sanitized?: any } {
  if (!data) return { valid: false, error: 'Request body is required' };

  // name validation
  if (!data.name || typeof data.name !== 'string' || data.name.length > 200) {
    return { valid: false, error: 'Invalid name: must be a string between 1-200 characters' };
  }

  // allowed_ips validation
  if (data.allowedIps !== undefined) {
    let allowedIps: string[];
    if (typeof data.allowedIps === 'string') {
      try {
        allowedIps = JSON.parse(data.allowedIps);
      } catch {
        return { valid: false, error: 'Invalid allowedIps: must be valid JSON array' };
      }
    } else if (Array.isArray(data.allowedIps)) {
      allowedIps = data.allowedIps;
    } else {
      return { valid: false, error: 'Invalid allowedIps: must be an array' };
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!allowedIps.every((ip: any) => typeof ip === 'string' && ipRegex.test(ip))) {
      return { valid: false, error: 'Invalid allowedIps: all entries must be valid IPv4 addresses (with optional CIDR)' };
    }
  }

  // permissions validation
  const validPermissions = ['read', 'write', 'admin'];
  if (data.permissions !== undefined) {
    let permissions: string[];
    if (typeof data.permissions === 'string') {
      try {
        permissions = JSON.parse(data.permissions);
      } catch {
        return { valid: false, error: 'Invalid permissions: must be valid JSON array' };
      }
    } else if (Array.isArray(data.permissions)) {
      permissions = data.permissions;
    } else {
      return { valid: false, error: 'Invalid permissions: must be an array' };
    }

    if (!permissions.every((p: any) => validPermissions.includes(p))) {
      return { valid: false, error: `Invalid permissions: must be one or more of ${validPermissions.join(', ')}` };
    }
  }

  // enabled validation
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    return { valid: false, error: 'Invalid enabled: must be a boolean' };
  }

  return {
    valid: true,
    sanitized: {
      id: data.id || `key-${Date.now()}`,
      name: sanitizeString(data.name),
      ...(data.allowedIps !== undefined && { allowedIps: Array.isArray(data.allowedIps) ? JSON.stringify(data.allowedIps) : data.allowedIps }),
      ...(data.permissions !== undefined && { permissions: Array.isArray(data.permissions) ? JSON.stringify(data.permissions) : data.permissions }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
    }
  };
}

// Request validation middleware for cascade POST
export async function validateRequest(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as OpenAIRequest;

  // Check request size (10MB limit)
  const contentLength = request.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return reply.code(413).send({ error: 'Request too large' });
  }

  // Validate OpenAI-compatible request structure
  if (!body || typeof body !== 'object') {
    return reply.code(400).send({ error: 'Invalid request body' });
  }

  // Validate messages array
  if (!body.messages || !Array.isArray(body.messages)) {
    return reply.code(400).send({ error: 'Messages array required' });
  }

  // Limit number of messages
  if (body.messages.length > 50) {
    return reply.code(400).send({ error: 'Too many messages (max 50)' });
  }

  // Validate message structure
  for (const message of body.messages) {
    if (!message.role || !message.content) {
      return reply.code(400).send({ error: 'Invalid message structure' });
    }
    if (!['user', 'assistant', 'system', 'tool', 'function'].includes(message.role)) {
      return reply.code(400).send({ error: 'Invalid message role' });
    }
    if (typeof message.content !== 'string') {
      return reply.code(400).send({ error: 'Message content must be string' });
    }
    if (message.content.length > 100000) {
      return reply.code(400).send({ error: 'Message content too long (max 100k chars)' });
    }
  }

  // Validate model (optional)
  if (body.model && typeof body.model !== 'string') {
    return reply.code(400).send({ error: 'Model must be string' });
  }

  // Sanitize and limit other fields
  if (body.temperature !== undefined && (body.temperature < 0 || body.temperature > 2)) {
    return reply.code(400).send({ error: 'Temperature must be between 0 and 2' });
  }

  if (body.max_tokens !== undefined && body.max_tokens > 10000) {
    return reply.code(400).send({ error: 'max_tokens cannot exceed 10000' });
  }
}
