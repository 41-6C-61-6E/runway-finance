import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  try {
    const pool = getPool();
    if (pool) {
      await pool.query('SELECT 1');
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: pool ? 'connected' : 'unconfigured',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'error',
        error: error?.message || 'Database connection error',
      },
      { status: 503 }
    );
  }
}
