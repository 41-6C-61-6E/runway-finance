import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { getPlaidClient } from '@/lib/plaid';
import { CountryCode, Products } from 'plaid';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-plaid-create-link-token]';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const dek = await getSessionDEK();

    let client;
    try {
      client = await getPlaidClient(dataUserId, dek);
    } catch (err: any) {
      logger.warn(`${LOG_TAG} Failed to init Plaid client`, { userId, error: err.message });
      return NextResponse.json({
        error: 'not_configured',
        message: err.message || 'Plaid is not configured. Please add your credentials in Settings -> Advanced tab.'
      }, { status: 400 });
    }

    const configs = {
      user: {
        client_user_id: dataUserId,
      },
      client_name: 'This App',
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: [CountryCode.Us, CountryCode.Ca],
      language: 'en',
    };

    const response = await client.linkTokenCreate(configs);
    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error: any) {
    const plaidBody = error.response?.data;
    logger.error(`${LOG_TAG} Error creating link token`, {
      httpStatus: error.response?.status,
      plaidErrorCode: plaidBody?.error_code,
      plaidErrorType: plaidBody?.error_type,
      plaidErrorMessage: plaidBody?.error_message,
      plaidDisplayMessage: plaidBody?.display_message,
      axiosMessage: error.message,
    });
    const userMessage = plaidBody?.error_message || plaidBody?.display_message || error.message || 'Failed to create Plaid Link Token';
    return NextResponse.json({
      error: 'internal_error',
      message: userMessage,
    }, { status: 500 });
  }
}
