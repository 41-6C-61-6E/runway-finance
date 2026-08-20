import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getSystemTaxRules, updateSystemTaxRules, getYearDefaultRules } from '@/lib/services/system-tax-rules-service';

function validateTaxUpdates(updates: Record<string, any>): string | null {
  // Validate deductions
  for (const dedKey of ['standardDeduction', 'standardDeductionSingle', 'standardDeductionMfj', 'standardDeductionHoH', 'standardDeductionMfs']) {
    if (updates[dedKey] !== undefined) {
      const num = Number(updates[dedKey]);
      if (isNaN(num) || num < 0 || num > 1000000) {
        return `Invalid value for ${dedKey}: must be a positive number`;
      }
    }
  }

  // Validate brackets
  for (const bracketKey of ['ordinaryTaxBrackets', 'headOfHouseholdBrackets', 'capitalGainsBrackets']) {
    if (updates[bracketKey] !== undefined) {
      if (!Array.isArray(updates[bracketKey])) {
        return `${bracketKey} must be an array of bracket objects`;
      }
      for (const b of updates[bracketKey]) {
        if (typeof b !== 'object' || b === null) return `Invalid bracket item in ${bracketKey}`;
        const rate = Number(b.rate);
        const threshold = Number(b.threshold);
        if (isNaN(rate) || rate < 0 || rate > 1) {
          return `Invalid rate in ${bracketKey}: rate must be between 0.0 and 1.0`;
        }
        if (isNaN(threshold) || threshold < 0) {
          return `Invalid threshold in ${bracketKey}: threshold must be >= 0`;
        }
      }
    }
  }

  // Validate ficaRules
  if (updates.ficaRules !== undefined) {
    if (typeof updates.ficaRules !== 'object' || updates.ficaRules === null) {
      return 'ficaRules must be an object';
    }
    if (updates.ficaRules.ssTaxRate !== undefined) {
      const r = Number(updates.ficaRules.ssTaxRate);
      if (isNaN(r) || r < 0 || r > 1) return 'ssTaxRate must be between 0.0 and 1.0';
    }
    if (updates.ficaRules.ssWageBaseCap !== undefined) {
      const cap = Number(updates.ficaRules.ssWageBaseCap);
      if (isNaN(cap) || cap < 0) return 'ssWageBaseCap must be a positive number';
    }
  }

  // Validate niitRules
  if (updates.niitRules !== undefined) {
    if (typeof updates.niitRules !== 'object' || updates.niitRules === null) {
      return 'niitRules must be an object';
    }
    if (updates.niitRules.rate !== undefined) {
      const r = Number(updates.niitRules.rate);
      if (isNaN(r) || r < 0 || r > 1) return 'niit rate must be between 0.0 and 1.0';
    }
  }

  // Validate contributionLimits
  if (updates.contributionLimits !== undefined) {
    if (typeof updates.contributionLimits !== 'object' || updates.contributionLimits === null) {
      return 'contributionLimits must be an object';
    }
    for (const [k, v] of Object.entries(updates.contributionLimits)) {
      const num = Number(v);
      if (isNaN(num) || num < 0) return `Invalid contribution limit for ${k}: must be >= 0`;
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const taxYear = Number(req.nextUrl.searchParams.get('taxYear')) || 2026;
    const rules = await getSystemTaxRules(taxYear);
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
      const defaultBase = getYearDefaultRules(taxYear);
      const resetRules = await updateSystemTaxRules(taxYear, {
        ...defaultBase,
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

    const validationError = validateTaxUpdates(updates);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const updatedRules = await updateSystemTaxRules(taxYear, updates);
    return NextResponse.json(updatedRules);
  } catch (err) {
    logger.error('PUT /api/retirement/rules error', { error: err });
    return NextResponse.json({ error: 'Failed to update retirement rules' }, { status: 500 });
  }
}
