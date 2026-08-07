import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getSystemTaxRules, updateSystemTaxRules } from '@/lib/services/system-tax-rules-service';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const rules = await getSystemTaxRules(2026);
    return NextResponse.json(rules);
  } catch (err) {
    logger.error('GET /api/retirement/rules error', { error: err });
    return NextResponse.json({ error: 'Failed to fetch retirement rules' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const taxYear = Number(body.taxYear) || 2026;

    if (body.reset) {
      const resetRules = await updateSystemTaxRules(taxYear, {
        ...DEFAULT_2026_RULES,
      });
      return NextResponse.json(resetRules);
    }

    const updates: Record<string, any> = {};
    const allowedFields = [
      'standardDeduction', 'standardDeductionSingle', 'standardDeductionMfj', 'standardDeductionHoH', 'standardDeductionMfs',
      'ordinaryTaxBrackets', 'headOfHouseholdBrackets', 'capitalGainsBrackets',
      'ficaRules', 'socialSecurityRules', 'earlyPenaltyRules', 'niitRules', 'acaRules',
      'niitThreshold', 'irmaaThresholds', 'ssTaxationThresholds', 'contributionLimits',
      'giftEstateExemptions', 'acaSubsidyTable', 'fplAmount', 'secureActRules', 'rmdUniformLifetimeTable',
      'additionalStdDeduction65Plus',
    ];

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    const updatedRules = await updateSystemTaxRules(taxYear, updates);
    return NextResponse.json(updatedRules);
  } catch (err) {
    logger.error('PUT /api/retirement/rules error', { error: err });
    return NextResponse.json({ error: 'Failed to update retirement rules' }, { status: 500 });
  }
}
