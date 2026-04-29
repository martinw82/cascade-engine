import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../server/lib/db';
import { eq } from 'drizzle-orm';
import { authKeys } from '../../../../server/lib/schema';

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: 'Key required' }, { status: 400 });
    }

    // Check if key exists and is enabled
    const authKey = await db
      .select()
      .from(authKeys)
      .where(eq(authKeys.keyValue, key))
      .limit(1);

    if (!authKey.length || !authKey[0].enabled) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 401 });
    }

    // Create response with auth cookie
    const response = NextResponse.json({ success: true });

    // Set cookie (secure in production)
    response.cookies.set('cascade_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}