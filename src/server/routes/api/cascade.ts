// API route for handling LLM requests through the cascade
import { FastifyRequest, FastifyReply } from 'fastify';

interface CascadeRequest {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  taskType?: string;
  [key: string]: any;
}

interface ProviderConfig {
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

class CascadeEngine {
  private providers: ProviderConfig[] = [];
  private globalConcurrency: number = 3;
  private activeRequests: number = 0;
  private requestQueue: Array<{ resolve: Function; reject: Function; request: any }> = [];

  constructor() {
    // Initialize with some default providers for testing
    this.initializeProviders();
  }

  private initializeProviders() {
    // In a real implementation, these would come from configuration/UI
    this.providers = [
      {
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
      },
      {
        name: 'Groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY || '',
        rpmLimit: 30,
        tpmLimit: 10000,
        dailyQuota: 1000,
        currentRPM: 0,
        currentTPM: 0,
        dailyUsage: 0,
        status: 'ready',
        lastUsed: Date.now()
      },
      {
        name: 'OpenRouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        rpmLimit: 50,
        tpmLimit: 10000,
        dailyQuota: 1000,
        currentRPM: 0,
        currentTPM: 0,
        dailyUsage: 0,
        status: 'ready',
        lastUsed: Date.now()
      }
    ];
  }

  // Detect task type from request
  private detectTaskType(request: CascadeRequest): string {
    // Check for x-task-type header equivalent in request
    if (request.taskType) {
      return request.taskType;
    }

    // Check first 5 words of the first message for keywords
    const firstMessage = request.messages?.[0]?.content || '';
    const firstFiveWords = firstMessage.split(' ').slice(0, 5).join(' ').toLowerCase();
    
    if (firstFiveWords.includes('summarize') || 
        firstFiveWords.includes('extract') ||
        firstFiveWords.includes('analyze') ||
        firstFiveWords.includes('document')) {
      return 'summarization';
    }

    if (firstFiveWords.includes('code') || 
        firstFiveWords.includes('program') ||
        firstFiveWords.includes('function') ||
        firstFiveWords.includes('debug')) {
      return 'coding';
    }

    return 'general';
  }

  // Select provider based on task type and availability
  private selectProvider(taskType: string): ProviderConfig | null {
    // Filter providers that are ready and within limits
    const availableProviders = this.providers.filter(provider => 
      provider.status === 'ready' && 
      provider.currentRPM < provider.rpmLimit &&
      provider.currentTPM < provider.tpmLimit &&
      provider.dailyUsage < provider.dailyQuota
    );

    if (availableProviders.length === 0) {
      return null;
    }

    // Task-based prioritization (simplified)
    if (taskType === 'coding') {
      // Prefer providers known for coding
      const codingProvider = availableProviders.find(p => 
        p.name === 'Groq' || p.name === 'NVIDIA NIM'
      );
      if (codingProvider) return codingProvider;
    }

    if (taskType === 'summarization') {
      // Prefer providers with large context windows
      const summarizationProvider = availableProviders.find(p => 
        p.name === 'OpenRouter' // Assuming OpenRouter has access to Gemini etc.
      );
      if (summarizationProvider) return summarizationProvider;
    }

    // Default: return the provider with lowest current usage
    return availableProviders.reduce((min, provider) => 
      (provider.currentRPM + provider.currentTPM) < 
      (min.currentRPM + min.currentTPM) ? provider : min
    );
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
    
    this.providers.forEach(provider => {
      // Simplified: reset every minute for demo
      // In reality, we'd track timestamps of each request
      if (provider.lastUsed < oneMinuteAgo) {
        provider.currentRPM = 0;
        provider.currentTPM = 0;
      }
      
      // Reset daily at midnight (simplified)
      // In reality, we'd check if it's a new day
    });
  }

  // Handle spillover logic when a provider fails
  private async tryProviderWithSpillover(
    request: CascadeRequest, 
    excludedProviders: Set<string> = new Set()
  ): Promise<any> {
    const taskType = this.detectTaskType(request);
    let provider = this.selectProvider(taskType);

    // Skip excluded providers
    while (provider && excludedProviders.has(provider.name)) {
      provider = this.selectProvider(taskType);
      if (!provider) break;
    }

    if (!provider) {
      throw new Error('No available providers');
    }

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
            content: `This is a simulated response from ${provider.name} for task type: ${taskType}`
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
      
      return response;
    } catch (error: any) {
      // Mark provider as having an issue
      if (error.statusCode === 429 || error.statusCode === 503) {
        provider.status = 'cooldown';
        // In reality, we'd set a timer to reset this after a cooldown period
      } else {
        provider.status = 'errored';
      }
      
      // Add to excluded providers and try another
      excludedProviders.add(provider.name);
      
      // If we've tried all providers, throw the error
      if (excludedProviders.size >= this.providers.length) {
        throw error;
      }
      
      // Try another provider
      return this.tryProviderWithSpillover(request, excludedProviders);
    }
  }

  // Main handler for cascade requests
  async handleRequest(request: CascadeRequest): Promise<any> {
    // Reset counters periodically
    this.resetCounters();

    // Check global concurrency limit
    if (this.activeRequests >= this.globalConcurrency) {
      // In a real implementation, we'd queue the request
      // For now, we'll return an error if at capacity
      throw new Error('Server at maximum capacity');
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