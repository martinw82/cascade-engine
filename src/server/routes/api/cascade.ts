// API route for handling LLM requests through the cascade
import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../lib/db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { providers, models, cascadeRules, requestLogs } from '../../lib/schema';

interface CascadeRequest {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  taskType?: string;
  [key: string]: any;
}

interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  rpmLimit: number;
  tpmLimit: number;
  dailyQuota: number;
  currentRPM: number;
  currentTPM: number;
  dailyUsage: number;
  status: 'ready' | 'cooldown' | 'errored';
  lastUsed: number;
}

interface ModelConfig {
  id: string;
  providerId: string;
  modelId: string;
  contextWindow: number;
  rpmLimit: number;
  tpmLimit: number;
  dailyQuota: number;
  isFree: boolean;
  costPerToken: number;
  status: 'ready' | 'cooldown' | 'errored';
}

interface CascadeRule {
  id: string;
  priority: number;
  triggerType: 'task_type' | 'keyword' | 'header' | 'custom';
  triggerValue: string;
  modelOrder: string[];
  wordLimit: number;
  enabled: boolean;
}

export class CascadeEngine {
  private globalConcurrency: number = 3;
  private activeRequests: number = 0;
  private requestQueue: Array<{
    resolve: Function;
    reject: Function;
    request: CascadeRequest;
    startTime: number;
  }> = [];
  private providerCache: Map<string, ProviderConfig> = new Map();
  private modelCache: Map<string, ModelConfig> = new Map();
  private rulesCache: CascadeRule[] = [];

  constructor() {
    // Initialize caches and start queue processor
    this.initializeCaches();
    this.startQueueProcessor();
  }

  private async initializeCaches() {
    try {
      // Load providers
      const providerData = await db.select().from(providers);
      this.providerCache.clear();
      for (const p of providerData) {
        this.providerCache.set(p.id, {
          id: p.id,
          name: p.name,
          baseURL: p.baseUrl,
          apiKey: p.apiKey,
          rpmLimit: 60, // Default, could be configurable
          tpmLimit: 10000,
          dailyQuota: 1000,
          currentRPM: 0,
          currentTPM: 0,
          dailyUsage: 0,
          status: p.status as 'ready' | 'cooldown' | 'errored',
          lastUsed: Date.now()
        });
      }

      // Load models
      const modelData = await db.select().from(models);
      this.modelCache.clear();
      for (const m of modelData) {
        this.modelCache.set(m.id, {
          id: m.id,
          providerId: m.providerId,
          modelId: m.modelId,
          contextWindow: m.contextWindow,
          rpmLimit: m.rpmLimit,
          tpmLimit: m.tpmLimit,
          dailyQuota: m.dailyQuota,
          isFree: Boolean(m.isFree),
          costPerToken: m.costPerToken || 0,
          status: m.status as 'ready' | 'cooldown' | 'errored'
        });
      }

      // Load cascade rules
      const rulesData = await db.select().from(cascadeRules).where(eq(cascadeRules.enabled, true));
      this.rulesCache = rulesData.map(r => ({
        id: r.id,
        priority: r.priority,
        triggerType: r.triggerType as CascadeRule['triggerType'],
        triggerValue: r.triggerValue,
        modelOrder: JSON.parse(r.modelOrder),
        wordLimit: r.wordLimit || 5,
        enabled: Boolean(r.enabled)
      })).sort((a, b) => a.priority - b.priority);

    } catch (error) {
      console.error('Failed to initialize caches:', error);
      // Fallback to default configuration
      this.initializeFallbackConfig();
    }
  }

  private initializeFallbackConfig() {
    // Fallback configuration if database fails
    this.providerCache.set('nvidia-nim', {
      id: 'nvidia-nim',
      name: 'NVIDIA NIM',
      baseURL: 'https://api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY || '',
      rpmLimit: 40,
      tpmLimit: 10000,
      dailyQuota: 1000,
      currentRPM: 0,
      currentTPM: 0,
      dailyUsage: 0,
      status: 'ready',
      lastUsed: Date.now()
    });

    this.modelCache.set('llama-3.1-70b', {
      id: 'llama-3.1-70b',
      providerId: 'nvidia-nim',
      modelId: 'llama-3.1-70b',
      contextWindow: 128000,
      rpmLimit: 40,
      tpmLimit: 10000,
      dailyQuota: 1000,
      isFree: true,
      costPerToken: 0,
      status: 'ready'
    });

    this.rulesCache = [
      {
        id: 'default-rule',
        priority: 99,
        triggerType: 'task_type',
        triggerValue: 'general',
        modelOrder: ['llama-3.1-70b'],
        wordLimit: 5,
        enabled: true
      }
    ];
  }

  private startQueueProcessor() {
    setInterval(() => {
      if (this.activeRequests < this.globalConcurrency && this.requestQueue.length > 0) {
        const queuedRequest = this.requestQueue.shift();
        if (queuedRequest) {
          // Check timeout (30 seconds default)
          const timeoutMs = 30000;
          if (Date.now() - queuedRequest.startTime > timeoutMs) {
            queuedRequest.reject(new Error('Request timeout'));
            return;
          }

          // Process the request
          this.processQueuedRequest(queuedRequest);
        }
      }
    }, 100); // Check queue every 100ms
  }

  private async processQueuedRequest(queuedRequest: any) {
    try {
      this.activeRequests++;
      const result = await this.tryProviderWithSpillover(queuedRequest.request);
      queuedRequest.resolve(result);
    } catch (error) {
      queuedRequest.reject(error);
    } finally {
      this.activeRequests--;
    }
  }



  // Detect task type and match against cascade rules (respects priority order)
  private detectTaskType(request: CascadeRequest): CascadeRule | null {
    // Rules are already sorted by priority (lowest number = highest priority)
    // Check each rule in priority order until we find a match

    for (const rule of this.rulesCache) {
      // Check explicit task type match (highest priority)
      if (request.taskType && rule.triggerType === 'task_type' && rule.triggerValue === request.taskType) {
        return rule;
      }

      // Check keyword matches
      if (rule.triggerType === 'keyword') {
        const firstMessage = request.messages?.[0]?.content || '';
        const wordLimit = rule.wordLimit || 5;
        const firstWords = firstMessage.split(' ').slice(0, wordLimit).join(' ').toLowerCase();
        const keywords = rule.triggerValue.split('|');
        if (keywords.some(keyword => firstWords.includes(keyword.trim()))) {
          return rule;
        }
      }

      // Check task type matches (including 'general')
      if (!request.taskType && rule.triggerType === 'task_type' && rule.triggerValue === 'general') {
        return rule;
      }
    }

    // No rule matched
    return null;
  }

  // Select model based on cascade rule and availability
  private selectModel(rule: CascadeRule): ModelConfig | null {
    // Try models in the order specified by the rule
    for (const modelId of rule.modelOrder) {
      const model = this.modelCache.get(modelId);
      if (model && model.status === 'ready') {
        const provider = this.providerCache.get(model.providerId);
        if (provider &&
            provider.status === 'ready' &&
            provider.currentRPM < provider.rpmLimit &&
            provider.currentTPM < provider.tpmLimit &&
            provider.dailyUsage < provider.dailyQuota &&
            model.rpmLimit > 0 &&
            model.tpmLimit > 0 &&
            model.dailyQuota > 0) {
          return model;
        }
      }
    }

    // Fallback: try any available model
    for (const model of this.modelCache.values()) {
      if (model.status === 'ready') {
        const provider = this.providerCache.get(model.providerId);
        if (provider &&
            provider.status === 'ready' &&
            provider.currentRPM < provider.rpmLimit &&
            provider.currentTPM < provider.tpmLimit &&
            provider.dailyUsage < provider.dailyQuota &&
            model.rpmLimit > 0 &&
            model.tpmLimit > 0 &&
            model.dailyQuota > 0) {
          return model;
        }
      }
    }

    return null;
  }

  // Parse error response from provider and return user-friendly message
  private parseProviderError(statusCode: number, errorBody: string, providerName: string, modelId: string): string {
    let providerMessage = '';
    let providerCode = '';
    let providerType = '';

    // Try to parse JSON error response
    try {
      const parsed = JSON.parse(errorBody);
      providerMessage = parsed.error?.message || parsed.message || parsed.detail || errorBody;
      providerCode = parsed.error?.code || parsed.error?.type || parsed.code || '';
      providerType = parsed.error?.type || '';
    } catch {
      providerMessage = errorBody.substring(0, 200);
    }

    // Map HTTP status codes to user-friendly messages
    const statusMessages: Record<number, string> = {
      400: 'Bad request - check your request format',
      401: 'Invalid or missing API key',
      403: 'API key does not have permission for this model or endpoint',
      404: `Model "${modelId}" not found on ${providerName}`,
      422: 'Invalid request parameters - model may not support these settings',
      429: 'Rate limit exceeded - too many requests',
      500: `${providerName} server error - try again later`,
      502: `${providerName} gateway error - service may be down`,
      503: `${providerName} service unavailable - try again later`,
      504: `${providerName} gateway timeout - request took too long`
    };

    const baseMessage = statusMessages[statusCode] || `HTTP ${statusCode} error from ${providerName}`;

    // Add provider-specific details if available
    let details = '';
    if (providerMessage) {
      // Truncate long messages
      const shortMsg = providerMessage.length > 150 ? providerMessage.substring(0, 150) + '...' : providerMessage;
      details = ` | Provider: ${shortMsg}`;
    }
    if (providerCode) {
      details += ` | Code: ${providerCode}`;
    }

    return `${baseMessage}${details}`;
  }

  // Make API call to provider
  private async makeApiCall(model: ModelConfig, messages: any[]): Promise<any> {
    const provider = this.providerCache.get(model.providerId);
    if (!provider) {
      throw new Error(`Provider ${model.providerId} not found`);
    }
    const modelName = model.modelId;

    console.log(`Making API call to ${provider.name}: ${provider.baseURL} with model ${modelName}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      let response: Response;

      // Handle different provider API formats
      if (provider.baseURL.includes('generativelanguage.googleapis.com') || provider.id === 'gemini' || provider.id === 'google') {
        // Google Gemini API format
        const geminiModel = modelName.replace('gemini-', 'gemini-').split('-').slice(0, 3).join('-');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${provider.apiKey}`;
        const body = {
          contents: messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7
          }
        };

        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (response.ok) {
          const result = await response.json();
          // Convert Gemini response to OpenAI-compatible format
          const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return {
            choices: [{ message: { role: 'assistant', content } }],
            usage: result.usageMetadata || {}
          };
        }
      } else if (provider.baseURL.includes('api.anthropic.com') || provider.id === 'anthropic') {
        // Anthropic API format
        const url = 'https://api.anthropic.com/v1/messages';
        const body = {
          model: modelName,
          messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
          max_tokens: 1000,
          temperature: 0.7
        };

        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (response.ok) {
          const result = await response.json();
          // Convert Anthropic response to OpenAI-compatible format
          const content = result.content?.[0]?.text || '';
          return {
            choices: [{ message: { role: 'assistant', content } }],
            usage: result.usage || {}
          };
        }
      } else {
        // Default: OpenAI-compatible API format (works with Groq, Mistral, OpenRouter, NVIDIA, etc.)
        const url = provider.baseURL.endsWith('/') ? `${provider.baseURL}chat/completions` : `${provider.baseURL}/chat/completions`;
        const body = {
          model: modelName,
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7
        };

        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);
      console.log(`API response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.text();
        console.log(`API error details: ${errorData}`);
        const friendlyMessage = this.parseProviderError(response.status, errorData, provider.name, modelName);
        const error: any = new Error(friendlyMessage);
        error.statusCode = response.status;
        error.details = errorData;
        throw error;
      }

      const result = await response.json();
      console.log(`API call successful for ${provider.name}`);
      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.log(`API call to ${provider.name} timed out`);
        throw new Error(`Request to ${provider.name} timed out after 30 seconds`);
      }
      if (error.message && error.message.includes('ERR_TLS_CERT_ALTNAME_INVALID')) {
        throw new Error(`TLS certificate error for ${provider.name} - the provider's SSL certificate doesn't match their domain. Check if the base URL is correct.`);
      }
      if (error.message && error.message.includes('ECONNREFUSED')) {
        throw new Error(`Connection refused to ${provider.name} - check if the base URL is correct and the service is online.`);
      }
      if (error.message && error.message.includes('ENOTFOUND')) {
        throw new Error(`DNS lookup failed for ${provider.name} - the base URL domain could not be resolved. Check the URL.`);
      }
      throw error;
    }
  }

  // Find a suitable model for the provider
  private findModelForProvider(providerId: string): any {
    for (const [modelId, model] of this.modelCache.entries()) {
      if (model.providerId === providerId) {
        return model;
      }
    }
    return null;
  }

  // Update provider usage stats
  private updateProviderUsage(provider: ProviderConfig, tokensUsed: number = 0) {
    provider.currentRPM++;
    provider.currentTPM += tokensUsed;
    provider.dailyUsage++;
    provider.lastUsed = Date.now();
  }

  // Reset counters periodically (in real implementation, use proper timing)
  private resetCounters() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    for (const provider of this.providerCache.values()) {
      // Simplified: reset every minute for demo
      // In reality, we'd track timestamps of each request
      if (provider.lastUsed < oneMinuteAgo) {
        provider.currentRPM = 0;
        provider.currentTPM = 0;
      }

      // Reset daily at midnight (simplified)
      // In reality, we'd check if it's a new day
    }
  }

  // Handle spillover logic when a model fails
  private async tryProviderWithSpillover(
    request: CascadeRequest,
    excludedModels: Set<string> = new Set()
  ): Promise<any> {
    const rule = this.detectTaskType(request);
    if (!rule) {
      throw new Error('No matching cascade rule found');
    }

    let model = this.selectModel(rule);

    // Skip excluded models
    while (model && excludedModels.has(model.id)) {
      // Remove this model from the rule's order and try again
      rule.modelOrder = rule.modelOrder.filter(id => id !== model!.id);
      model = this.selectModel(rule);
    }

    if (!model) {
      throw new Error('No available models');
    }

    const provider = this.providerCache.get(model.providerId);
    if (!provider) {
      throw new Error(`Provider ${model.providerId} not found`);
    }

    const startTime = Date.now();

    try {
      // Make the actual API call
      const response = await this.makeApiCall(model, request.messages);

      // Update provider usage
      this.updateProviderUsage(provider, response.usage?.total_tokens || 0);

      // Log the request
      const responseTime = Date.now() - startTime;
      await this.logRequest(request, provider, response, 'success', responseTime, undefined, model.id);

      return response;
    } catch (error: any) {
      console.log(`API call failed for ${provider.name} (${model.modelId}): ${error.message}, details: ${error.details}`);

      // Mark model as having an issue (only for server errors or timeouts)
      if (error.statusCode === 429 || error.statusCode === 503) {
        model.status = 'cooldown';
        // In reality, we'd set a timer to reset this after a cooldown period
      } else if (error.statusCode >= 500 || error.name === 'AbortError') {
        // Server errors or timeouts disable the model
        model.status = 'errored';
      }
      // 4xx errors (client issues like wrong model/key) don't disable the model

      // Log the failed request
      const responseTime = Date.now() - startTime;
      await this.logRequest(request, provider, null, 'error', responseTime, error.message, model.id);

      // Add to excluded models and try another
      excludedModels.add(model.id);

      // If we've tried all models in the rule, throw the error
      if (excludedModels.size >= rule.modelOrder.length) {
        throw error;
      }

      // Try another model
      return this.tryProviderWithSpillover(request, excludedModels);
    }
  }

  private async logRequest(
    request: CascadeRequest,
    provider: ProviderConfig | null,
    response: any,
    status: string,
    responseTime: number,
    errorMessage?: string,
    modelId?: string
  ) {
    if (!provider) return;

    try {
      const tokensUsed = response?.usage?.total_tokens || 0;
      const costSaved = tokensUsed * 0.0001; // Simplified cost calculation

      await db.insert(requestLogs).values({
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        providerId: provider.id,
        modelId: modelId || request.model || 'unknown',
        taskType: request.taskType || 'general',
        tokensUsed,
        responseTimeMs: responseTime,
        status,
        errorMessage,
        costSaved
      });
    } catch (error) {
      console.error('Failed to log request:', error);
    }
  }

  // Main handler for cascade requests
  async handleRequest(request: CascadeRequest): Promise<any> {
    // Reset counters periodically
    this.resetCounters();

    // Check global concurrency limit
    if (this.activeRequests >= this.globalConcurrency) {
      // Queue the request
      return new Promise((resolve, reject) => {
        this.requestQueue.push({
          resolve,
          reject,
          request,
          startTime: Date.now()
        });
      });
    }

    this.activeRequests++;

    try {
      const result = await this.tryProviderWithSpillover(request);
      return result;
    } finally {
      this.activeRequests--;
    }
  }
}

// Initialize cascade engine
export const cascadeEngine = new CascadeEngine();
export const providerCache = cascadeEngine['providerCache'];
export const modelCache = cascadeEngine['modelCache'];

// API route handler
export async function POST(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as CascadeRequest;
    
    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.code(400).send({ error: 'Invalid request: messages array required' });
    }

    // Process through cascade engine
    const result = await cascadeEngine.handleRequest(body);
    
    return reply.send(result);
  } catch (error: any) {
    console.error('Cascade engine error:', error);
    
    // Return appropriate error response with details
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    
    return reply.code(statusCode).send({
      error: message,
      details: error.details || ''
    });
  }
}

// GET handler for testing/status
export async function GET(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    status: 'Cascade Master API is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      POST: '/api/cascade - Handle LLM requests through cascade'
    }
  });
}

// Export routes object for registration
export const cascadeRoutes = {
  POST,
  GET
};

// Standalone makeApiCall function for testing endpoint
export async function makeApiCall(provider: any, messages: any[], modelId: string): Promise<any> {
  // Find the model in the cache
  let model: any = null;
  for (const [id, m] of modelCache.entries()) {
    if (m.modelId === modelId && m.providerId === provider.id) {
      model = m;
      break;
    }
  }
  
  if (!model) {
    // Create a temporary model object
    model = {
      id: `${provider.id}-${modelId}`,
      providerId: provider.id,
      modelId: modelId,
      contextWindow: 128000,
      rpmLimit: 60,
      tpmLimit: 10000,
      dailyQuota: 1000,
      isFree: false,
      costPerToken: 0,
      status: 'ready' as const
    };
  }
  
  // Use the cascade engine's private makeApiCall method via reflection
  return (cascadeEngine as any).makeApiCall(model, messages);
}