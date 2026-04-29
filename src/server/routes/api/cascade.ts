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
  providerOrder: string[];
  wordLimit: number;
  enabled: boolean;
}

class CascadeEngine {
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
        providerOrder: JSON.parse(r.providerOrder),
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
        providerOrder: ['nvidia-nim'],
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

  // Select provider based on cascade rule and availability
  private selectProvider(rule: CascadeRule): ProviderConfig | null {
    // Try providers in the order specified by the rule
    for (const providerId of rule.providerOrder) {
      const provider = this.providerCache.get(providerId);
      if (provider &&
          provider.status === 'ready' &&
          provider.currentRPM < provider.rpmLimit &&
          provider.currentTPM < provider.tpmLimit &&
          provider.dailyUsage < provider.dailyQuota) {
        return provider;
      }
    }

    // Fallback: try any available provider
    for (const provider of this.providerCache.values()) {
      if (provider.status === 'ready' &&
          provider.currentRPM < provider.rpmLimit &&
          provider.currentTPM < provider.tpmLimit &&
          provider.dailyUsage < provider.dailyQuota) {
        return provider;
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

  // Handle spillover logic when a provider fails
  private async tryProviderWithSpillover(
    request: CascadeRequest,
    excludedProviders: Set<string> = new Set()
  ): Promise<any> {
    const rule = this.detectTaskType(request);
    if (!rule) {
      throw new Error('No matching cascade rule found');
    }

    let provider = this.selectProvider(rule);

    // Skip excluded providers
    while (provider && excludedProviders.has(provider.id)) {
      // Remove this provider from the rule's order and try again
      rule.providerOrder = rule.providerOrder.filter(id => id !== provider!.id);
      provider = this.selectProvider(rule);
    }

    if (!provider) {
      throw new Error('No available providers');
    }

    const startTime = Date.now();

    try {
      // In a real implementation, we'd make the actual API call here
      // For now, we'll simulate success or failure

      // Simulate occasional 429 errors for demonstration
      const shouldFail = Math.random() < 0.3; // 30% chance of failure

      if (shouldFail) {
        // Simulate rate limit error
        const error: any = new Error('Rate limit exceeded');
        error.statusCode = 429;
        throw error;
      }

      // Simulate successful response
      const response = {
        id: `chatcmpl-${Math.random().toString(36).substr(2, 9)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: request.model || 'unknown',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: `This is a simulated response from ${provider.name} for rule: ${rule.id}`
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25
        }
      };

      // Update provider usage
      this.updateProviderUsage(provider, response.usage.total_tokens);

      // Log the request
      const responseTime = Date.now() - startTime;
      await this.logRequest(request, provider, response, 'success', responseTime);

      return response;
    } catch (error: any) {
      // Mark provider as having an issue
      if (error.statusCode === 429 || error.statusCode === 503) {
        provider.status = 'cooldown';
        // In reality, we'd set a timer to reset this after a cooldown period
      } else {
        provider.status = 'errored';
      }

      // Log the failed request
      const responseTime = Date.now() - startTime;
      await this.logRequest(request, provider, null, 'error', responseTime, error.message);

      // Add to excluded providers and try another
      excludedProviders.add(provider.id);

      // If we've tried all providers in the rule, throw the error
      if (excludedProviders.size >= rule.providerOrder.length) {
        throw error;
      }

      // Try another provider
      return this.tryProviderWithSpillover(request, excludedProviders);
    }
  }

  private async logRequest(
    request: CascadeRequest,
    provider: ProviderConfig | null,
    response: any,
    status: string,
    responseTime: number,
    errorMessage?: string
  ) {
    if (!provider) return;

    try {
      const tokensUsed = response?.usage?.total_tokens || 0;
      const costSaved = tokensUsed * 0.0001; // Simplified cost calculation

      await db.insert(requestLogs).values({
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        providerId: provider.id,
        modelId: request.model || 'unknown',
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
const cascadeEngine = new CascadeEngine();

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
    
    // Return appropriate error response
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    
    return reply.code(statusCode).send({ error: message });
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