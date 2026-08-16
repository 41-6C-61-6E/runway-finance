import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { CountryCode } from 'plaid';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-plaid-validate]';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const clientId = body.clientId?.trim();
    const secret = body.secret?.trim();
    let env = body.environment || 'sandbox';

    if (env === 'development') {
      env = 'production';
    }

    if (!clientId || !secret) {
      return NextResponse.json(
        { valid: false, error: 'Plaid Client ID and Secret are required' },
        { status: 400 }
      );
    }

    const { Configuration, PlaidApi, PlaidEnvironments } = await import('plaid');
    const environment = PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox;

    const configuration = new Configuration({
      basePath: environment,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
          'Plaid-Version': '2020-09-14',
        },
      },
    });

    const client = new PlaidApi(configuration);

    try {
      // Validate credentials by fetching a single institution
      await client.institutionsGet({
        count: 1,
        offset: 0,
        country_codes: [CountryCode.Us],
      });

      return NextResponse.json({ valid: true });
    } catch (apiError: any) {
      const plaidBody = apiError.response?.data;
      const errorMsg = plaidBody?.error_message || plaidBody?.display_message || apiError.message || 'Invalid Plaid credentials';
      logger.warn(`${LOG_TAG} Plaid credentials validation failed`, { error: errorMsg });

      return NextResponse.json(
        { valid: false, error: errorMsg },
        { status: 400 }
      );
    }
  } catch (error: any) {
    logger.error(`${LOG_TAG} Unexpected error during validation`, { error: error.message });
    return NextResponse.json(
      { valid: false, error: error.message || 'Failed to validate credentials' },
      { status: 500 }
    );
  }
}
