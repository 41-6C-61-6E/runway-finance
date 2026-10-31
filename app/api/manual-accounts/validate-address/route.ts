import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readApiConfig, fetchRedfinValuationDetails, extractRedfinPropertyId } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  let body: {
    propertyId?: string;
    /** Legacy alias: address field that may hold a pasted link/bare ID. */
    address?: string;
    valuationMethod?: 'conservative' | 'normal' | 'optimistic';
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
  }

  const propertyId = extractRedfinPropertyId(body.propertyId) ?? extractRedfinPropertyId(body.address);
  if (!propertyId) {
    return NextResponse.json({ error: 'validation_error', message: 'A Redfin Property ID is required (the number after /home/ in the property\'s Redfin URL, e.g. 446533).' }, { status: 400 });
  }

  try {
    const apiConfig = await readApiConfig(userId);

    logger.info('Redfin property validation request', { userId, propertyId });

    const estimates = await fetchRedfinValuationDetails({ propertyId }, apiConfig);

    const method = body.valuationMethod || 'normal';
    const price = estimates[method];

    return NextResponse.json({ valid: true, price, estimates, propertyId: estimates.propertyId });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Address validation failed';
    logger.warn('Redfin property validation failed', { userId, propertyId, error: errMsg });
    return NextResponse.json({ valid: false, message: errMsg });
  }
}
