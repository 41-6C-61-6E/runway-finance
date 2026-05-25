import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const endpoint = body.endpoint?.replace(/\/$/, '');
  const apiKey = body.apiKey || '';

  if (!endpoint) {
    return NextResponse.json({ error: 'No endpoint provided' }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${endpoint}/models`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `API returned status ${res.status}: ${text}` }, { status: res.status });
    }

    const resData = await res.json();
    let models: string[] = [];
    if (resData && typeof resData === 'object') {
      if (Array.isArray(resData.data)) {
        models = resData.data.map((m: any) => m.id || m.name).filter(Boolean);
      } else if (Array.isArray(resData.models)) {
        models = resData.models.map((m: any) => m.name || m.id).filter(Boolean);
      } else if (Array.isArray(resData)) {
        models = resData.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
      }
    }

    // Sort models alphabetically for better UX
    models.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch models';
    logger.error('Failed to fetch AI models', { endpoint, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
