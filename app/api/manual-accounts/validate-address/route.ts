import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readApiConfig, fetchRentcastValue } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  let body: {
    address?: string;
    propertyType?: string;
    bedrooms?: string | number;
    bathrooms?: string | number;
    squareFootage?: string | number;
    valuationMethod?: 'conservative' | 'normal' | 'optimistic';
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
  }

  const address = body.address?.trim();
  if (!address) {
    return NextResponse.json({ error: 'validation_error', message: 'Property address is required' }, { status: 400 });
  }

  try {
    const apiConfig = await readApiConfig(dataUserId);
    
    // Parse numeric fields safely
    const bedrooms = body.bedrooms !== undefined && body.bedrooms !== '' ? parseFloat(String(body.bedrooms)) : undefined;
    const bathrooms = body.bathrooms !== undefined && body.bathrooms !== '' ? parseFloat(String(body.bathrooms)) : undefined;
    const squareFootage = body.squareFootage !== undefined && body.squareFootage !== '' ? parseFloat(String(body.squareFootage)) : undefined;

    logger.info('Address validation request', { userId: dataUserId, address });

    const price = await fetchRentcastValue({
      address,
      propertyType: body.propertyType || undefined,
      bedrooms,
      bathrooms,
      squareFootage,
      valuationMethod: body.valuationMethod || undefined,
    }, apiConfig);

    return NextResponse.json({ valid: true, price });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Address validation failed';
    logger.warn('Address validation failed', { userId: dataUserId, address, error: errMsg });
    return NextResponse.json({ valid: false, message: errMsg });
  }
}
