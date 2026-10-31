import { z } from 'zod';
import { getDb } from '@/lib/db';
import { financialGoals } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { computeGoalProjections } from '@/lib/services/goal-projections';
import { formatDollar, formatPercent } from '../redact';
import type { FinanceContext } from '@/lib/finance/context';
import type { AskPack } from './index';

export const GoalsParams = z.object({}).default({});
export type GoalsParams = z.infer<typeof GoalsParams>;

export const goalsPack: AskPack<GoalsParams> = {
  id: 'goals',
  label: 'Savings Goals',
  href: () => '/goals',
  paramsSchema: GoalsParams,
  describe: 'Savings goals progress, targets, funding percentages, and projected completion dates',
  maxTokens: 500,
  async build(ctx: FinanceContext) {
    const db = getDb();
    const rawGoals = await db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.userId, ctx.userId))
      .orderBy(asc(financialGoals.sortOrder), asc(financialGoals.id));

    const decGoals = await decryptRows('financial_goals', rawGoals, ctx.dek);
    const activeGoals = decGoals.filter((g) => g.status === 'active');

    if (activeGoals.length === 0) {
      return { text: 'No active savings goals found.' };
    }

    // Attempt to compute projections
    let projectionMap = new Map<string, { projectedDate: string | null; isFunded: boolean }>();
    try {
      const projResult = await computeGoalProjections(ctx.userId);
      for (const acc of projResult.accounts) {
        for (const g of acc.goals) {
          projectionMap.set(g.goalId, {
            projectedDate: g.projectedFundDate,
            isFunded: g.isFunded,
          });
        }
      }
    } catch {
      // If projection service encounters an issue, fallback to basic goal data
    }

    const lines: string[] = [];
    lines.push(`### Savings Goals (${activeGoals.length} Active Goals)`);
    lines.push('| Goal Name | Current | Target | % Funded | Projected Target Date |');
    lines.push('|---|---|---|---|---|');

    let totalTarget = 0;
    let totalCurrent = 0;

    for (const g of activeGoals) {
      const target = parseFloat(g.targetAmount) || 0;
      const current = parseFloat(g.currentAmount) || 0;
      const pct = target > 0 ? (current / target) * 100 : 0;
      totalTarget += target;
      totalCurrent += current;

      const proj = projectionMap.get(g.id);
      const projDateStr = proj?.isFunded
        ? 'Already Funded'
        : proj?.projectedDate
        ? proj.projectedDate
        : g.targetDate || 'No projected date';

      lines.push(
        `| ${g.name} | ${formatDollar(current)} | ${formatDollar(target)} | ${formatPercent(pct)} | ${projDateStr} |`
      );
    }

    const overallPct = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;
    lines.push(
      `\n- **Total Goals Progress:** ${formatDollar(totalCurrent)} of ${formatDollar(totalTarget)} (${formatPercent(overallPct)} funded)`
    );

    return { text: lines.join('\n') };
  },
};
