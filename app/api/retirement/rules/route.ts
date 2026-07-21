import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { retirementRules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow } from '@/lib/crypto';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;

    const existing = await getDb()
      .select()
      .from(retirementRules)
      .where(eq(retirementRules.userId, dataUserId))
      .limit(1);

    if (!existing[0]) {
      // Seed default rules for the user
      const encryptedValues = await encryptRow('retirement_rules', {
        userId: dataUserId,
        taxYear: DEFAULT_2026_RULES.taxYear,
        filingStatus: DEFAULT_2026_RULES.filingStatus,
        standardDeduction: DEFAULT_2026_RULES.standardDeduction,
        ordinaryTaxBrackets: DEFAULT_2026_RULES.ordinaryTaxBrackets,
        capitalGainsBrackets: DEFAULT_2026_RULES.capitalGainsBrackets,
        niitThreshold: DEFAULT_2026_RULES.niitThreshold,
        irmaaThresholds: DEFAULT_2026_RULES.irmaaThresholds,
        ssTaxationThresholds: DEFAULT_2026_RULES.ssTaxationThresholds,
        contributionLimits: DEFAULT_2026_RULES.contributionLimits,
        giftEstateExemptions: DEFAULT_2026_RULES.giftEstateExemptions,
        acaSubsidyTable: DEFAULT_2026_RULES.acaSubsidyTable,
        fplAmount: DEFAULT_2026_RULES.fplAmount,
        secureActRules: DEFAULT_2026_RULES.secureActRules,
      }, dek);

      const inserted = await getDb().insert(retirementRules).values(encryptedValues).returning();
      const decrypted = await decryptRow('retirement_rules', inserted[0], dek);
      return NextResponse.json(decrypted);
    }

    const decrypted = await decryptRow('retirement_rules', existing[0], dek);
    return NextResponse.json(decrypted);
  } catch (err) {
    logger.error('GET /api/retirement/rules error', { error: err });
    return NextResponse.json({ error: 'Failed to fetch retirement rules' }, { status: 500 });
  }
}
