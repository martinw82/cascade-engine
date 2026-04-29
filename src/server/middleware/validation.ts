import { FastifyRequest, FastifyReply } from 'fastify';

interface OpenAIRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  [key: string]: any;
}

// Request validation middleware
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

  // Validate message structure
  for (const message of body.messages) {
    if (!message.role || !message.content) {
      return reply.code(400).send({ error: 'Invalid message structure' });
    }
    if (!['user', 'assistant', 'system'].includes(message.role)) {
      return reply.code(400).send({ error: 'Invalid message role' });
    }
    if (typeof message.content !== 'string') {
      return reply.code(400).send({ error: 'Message content must be string' });
    }
    if (message.content.length > 100000) { // 100k char limit
      return reply.code(400).send({ error: 'Message content too long' });
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