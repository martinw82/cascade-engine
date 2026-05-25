import { db } from './src/server/lib/db.js';
import { eq } from 'drizzle-orm';
import { 
  providers as providersTable, 
  models as modelsTable, 
  cascadeRules as rulesTable, 
  authKeys as keysTable, 
  users as usersTable,
  settings as settingsTable
} from './src/server/lib/schema.js';

async function resetSeeding() {
  try {
    // Delete the defaults_seeded setting to allow reseeding
    await db.delete(settingsTable).where(eq(settingsTable.key, 'defaults_seeded'));
    console.log('Cleared defaults_seeded setting - data will be reseeded on next server start');
    
    // Also, let's manually insert the default data now
    // First, make sure default-user exists
    const defaultUserCheck = await db.select().from(usersTable).where(eq(usersTable.id, 'default-user')).limit(1);
    if (defaultUserCheck.length === 0) {
      const { hashPassword } = await import('./src/server/lib/db.js');
      const defaultPasswordHash = hashPassword('admin123');
      await db.insert(usersTable).values({
        id: 'default-user',
        username: 'admin',
        email: 'admin@localhost',
        passwordHash: defaultPasswordHash,
        role: 'admin',
        enabled: true
      });
      console.log('Created default user');
    }
    
    // Insert default providers (only if they don't already exist for default-user)
    const existingProviders = await db.select().from(providersTable).where(eq(providersTable.userId, 'default-user'));
    if (existingProviders.length === 0) {
      const providers = [
        { id: 'nvidia-nim', name: 'NVIDIA NIM', base_url: 'https://integrate.api.nvidia.com/v1', api_key: process.env.NVIDIA_API_KEY || '', status: 'ready' },
        { id: 'groq', name: 'Groq', base_url: 'https://api.groq.com/openai/v1', api_key: process.env.GROQ_API_KEY || '', status: 'ready' },
        { id: 'openrouter', name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', api_key: process.env.OPENROUTER_API_KEY || '', status: 'ready' }
      ];
      
      for (const provider of providers) {
        await db.insert(providersTable).values({
          id: provider.id,
          userId: 'default-user',
          name: provider.name,
          baseUrl: provider.base_url,
          apiKey: provider.api_key,
          status: provider.status
        });
      }
      console.log(`Inserted ${providers.length} default providers`);
    } else {
      console.log('Providers already exist for default-user, skipping insertion');
    }
    
    // Insert default models (only if they don't already exist for default-user)
    const existingModels = await db.select().from(modelsTable).where(eq(modelsTable.userId, 'default-user'));
    if (existingModels.length === 0) {
      const models = [
        { id: 'llama-3.1-70b', providerId: 'nvidia-nim', modelId: 'meta/llama-3.1-70b-instruct', contextWindow: 128000, rpmLimit: 40, tpmLimit: 10000, dailyQuota: 1000, isFree: true, costPerToken: 0, status: 'ready' },
        { id: 'llama-3.1-8b-instant', providerId: 'groq', modelId: 'llama-3.1-8b-instant', contextWindow: 128000, rpmLimit: 30, tpmLimit: 10000, dailyQuota: 1000, isFree: true, costPerToken: 0, status: 'ready' },
        { id: 'gemini-1.5-flash', providerId: 'openrouter', modelId: 'google/gemini-2.5-flash', contextWindow: 1000000, rpmLimit: 50, tpmLimit: 10000, dailyQuota: 1000, isFree: true, costPerToken: 0, status: 'ready' }
      ];
      
      for (const model of models) {
        await db.insert(modelsTable).values({
          id: model.id,
          userId: 'default-user',
          providerId: model.providerId,
          modelId: model.modelId,
          contextWindow: model.contextWindow,
          rpmLimit: model.rpmLimit,
          tpmLimit: model.tpmLimit,
          dailyQuota: model.dailyQuota,
          isFree: model.isFree,
          costPerToken: model.costPerToken,
          status: model.status
        });
      }
      console.log(`Inserted ${models.length} default models`);
    } else {
      console.log('Models already exist for default-user, skipping insertion');
    }
    
    // Insert default cascade rules (only if they don't already exist for default-user)
    const existingRules = await db.select().from(rulesTable).where(eq(rulesTable.userId, 'default-user'));
    if (existingRules.length === 0) {
      const cascadeRules = [
        { id: 'coding-rule', name: 'Coding Tasks', priority: 1, triggerType: 'keyword', triggerValue: 'code|program|function|debug|programming', modelOrder: JSON.stringify(['llama-3.1-8b-instant', 'llama-3.1-70b', 'gemini-1.5-flash']), wordLimit: 5, enabled: true },
        { id: 'summarization-rule', name: 'Summarization Tasks', priority: 2, triggerType: 'keyword', triggerValue: 'summarize|extract|analyze|document|summary', modelOrder: JSON.stringify(['gemini-1.5-flash', 'llama-3.1-70b', 'llama-3.1-8b-instant']), wordLimit: 5, enabled: true },
        { id: 'default-rule', name: 'Default Fallback', priority: 99, triggerType: 'task_type', triggerValue: 'general', modelOrder: JSON.stringify(['llama-3.1-70b', 'llama-3.1-8b-instant', 'gemini-1.5-flash']), wordLimit: 5, enabled: true }
      ];
      
      for (const rule of cascadeRules) {
        await db.insert(rulesTable).values({
          id: rule.id,
          userId: 'default-user',
          name: rule.name,
          priority: rule.priority,
          triggerType: rule.triggerType,
          triggerValue: rule.triggerValue,
          modelOrder: rule.modelOrder,
          wordLimit: rule.wordLimit,
          enabled: rule.enabled
        });
      }
      console.log(`Inserted ${cascadeRules.length} default cascade rules`);
    } else {
      console.log('Cascade rules already exist for default-user, skipping insertion');
    }
    
    // Insert default auth keys (if they don't already exist)
    const fallbackKeyExists = await db.select().from(keysTable).where(eq(keysTable.keyValue, 'cascade-master-default-key-2026')).limit(1);
    if (fallbackKeyExists.length === 0) {
      const { crypto } = await import('crypto');
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const defaultApiKey = 'cm-' + Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      await db.insert(keysTable).values({
        id: 'default-key',
        userId: 'default-user',
        name: 'Default Access Key',
        keyValue: defaultApiKey,
        allowedIps: null,
        permissions: JSON.stringify(['read', 'write', 'admin']),
        enabled: true
      });
      
      // Also insert the fallback key for UI
      await db.insert(keysTable).values({
        id: 'fallback-key',
        userId: 'default-user',
        name: 'UI Fallback Key',
        keyValue: 'cascade-master-default-key-2026',
        allowedIps: null,
        permissions: JSON.stringify(['read', 'write', 'admin']),
        enabled: true
      });
      
      console.log('Inserted default auth keys');
    } else {
      console.log('Auth keys already exist, skipping insertion');
    }
    
    // Mark as seeded
    await db.insert(settingsTable).values({
      key: 'defaults_seeded',
      value: 'true'
    });
    console.log('Marked data as seeded');
    
  } catch (error) {
    console.error('Error during reseeding:', error);
  }
}

resetSeeding();