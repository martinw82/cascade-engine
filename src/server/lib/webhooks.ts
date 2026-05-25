import { db } from '../lib/db';
import { webhooks } from '../lib/schema';
import { eq } from 'drizzle-orm';

interface WebhookEvent {
  type: string;
  userId: string;
  data: any;
  timestamp?: string;
}

export async function triggerWebhooks(event: WebhookEvent) {
  try {
    const hooks = await db.select()
      .from(webhooks)
      .where(eq(webhooks.userId, event.userId));

    const matchingHooks = hooks.filter(h => {
      const events = JSON.parse(h.events);
      return h.enabled && events.includes(event.type);
    });

    for (const hook of matchingHooks) {
      fireWebhook(hook, event).catch(err => {
        console.error(`Webhook ${hook.id} failed:`, err.message);
      });
    }
  } catch (error) {
    console.error('Webhook trigger error:', error);
  }
}

async function fireWebhook(hook: any, event: WebhookEvent) {
  const payload = JSON.stringify({
    event: event.type,
    timestamp: event.timestamp || new Date().toISOString(),
    data: event.data,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), hook.timeout || 5000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event.type,
    };

    if (hook.secret) {
      headers['X-Webhook-Signature'] = hook.secret;
    }

    const response = await fetch(hook.url, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`Webhook ${hook.id} returned ${response.status}`);
    }

    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Webhook timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}