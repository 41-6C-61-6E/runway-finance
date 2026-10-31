import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { buildFinanceContext } from '@/lib/finance/context';
import { getSavingsRate } from '@/lib/finance/savings-rate';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '12', 10);
  const excludedAccounts = new Set((searchParams.get('excludedAccounts') || '').split(',').filter(Boolean));
  const excludedCategories = new Set((searchParams.get('excludedCategories') || '').split(',').filter(Boolean));
  const savingsComponents = new Set(
    (searchParams.get('savingsComponents') || 'retirement,hsa,brokerage,savingsAccount,cash').split(',').filter(Boolean)
  );
  const includePaystubRetirement = searchParams.get('includePaystubRetirement') !== 'false';
  const includePaystubHsa = searchParams.get('includePaystubHsa') !== 'false';
  const adjustIncomeDenominator = searchParams.get('adjustIncomeDenominator') === 'true';

  try {
    const ctx = await buildFinanceContext({ userId, dek });
    const result = await getSavingsRate(ctx, {
      months,
      excludedAccounts,
      excludedCategories,
      savingsComponents,
      includePaystubRetirement,
      includePaystubHsa,
      adjustIncomeDenominator,
    });

    logger.info('GET /api/cash-flow/savings-rate', { months, count: result.length });
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error calculating savings rate', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to calculate savings rate data' },
      { status: 500 }
    );
  }
}
