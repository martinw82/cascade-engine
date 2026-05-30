import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../lib/db';
import { eq, and } from 'drizzle-orm';
import { providers, models, cascadeRules, requestLogs } from '../../lib/schema';
import { createHash } from 'crypto';
import { decrypt } from '../../lib/encryption';

interface CascadeRequest {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  taskType?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
  [key: string]: any;
}

interface RequestMetadata {
  clientIp?: string;
  userAgent?: string;
  userId?: string;
  parentRequestId?: string;
  cascadeRuleId?: string;
  attemptOrder?: number;
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

interface CacheEntry {
  data: any;
  expiresAt: number;
}

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttl = ttlMs;
  }

  generateKey(model: string | undefined, messages: any[] | undefined, temperature: number | undefined, tools: any[] | undefined): string {
    const data = { model, messages, temperature, tools };
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any): void {
    this.cache.set(key, { data, expiresAt: Date.now() + this.ttl });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      } else {
        count++;
      }
    }
    return count;
  }
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
  private responseCache: ResponseCache = new ResponseCache();

  constructor() {
    this.initializeCaches();
    this.startQueueProcessor();
  }

  getProviderCache(): Map<string, ProviderConfig> {
    return this.providerCache;
  }

  getModelCache(): Map<string, ModelConfig> {
    return this.modelCache;
  }

  getResponseCache(): ResponseCache {
    return this.responseCache;
  }

  private async initializeCaches() {
    try {
      const providerData = await db.select().from(providers);
      this.providerCache.clear();
      for (const p of providerData) {
        let apiKey = p.apiKey;
        if (apiKey && apiKey.includes(':')) {
          try { apiKey = decrypt(apiKey); } catch { /* use as-is if not encrypted */ }
        }
        this.providerCache.set(p.id, {
          id: p.id,
          name: p.name,
          baseURL: p.baseUrl,
          apiKey,
          rpmLimit: 60,
          tpmLimit: 10000,
          dailyQuota: 1000,
          currentRPM: 0,
          currentTPM: 0,
          dailyUsage: 0,
          status: p.status as 'ready' | 'cooldown' | 'errored',
          lastUsed: Date.now()
        });
      }

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
      this.initializeFallbackConfig();
    }
  }

  private initializeFallbackConfig() {
    this.providerCache.set('nvidia-nim', {
      id: 'nvidia-nim',
      name: 'NVIDIA NIM',
      baseURL: 'https://integrate.api.nvidia.com/v1',
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
          const timeoutMs = 30000;
          if (Date.now() - queuedRequest.startTime > timeoutMs) {
            queuedRequest.reject(new Error('Request timeout'));
            return;
          }
          this.processQueuedRequest(queuedRequest);
        }
      }
    }, 100);
  }

   private async processQueuedRequest(queuedRequest: any) {
     try {
       this.activeRequests++;
       const result = await this.tryProviderWithSpillover(queuedRequest.request, new Set(), queuedRequest.metadata);
       queuedRequest.resolve(result);
     } catch (error) {
       queuedRequest.reject(error);
     } finally {
       this.activeRequests--;
     }
   }

  private detectTaskType(request: CascadeRequest): CascadeRule | null {
    for (const rule of this.rulesCache) {
      if (request.taskType && rule.triggerType === 'task_type' && rule.triggerValue === request.taskType) {
        return rule;
      }

      if (rule.triggerType === 'keyword') {
        const firstMessage = request.messages?.[0]?.content || '';
        const wordLimit = rule.wordLimit || 5;
        const firstWords = firstMessage.split(' ').slice(0, wordLimit).join(' ').toLowerCase();
        const keywords = rule.triggerValue.split('|');
        if (keywords.some(keyword => firstWords.includes(keyword.trim()))) {
          return rule;
        }
      }

      if (!request.taskType && rule.triggerType === 'task_type' && rule.triggerValue === 'general') {
        return rule;
      }
    }
    return null;
  }

  private selectModel(rule: CascadeRule): ModelConfig | null {
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

  private parseProviderError(statusCode: number, errorBody: string, providerName: string, modelId: string): string {
    let providerMessage = '';
    let providerCode = '';
    let providerType = '';

    try {
      const parsed = JSON.parse(errorBody);
      providerMessage = parsed.error?.message || parsed.message || parsed.detail || errorBody;
      providerCode = parsed.error?.code || parsed.error?.type || parsed.code || '';
      providerType = parsed.error?.type || '';
    } catch {
      providerMessage = errorBody.substring(0, 200);
    }

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

    let details = '';
    if (providerMessage) {
      const shortMsg = providerMessage.length > 150 ? providerMessage.substring(0, 150) + '...' : providerMessage;
      details += ` | Provider: ${shortMsg}`;
    }
    if (providerCode) {
      details += ` | Code: ${providerCode}`;
    }

    return `${baseMessage}${details}`;
  }

  private buildRequestBody(model: ModelConfig, messages: any[], request: CascadeRequest, stream: boolean = false): any {
    return {
      model: model.modelId,
      messages,
      max_tokens: request.max_tokens || 8192,
      temperature: request.temperature ?? 0.7,
      stream,
      ...(request.tools && { tools: request.tools }),
      ...(request.tool_choice && { tool_choice: request.tool_choice }),
    };
  }

  private buildRequestHeaders(provider: ProviderConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    };
  }

  private buildApiUrl(provider: ProviderConfig): string {
    const base = provider.baseURL.endsWith('/') ? provider.baseURL : provider.baseURL + '/';
    return `${base}chat/completions`;
  }

  private async makeApiCall(model: ModelConfig, messages: any[], request: any): Promise<any> {
    const provider = this.providerCache.get(model.providerId);
    if (!provider) {
      throw new Error(`Provider ${model.providerId} not found`);
    }
    const modelName = model.modelId;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      let response: Response;

      const maxTokens = request.max_tokens || 8192;
      if (maxTokens > model.contextWindow) {
        request.max_tokens = model.contextWindow;
      }

      // Validate max_tokens doesn't exceed model context window
      if (provider.baseURL.includes('generativelanguage.googleapis.com') || provider.id === 'gemini' || provider.id === 'google') {
        const geminiModel = modelName.replace(/^models\//, '');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${provider.apiKey}`;
        const body = {
          contents: messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: m.content ? [{ text: m.content }] : []
          })),
          generationConfig: {
            maxOutputTokens: request.max_tokens || 8192,
            temperature: request.temperature ?? 0.7,
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
          const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', index: 0 }],
            usage: result.usageMetadata || {}
          };
        }
      } else if (provider.baseURL.includes('api.anthropic.com') || provider.id === 'anthropic') {
        const url = 'https://api.anthropic.com/v1/messages';
        const body: any = {
          model: modelName,
          messages: messages.map((m: any) => ({ role: m.role, content: m.content || '' })),
          max_tokens: request.max_tokens || 8192,
          temperature: request.temperature ?? 0.7,
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
          const content = result.content?.[0]?.text || '';
          return {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', index: 0 }],
            usage: result.usage || {}
          };
        }
      } else {
        const url = this.buildApiUrl(provider);
        const body = this.buildRequestBody(model, messages, request, false);

        response = await fetch(url, {
          method: 'POST',
          headers: this.buildRequestHeaders(provider),
          body: JSON.stringify(body),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text();
        const friendlyMessage = this.parseProviderError(response.status, errorData, provider.name, modelName);
        const error: any = new Error(friendlyMessage);
        error.statusCode = response.status;
        error.details = errorData;
        throw error;
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
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

  private async *makeOpenAIStreamingCall(model: ModelConfig, messages: any[], request: CascadeRequest): AsyncGenerator<any> {
    const provider = this.providerCache.get(model.providerId);
    if (!provider) throw new Error(`Provider ${model.providerId} not found`);

    const url = this.buildApiUrl(provider);
    const body = this.buildRequestBody(model, messages, request, true);
    const headers = this.buildRequestHeaders(provider);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Streaming request to ${provider.name} timed out after 60 seconds`);
      }
      throw error;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      const friendlyMessage = this.parseProviderError(response.status, errorData, provider.name, model.modelId);
      const error: any = new Error(friendlyMessage);
      error.statusCode = response.status;
      error.details = errorData;
      throw error;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              yield parsed;
            } catch {
              // skip malformed JSON chunks
            }
          }
        }
      }
    } catch (error: any) {
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  private async *makeGeminiStreamingCall(model: ModelConfig, messages: any[], request: CascadeRequest): AsyncGenerator<any> {
    const provider = this.providerCache.get(model.providerId);
    if (!provider) throw new Error(`Provider ${model.providerId} not found`);

    const modelName = model.modelId.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${provider.apiKey}`;

    const body = {
      contents: messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: m.content ? [{ text: m.content }] : []
      })),
      generationConfig: {
        maxOutputTokens: request.max_tokens || 8192,
        temperature: request.temperature ?? 0.7,
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      const friendlyMessage = this.parseProviderError(response.status, errorData, provider.name, model.modelId);
      const error: any = new Error(friendlyMessage);
      error.statusCode = response.status;
      throw error;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let contentSoFar = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                contentSoFar += text;
                const finishReason = parsed.candidates?.[0]?.finishReason || null;
                yield {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: model.modelId,
                  choices: [{
                    index: 0,
                    delta: { content: text },
                    finish_reason: finishReason ? finishReason.toLowerCase() : null
                  }]
                };
                if (finishReason) {
                  return;
                }
              }
            } catch {
              // skip malformed
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *makeAnthropicStreamingCall(model: ModelConfig, messages: any[], request: CascadeRequest): AsyncGenerator<any> {
    const provider = this.providerCache.get(model.providerId);
    if (!provider) throw new Error(`Provider ${model.providerId} not found`);

    const url = 'https://api.anthropic.com/v1/messages';

    const body: any = {
      model: model.modelId,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content || '' })),
      max_tokens: request.max_tokens || 8192,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      const friendlyMessage = this.parseProviderError(response.status, errorData, provider.name, model.modelId);
      const error: any = new Error(friendlyMessage);
      error.statusCode = response.status;
      throw error;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let contentSoFar = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                contentSoFar += parsed.delta.text;
                yield {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: model.modelId,
                  choices: [{
                    index: 0,
                    delta: { content: parsed.delta.text },
                    finish_reason: null
                  }]
                };
              } else if (parsed.type === 'message_stop') {
                yield {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: model.modelId,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop'
                  }]
                };
                return;
              } else if (parsed.type === 'message_start' && parsed.message?.content?.[0]?.text) {
                contentSoFar += parsed.message.content[0].text;
                yield {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: model.modelId,
                  choices: [{
                    index: 0,
                    delta: { role: 'assistant', content: parsed.message.content[0].text },
                    finish_reason: null
                  }]
                };
              }
            } catch {
              // skip malformed
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private makeStreamingApiCall(model: ModelConfig, request: CascadeRequest): AsyncGenerator<any> {
    const provider = this.providerCache.get(model.providerId);
    if (!provider) throw new Error(`Provider ${model.providerId} not found`);

    if (provider.baseURL.includes('generativelanguage.googleapis.com') || provider.id === 'gemini' || provider.id === 'google') {
      return this.makeGeminiStreamingCall(model, request.messages || [], request);
    } else if (provider.baseURL.includes('api.anthropic.com') || provider.id === 'anthropic') {
      return this.makeAnthropicStreamingCall(model, request.messages || [], request);
    } else {
      return this.makeOpenAIStreamingCall(model, request.messages || [], request);
    }
  }

  private findModelForProvider(providerId: string): any {
    for (const [modelId, model] of this.modelCache.entries()) {
      if (model.providerId === providerId) {
        return model;
      }
    }
    return null;
  }

  private updateProviderUsage(provider: ProviderConfig, tokensUsed: number = 0) {
    provider.currentRPM++;
    provider.currentTPM += tokensUsed;
    provider.dailyUsage++;
    provider.lastUsed = Date.now();
  }

  private resetCounters() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    for (const provider of this.providerCache.values()) {
      if (provider.lastUsed < oneMinuteAgo) {
        provider.currentRPM = 0;
        provider.currentTPM = 0;
      }
    }
  }

  private async tryProviderWithSpillover(
    request: CascadeRequest,
    excludedModels: Set<string> = new Set(),
    metadata?: RequestMetadata
  ): Promise<any> {
    const startTime = Date.now();

     if (request.model) {
       let directModel = this.modelCache.get(request.model);
       if (!directModel || directModel.status !== 'ready') {
         for (const m of this.modelCache.values()) {
           if (m.modelId === request.model && m.status === 'ready') {
             directModel = m;
             break;
           }
         }
       }
       if (directModel && directModel.status === 'ready') {
         const directProvider = this.providerCache.get(directModel.providerId);
         if (directProvider && directProvider.status === 'ready') {
           try {
             const response = await this.makeApiCall(directModel, request.messages, request);
             this.updateProviderUsage(directProvider, response.usage?.total_tokens || 0);
             const responseTime = Date.now() - startTime;
             await this.logRequest(request, directProvider, response, 'success', responseTime, undefined, directModel.id, metadata?.clientIp, metadata?.userAgent, metadata?.userId, metadata?.parentRequestId, 'direct', 1);
             return response;
           } catch (error: any) {
             const responseTime = Date.now() - startTime;
             await this.logRequest(request, directProvider, null, 'error', responseTime, error.message, directModel.id, metadata?.clientIp, metadata?.userAgent, metadata?.userId, metadata?.parentRequestId, 'direct', 1);
             throw error;
           }
         }
       }
     }

     const rule = this.detectTaskType(request);
     if (!rule) {
       throw new Error('No matching cascade rule found');
     }

     // Ensure cascadeRuleId is set in metadata for this cascade chain
     if (!metadata?.cascadeRuleId) {
       metadata = { ...metadata, cascadeRuleId: rule.id };
     }

     let model = this.selectModel(rule);

    while (model && excludedModels.has(model.id)) {
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

     try {
       const response = await this.makeApiCall(model, request.messages, request);

       this.updateProviderUsage(provider, response.usage?.total_tokens || 0);

       const responseTime = Date.now() - startTime;
       const attemptOrder = excludedModels.size + 1;
       await this.logRequest(request, provider, response, 'success', responseTime, undefined, model.id, metadata?.clientIp, metadata?.userAgent, metadata?.userId, metadata?.parentRequestId, metadata?.cascadeRuleId, attemptOrder);

       return response;
     } catch (error: any) {
       if (error.statusCode === 429 || error.statusCode === 503) {
         model.status = 'cooldown';
       } else if (error.statusCode >= 500 || error.name === 'AbortError') {
         model.status = 'errored';
       }

       const responseTime = Date.now() - startTime;
       const attemptOrder = excludedModels.size + 1;
       await this.logRequest(request, provider, null, 'error', responseTime, error.message, model.id, metadata?.clientIp, metadata?.userAgent, metadata?.userId, metadata?.parentRequestId, metadata?.cascadeRuleId, attemptOrder);

       excludedModels.add(model.id);

       if (excludedModels.size >= rule.modelOrder.length) {
         throw error;
       }

       return this.tryProviderWithSpillover(request, excludedModels, metadata);
     }
  }

   private async *wrapStreamingWithLogging(
     innerStream: AsyncGenerator<any>,
     model: ModelConfig,
     provider: ProviderConfig,
     request: CascadeRequest,
     startTime: number,
     metadata?: RequestMetadata,
     attemptOrder?: number
   ): AsyncGenerator<any> {
    let yieldedFirstChunk = false;
    let totalTokens = 0;
    let error: any = null;

    try {
      for await (const chunk of innerStream) {
        if (!yieldedFirstChunk) {
          this.updateProviderUsage(provider, 0);
          yieldedFirstChunk = true;
        }
        if (chunk.usage?.total_tokens) {
          totalTokens = chunk.usage.total_tokens;
        }
        yield chunk;
      }
    } catch (err: any) {
      error = err;
      yield {
        error: error.message,
        statusCode: err.statusCode,
        provider: provider.name,
        model: model.modelId,
      };
     } finally {
       const responseTime = Date.now() - startTime;
       if (error) {
         await this.logRequest(request, provider, null, 'error', responseTime, error.message, model.id, metadata?.clientIp, metadata?.userAgent, metadata?.userId, metadata?.parentRequestId, metadata?.cascadeRuleId, attemptOrder);
       } else {
         const response = { usage: { total_tokens: totalTokens } };
         await this.logRequest(request, provider, response, 'success', responseTime, undefined, model.id, metadata?.clientIp, metadata?.userAgent, metadata?.userId, metadata?.parentRequestId, metadata?.cascadeRuleId, attemptOrder);
       }
     }
  }

   private async *tryProviderStreaming(
     request: CascadeRequest,
     excludedModels: Set<string> = new Set(),
     metadata?: RequestMetadata
   ): AsyncGenerator<any> {
    const startTime = Date.now();

     if (request.model) {
       const directModel = this.modelCache.get(request.model);
       if (directModel && directModel.status === 'ready') {
         const directProvider = this.providerCache.get(directModel.providerId);
         if (directProvider && directProvider.status === 'ready') {
           const innerStream = this.makeStreamingApiCall(directModel, request);
           // Direct model request - not part of cascade
           const directMetadata = { ...metadata, cascadeRuleId: 'direct' };
           yield* this.wrapStreamingWithLogging(innerStream, directModel, directProvider, request, startTime, directMetadata, 1);
           return;
         }
       }
     }

     const rule = this.detectTaskType(request);
     if (!rule) {
       throw new Error('No matching cascade rule found');
     }

     // Ensure cascadeRuleId is set in metadata for this cascade chain
     if (!metadata?.cascadeRuleId) {
       metadata = { ...metadata, cascadeRuleId: rule.id };
     }

     let lastError: any = null;
     const triedModels = new Set<string>(excludedModels);

    while (true) {
      let model = this.selectModel(rule);
      while (model && triedModels.has(model.id)) {
        rule.modelOrder = rule.modelOrder.filter(id => id !== model!.id);
        model = this.selectModel(rule);
      }

      if (!model) {
        throw lastError || new Error('No available models');
      }

       triedModels.add(model.id);
       const provider = this.providerCache.get(model.providerId);
       if (!provider) continue;

       const innerStream = this.makeStreamingApiCall(model, request);
       const attemptOrder = triedModels.size;
       const wrapped = this.wrapStreamingWithLogging(innerStream, model, provider, request, startTime, metadata, attemptOrder);

      let errored = false;
      try {
        for await (const chunk of wrapped) {
          if (chunk && chunk.error) {
            lastError = new Error(chunk.error);
            lastError.statusCode = chunk.statusCode;
            if (chunk.statusCode === 429 || chunk.statusCode === 503) {
              model.status = 'cooldown';
              provider.status = 'cooldown';
            } else if ((chunk.statusCode || 500) >= 500) {
              model.status = 'errored';
            }
            errored = true;
            break;
          }
          yield chunk;
        }
      } catch (err: any) {
        lastError = err;
        errored = true;
      }

      if (!errored) return;
    }
  }

  private async logRequest(
    request: CascadeRequest,
    provider: ProviderConfig | null,
    response: any,
    status: string,
    responseTime: number,
    errorMessage?: string,
    modelId?: string,
    clientIp?: string,
    userAgent?: string,
    userId?: string,
    parentRequestId?: string,
    cascadeRuleId?: string,
    attemptOrder?: number
  ) {
    if (!provider) return;

    try {
      const tokensUsed = response?.usage?.total_tokens || 0;
      const costSaved = tokensUsed * 0.0001;

      await db.insert(requestLogs).values({
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: userId || 'default-user',
        parentRequestId,
        cascadeRuleId,
        attemptOrder,
        providerId: provider.id,
        modelId: modelId || request.model || 'unknown',
        taskType: request.taskType || 'general',
        tokensUsed,
        responseTimeMs: responseTime,
        status,
        errorMessage,
        costSaved,
        clientIp,
        userAgent
      });
    } catch (error) {
      console.error('Failed to log request:', error);
    }
  }

   async handleRequest(request: CascadeRequest, metadata?: RequestMetadata): Promise<any> {
     this.resetCounters();

     if (request.stream) {
       throw new Error('Use handleStreamingRequest for streaming requests');
     }

     // Generate a unique ID to group all attempts from this request
     const parentRequestId = metadata?.parentRequestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
     const enrichedMetadata = { ...metadata, parentRequestId };

     const cacheKey = this.responseCache.generateKey(request.model, request.messages, request.temperature, request.tools);
     const cached = this.responseCache.get(cacheKey);
     if (cached) {
       return cached;
     }

     if (this.activeRequests >= this.globalConcurrency) {
       return new Promise((resolve, reject) => {
         this.requestQueue.push({
           resolve,
           reject,
           request,
           startTime: Date.now(),
           metadata: enrichedMetadata
         });
       });
     }

     this.activeRequests++;

     try {
       const result = await this.tryProviderWithSpillover(request, new Set(), enrichedMetadata);
       this.responseCache.set(cacheKey, result);
       return result;
     } finally {
       this.activeRequests--;
     }
   }

   async handleStreamingRequest(
     request: CascadeRequest,
     metadata?: RequestMetadata
   ): Promise<AsyncGenerator<any>> {
     this.resetCounters();

     // Generate a unique ID to group all attempts from this request
     const parentRequestId = metadata?.parentRequestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
     const enrichedMetadata = { ...metadata, parentRequestId };

     if (this.activeRequests >= this.globalConcurrency) {
       throw new Error('Server busy: too many concurrent streaming requests');
     }

     this.activeRequests++;

     const generator = this.tryProviderStreaming(request, new Set(), enrichedMetadata);

     const self = this;
     async function* wrapped(): AsyncGenerator<any> {
       try {
         yield* generator;
       } finally {
         self.activeRequests--;
       }
     }

     return wrapped();
   }

  async refreshCaches() {
    await this.initializeCaches();
    return {
      providers: this.providerCache.size,
      models: this.modelCache.size,
      rules: this.rulesCache.length,
      cacheEntries: this.responseCache.size()
    };
  }
}

export const cascadeEngine = new CascadeEngine();

export const providerCache = cascadeEngine.getProviderCache();
export const modelCache = cascadeEngine.getModelCache();
export const responseCache = cascadeEngine.getResponseCache();

export async function POST(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as CascadeRequest;

    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.code(400).send({ error: 'Invalid request: messages array required' });
    }

    const userId = (request as any).auth?.userId || 'default-user';
    const metadata = {
      clientIp: getClientIp(request),
      userAgent: (request.headers['user-agent'] as string) || '',
      userId
    };

    // Auto-detect taskType from User-Agent if not explicitly set
    if (!body.taskType) {
      const ua = (request.headers['user-agent'] || '').toLowerCase();
      if (ua.includes('opencode')) body.taskType = 'opencode';
      else if (ua.includes('kilocode') || ua.includes('kilo code')) body.taskType = 'coding';
      else if (ua.includes('claude')) body.taskType = 'chat';
      else if (ua.includes('cursor')) body.taskType = 'coding';
      else if (ua.includes('github') && ua.includes('copilot')) body.taskType = 'coding';
      else if (ua.includes('vscode') || ua.includes('visual studio')) body.taskType = 'coding';
      else if (ua.includes('windsurf')) body.taskType = 'coding';
      else if (ua.includes('continue') || ua.includes('continue.dev')) body.taskType = 'coding';
      else if (ua.includes('aider')) body.taskType = 'coding';
      else if (ua.includes('zed')) body.taskType = 'coding';
      else if (ua.includes('jetbrains') || ua.includes('idea')) body.taskType = 'coding';
      else if (ua.includes('curl') || ua.includes('httpie') || ua.includes('wget')) body.taskType = 'cli';
    }

    if (body.stream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      try {
        const generator = await cascadeEngine.handleStreamingRequest(body, metadata);
        for await (const chunk of generator) {
          if (chunk.error) {
            reply.raw.write(`data: ${JSON.stringify({ error: chunk.error, provider: chunk.provider, model: chunk.model })}\n\n`);
          } else {
            reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        }
        reply.raw.write('data: [DONE]\n\n');
      } catch (error: any) {
        console.error('Streaming error:', error);
        reply.raw.write(`data: ${JSON.stringify({ error: error.message || 'Streaming error' })}\n\n`);
      } finally {
        reply.raw.end();
      }
      return;
    }

    const result = await cascadeEngine.handleRequest(body, metadata);
    return reply.send(result);
  } catch (error: any) {
    console.error('Cascade engine error:', error);

    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';

    if ((error as any).statusCode) {
      return reply.code(statusCode).send({
        error: message,
        details: error.details || ''
      });
    }

    return reply.code(statusCode).send({
      error: message,
      details: error.details || ''
    });
  }
}

export const cascadeSchema = {
  schema: {
    tags: ['cascade'],
    summary: 'Send LLM request through cascade engine',
    description: 'Routes your request through configured cascade rules. Automatically selects the best model based on task type/keywords, with automatic failover to backup models if the primary fails. Supports streaming, tool calling, and response caching.',
    body: {
      type: 'object',
      required: ['messages'],
      properties: {
        messages: {
          type: 'array',
          description: 'OpenAI-compatible messages array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
              content: { type: ['string', 'null'], description: 'Message content (null for tool call messages)' },
              tool_calls: { type: 'array', description: 'Tool calls from assistant messages' },
              tool_call_id: { type: 'string', description: 'ID of tool call being responded to' },
              name: { type: 'string', description: 'Name of tool being called' }
            },
            required: ['role']
          }
        },
        taskType: { type: 'string', description: 'Optional task type for explicit rule matching (e.g., "coding", "summarization")' },
        model: { type: 'string', description: 'Optional specific model to use (bypasses cascade rules)' },
        stream: { type: 'boolean', description: 'Enable streaming (SSE) response', default: false },
        temperature: { type: 'number', description: 'Sampling temperature (0-2)', default: 0.7 },
        max_tokens: { type: 'integer', description: 'Maximum tokens to generate', default: 8192 },
        tools: {
          type: 'array',
          description: 'Tool definitions for function calling',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['function'] },
              function: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  parameters: { type: 'object' }
                },
                required: ['name']
              }
            }
          }
        },
        tool_choice: {
          description: 'Controls which tool is called',
          oneOf: [
            { type: 'string', enum: ['auto', 'none', 'required'] },
            { type: 'object', properties: { type: { type: 'string' }, function: { type: 'object', properties: { name: { type: 'string' } } } } }
          ]
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          object: { type: 'string' },
          created: { type: 'integer' },
          model: { type: 'string' },
          choices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                message: {
                  type: 'object',
                  properties: {
                    role: { type: 'string' },
                    content: { type: 'string' },
                    tool_calls: { type: 'array' }
                  }
                },
                finish_reason: { type: 'string' }
              }
            }
          },
          usage: { type: 'object' }
        }
      }
    }
  }
};

function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'] as string;
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  const realIp = request.headers['x-real-ip'] as string;
  if (realIp) return realIp;
  return (request as any).ip || 'unknown';
}

export async function GET(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    status: 'Cascade Master API is running',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    features: ['streaming', 'tool_calling', 'caching', 'spillover'],
    endpoints: {
      POST: '/api/cascade - Handle LLM requests through cascade (supports streaming & tools)'
    }
  });
}

export const cascadeRoutes = {
  POST,
  GET
};

export async function makeApiCall(provider: any, messages: any[], modelId: string): Promise<any> {
  let model: any = null;
  for (const [id, m] of modelCache.entries()) {
    if (m.modelId === modelId && m.providerId === provider.id) {
      model = m;
      break;
    }
  }

  if (!model) {
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

  const request = {
    max_tokens: 10,
    model: modelId
  };

  return (cascadeEngine as any).makeApiCall(model, messages, request);
}
