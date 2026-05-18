import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

export async function securityHeadersPlugin(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Prevent MIME type sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    reply.header('X-Frame-Options', 'DENY');

    // Referrer policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy - restrict browser features
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Content Security Policy - restrict resource loading
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      reply.header('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '));
    } else {
      // More permissive in development for hot reloading
      reply.header('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '));
    }

    // HSTS (only in production)
    if (process.env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });
}
