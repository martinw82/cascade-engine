import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../server/lib/db';
import { providers, models, cascadeRules, authKeys } from '../../../server/lib/schema';

export async function GET() {
  try {
    const [providersData, modelsData, rulesData, authKeysData] = await Promise.all([
      db.select().from(providers),
      db.select().from(models),
      db.select().from(cascadeRules),
      db.select().from(authKeys)
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      providers: providersData,
      models: modelsData,
      cascadeRules: rulesData,
      authKeys: authKeysData.map(key => ({ ...key, keyValue: '[REDACTED]' })) // Don't export actual keys
    };

    return new NextResponse(JSON.stringify(backup), {
      headers: {
        'Content-Disposition': `attachment; filename="cascade-backup-${new Date().toISOString().split('T')[0]}.json"`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  }
}