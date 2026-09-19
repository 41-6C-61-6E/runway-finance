import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { analyzeSingleTransaction } from '@/lib/services/ai-categorizer';
import { logger } from '@/lib/logger';

/**
 * Analyze one uncategorized transaction on demand. Creates a single
 * `pending` proposal for review — never auto-approves.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { transactionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.transactionId) {
    return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
  }

  try {
    const dek = await getSessionDEK();
    const result = await analyzeSingleTransaction(session.user.id, body.transactionId, dek);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    logger.error('[api/ai/analyze-transaction] Failed', { error: message });
    const status =
      /not found/i.test(message) ? 404 : /already categorized|deleted/i.test(message) ? 409 : 500;
    return NextResponse.json({ ok: false, error: message.slice(0, 500) }, { status });
  }
}
