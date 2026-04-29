import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../../server/lib/db';
import { eq } from 'drizzle-orm';
import { requestLogs } from '../../../../server/lib/schema';

export async function GET() {
  try {
    // Get request counts from database
    const totalRequests = await db.$count(requestLogs);
    const todayRequests = await db.$count(requestLogs, eq(requestLogs.timestamp, new Date().toISOString().split('T')[0]));
    const errorCount = await db.$count(requestLogs, eq(requestLogs.status, 'error'));

    // Calculate success rate
    const successRate = totalRequests > 0 ? ((totalRequests - errorCount) / totalRequests * 100).toFixed(1) : '100.0';

    return NextResponse.json({
      total_requests: totalRequests,
      today_requests: todayRequests,
      success_rate: `${successRate}%`,
      error_count: errorCount,
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}