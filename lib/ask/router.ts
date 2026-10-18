import { getPack, ALL_PACKS } from './packs';
import type { AskPack, PackId } from './packs';

export interface SelectedPackEntry {
  id: PackId;
  pack: AskPack;
  params: any;
  source: 'explicit' | 'page' | 'keyword';
}

export interface PageContext {
  path: string;
  planId?: string;
  month?: string;
}

/**
 * Extracts simple time range parameters from natural language user queries.
 */
function extractTimeParams(text: string, now: Date): { startMonth?: string; endMonth?: string; months?: number } {
  const lower = text.toLowerCase();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthsMatch = lower.match(/last\s+(\d+)\s+months?/i);
  if (monthsMatch) {
    const num = Math.min(24, Math.max(1, parseInt(monthsMatch[1], 10)));
    const d = new Date(now.getFullYear(), now.getMonth() - num + 1, 1);
    const startYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { startMonth: startYm, endMonth: currentYm, months: num };
  }

  if (lower.includes('last month')) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { startMonth: prevYm, endMonth: prevYm, months: 1 };
  }

  if (lower.includes('this year')) {
    const startYm = `${now.getFullYear()}-01`;
    return { startMonth: startYm, endMonth: currentYm };
  }

  const explicitYm = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (explicitYm) {
    return { startMonth: explicitYm[0], endMonth: explicitYm[0] };
  }

  return {};
}

/**
 * Selects up to 4 data packs without requiring an LLM call.
 * Order of priority:
 *   1. Explicit packs (from quick chips)
 *   2. Page context
 *   3. Keyword / Intent match
 */
export function selectPacks(args: {
  userMessage: string;
  page?: PageContext;
  explicitPacks?: Array<{ id: string; params?: unknown }>;
  now?: Date;
}): SelectedPackEntry[] {
  const { userMessage, page, explicitPacks, now = new Date() } = args;
  const selected: SelectedPackEntry[] = [];
  const seenIds = new Set<string>();

  const addPack = (id: string, params: any, source: 'explicit' | 'page' | 'keyword') => {
    if (seenIds.has(id)) return;
    const pack = getPack(id);
    if (!pack) return;

    // Validate params with fallback to default
    const parsed = pack.paramsSchema.safeParse(params);
    const validParams = parsed.success ? parsed.data : pack.paramsSchema.safeParse({}).data ?? {};

    seenIds.add(id);
    selected.push({
      id: pack.id,
      pack,
      params: validParams,
      source,
    });
  };

  // 1. Explicit packs (highest priority)
  if (explicitPacks && explicitPacks.length > 0) {
    for (const exp of explicitPacks.slice(0, 3)) {
      addPack(exp.id, exp.params || {}, 'explicit');
    }
  }

  // 2. Page context
  if (page?.path) {
    const cleanPath = page.path.split('?')[0].toLowerCase();
    switch (cleanPath) {
      case '/plans':
        addPack('fire_plan', { planId: page.planId }, 'page');
        break;
      case '/spending': {
        const timeParams = extractTimeParams(userMessage, now);
        const targetMonth = page.month || timeParams.startMonth;
        addPack('category_spending', { startMonth: targetMonth, endMonth: targetMonth }, 'page');
        addPack('category_trends', {}, 'page');
        break;
      }
      case '/budgets':
        addPack('budgets', { month: page.month }, 'page');
        break;
      case '/goals':
        addPack('goals', {}, 'page');
        break;
      case '/investments':
        addPack('investments', {}, 'page');
        break;
      case '/flows':
        addPack('cash_flow_monthly', { months: 12 }, 'page');
        break;
    }
  }

  // 3. Keyword / Intent matching
  const msgLower = (userMessage || '').toLowerCase();
  const timeParams = extractTimeParams(userMessage, now);

  // Check what-if retirement age
  const retireAtMatch = msgLower.match(/retire\s+(?:at\s+)?(?:age\s+)?(\d{2})/i);
  if (retireAtMatch) {
    const targetAge = parseInt(retireAtMatch[1], 10);
    if (targetAge >= 30 && targetAge <= 80) {
      addPack('fire_scenario', { planId: page?.planId, overrides: { retirementAge: targetAge } }, 'keyword');
    }
  }

  // On track / comparison
  if (/on track|behind|ahead|plan vs actual/i.test(msgLower)) {
    addPack('plan_vs_actual', { planId: page?.planId }, 'keyword');
  }

  // FIRE & Retirement
  if (/\b(retire|retirement|fire|fi number|withdraw|social security|roth)\b/i.test(msgLower)) {
    addPack('fire_plan', { planId: page?.planId }, 'keyword');
  }

  // Trends
  if (/trend|increase|spike|why.*(up|higher|more)|decrease|drop/i.test(msgLower)) {
    addPack('category_trends', {}, 'keyword');
  }

  // Category spending
  if (/spend|spent|category|dining|grocer|food|shopping|entertainment|travel/i.test(msgLower)) {
    addPack(
      'category_spending',
      {
        startMonth: timeParams.startMonth,
        endMonth: timeParams.endMonth,
        groupBy: 'total',
      },
      'keyword'
    );
  }

  // Budgets
  if (/\bbudget|budgets|over\s*budget|remaining\b/i.test(msgLower)) {
    addPack('budgets', { month: timeParams.startMonth }, 'keyword');
  }

  // Goals
  if (/\bgoal|goals|target|milestone\b/i.test(msgLower)) {
    addPack('goals', {}, 'keyword');
  }

  // Investments
  if (/\binvest|investing|portfolio|allocation|stocks|bonds|holdings|ticker\b/i.test(msgLower)) {
    addPack('investments', {}, 'keyword');
  }

  // Recurring & Subscriptions
  if (/\bsubscription|subscriptions|bill|bills|recurring|autopay\b/i.test(msgLower)) {
    addPack('recurring', {}, 'keyword');
  }

  // Net worth history
  if (/\bnet worth|wealth|historical|net worth over time\b/i.test(msgLower)) {
    addPack('net_worth_history', { months: timeParams.months || 24 }, 'keyword');
  }

  // Income / Salary
  if (/\bincome|salary|paycheck|paystub|gross|take\s*home\b/i.test(msgLower)) {
    addPack('income_breakdown', { months: timeParams.months || 12 }, 'keyword');
  }

  // Calculation rules / Formulas
  if (/how is .* calculated|formula|what does .* mean|definition/i.test(msgLower)) {
    addPack('metric_definitions', {}, 'keyword');
  }

  // Cap at 4 packs maximum
  return selected.slice(0, 4);
}
