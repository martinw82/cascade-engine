const requiredVars: string[] = [];

const optionalVars = [
  'PORT',
  'NODE_ENV',
  'ALLOWED_ORIGINS',
  'NVIDIA_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW',
  'BODY_SIZE_LIMIT',
  'LOG_LEVEL',
];

export function validateEnv(): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check required variables
  for (const v of requiredVars) {
    if (!process.env[v]) {
      errors.push(`Missing required environment variable: ${v}`);
    }
  }

  // Validate NODE_ENV
  if (process.env.NODE_ENV && !['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
    warnings.push(`Invalid NODE_ENV: "${process.env.NODE_ENV}". Expected: development, production, or test`);
  }

  // Validate PORT
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push(`Invalid PORT: "${process.env.PORT}". Must be 1-65535`);
    }
  }

  // Validate RATE_LIMIT_MAX
  if (process.env.RATE_LIMIT_MAX) {
    const max = parseInt(process.env.RATE_LIMIT_MAX);
    if (isNaN(max) || max < 1) {
      errors.push(`Invalid RATE_LIMIT_MAX: "${process.env.RATE_LIMIT_MAX}". Must be a positive number`);
    }
  }

  // Validate RATE_LIMIT_WINDOW
  if (process.env.RATE_LIMIT_WINDOW) {
    const window = parseInt(process.env.RATE_LIMIT_WINDOW);
    if (isNaN(window) || window < 1) {
      errors.push(`Invalid RATE_LIMIT_WINDOW: "${process.env.RATE_LIMIT_WINDOW}". Must be a positive number (seconds)`);
    }
  }

  // Warn about empty provider keys
  if (!process.env.NVIDIA_API_KEY) warnings.push('NVIDIA_API_KEY not set - NVIDIA provider will not work');
  if (!process.env.GROQ_API_KEY) warnings.push('GROQ_API_KEY not set - Groq provider will not work');
  if (!process.env.OPENROUTER_API_KEY) warnings.push('OPENROUTER_API_KEY not set - OpenRouter provider will not work');

  // Warn if running production without HSTS origins configured
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
    warnings.push('ALLOWED_ORIGINS not set in production - only localhost origins will be allowed');
  }

  return { warnings, errors };
}
