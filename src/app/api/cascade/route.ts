import { NextRequest, NextResponse } from 'next/server';
import { CascadeEngine } from '../../../../server/routes/api/cascade';

// Initialize cascade engine (this will be shared across requests)
const cascadeEngine = new CascadeEngine();

export async function GET() {
  return NextResponse.json({
    status: 'Cascade Master API is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      POST: '/api/cascade - Handle LLM requests through cascade'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as any;

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'Invalid request: messages array required' }, { status: 400 });
    }

    // Process through cascade engine
    const result = await cascadeEngine.handleRequest(body);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Cascade engine error:', error);

    // Return appropriate error response
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';

    return NextResponse.json({ error: message }, { status: statusCode });
  }
}