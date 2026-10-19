import { describe, it, expect } from 'vitest';
import { selectPacks } from '@/lib/advice/router';

describe('Advice Pack Router', () => {
  const fixedNow = new Date('2026-10-15T12:00:00Z');

  it('selects packs based on page context', () => {
    // /plans page context
    const planPacks = selectPacks({
      userMessage: 'Hello',
      page: { path: '/plans', planId: '11111111-1111-1111-1111-111111111111' },
      now: fixedNow,
    });
    expect(planPacks.some((p) => p.id === 'fire_plan')).toBe(true);
    expect(planPacks.find((p) => p.id === 'fire_plan')?.params?.planId).toBe(
      '11111111-1111-1111-1111-111111111111'
    );

    // /spending page context
    const spendingPacks = selectPacks({
      userMessage: 'Hello',
      page: { path: '/spending', month: '2026-09' },
      now: fixedNow,
    });
    expect(spendingPacks.some((p) => p.id === 'category_spending')).toBe(true);
    expect(spendingPacks.some((p) => p.id === 'category_trends')).toBe(true);

    // /budgets
    const budgetPacks = selectPacks({
      userMessage: 'Hello',
      page: { path: '/budgets', month: '2026-09' },
      now: fixedNow,
    });
    expect(budgetPacks.some((p) => p.id === 'budgets')).toBe(true);

    // /goals
    const goalPacks = selectPacks({
      userMessage: 'Hello',
      page: { path: '/goals' },
      now: fixedNow,
    });
    expect(goalPacks.some((p) => p.id === 'goals')).toBe(true);

    // /investments
    const invPacks = selectPacks({
      userMessage: 'Hello',
      page: { path: '/investments' },
      now: fixedNow,
    });
    expect(invPacks.some((p) => p.id === 'investments')).toBe(true);

    // /flows
    const flowPacks = selectPacks({
      userMessage: 'Hello',
      page: { path: '/flows' },
      now: fixedNow,
    });
    expect(flowPacks.some((p) => p.id === 'cash_flow_monthly')).toBe(true);
  });

  it('extracts what-if "retire at (\\d{2})" into fire_scenario overrides', () => {
    const packs = selectPacks({
      userMessage: 'What happens if I retire at 55?',
      now: fixedNow,
    });
    const scenarioPack = packs.find((p) => p.id === 'fire_scenario');
    expect(scenarioPack).toBeDefined();
    expect(scenarioPack?.params?.overrides?.retirementAge).toBe(55);
  });

  it('extracts time phrases like "last 3 months" and "last month"', () => {
    const packs3m = selectPacks({
      userMessage: 'How much did I spend in dining over the last 3 months?',
      now: fixedNow,
    });
    const catPack = packs3m.find((p) => p.id === 'category_spending');
    expect(catPack).toBeDefined();
    expect(catPack?.params?.startMonth).toBe('2026-08');
    expect(catPack?.params?.endMonth).toBe('2026-10');

    const packsLastMo = selectPacks({
      userMessage: 'What was my food spending last month?',
      now: fixedNow,
    });
    const lastMoPack = packsLastMo.find((p) => p.id === 'category_spending');
    expect(lastMoPack).toBeDefined();
    expect(lastMoPack?.params?.startMonth).toBe('2026-09');
    expect(lastMoPack?.params?.endMonth).toBe('2026-09');
  });

  it('identifies keyword matches for subscriptions, net worth, formulas, and comparison', () => {
    const subPacks = selectPacks({
      userMessage: 'What subscriptions or recurring bills am I paying?',
      now: fixedNow,
    });
    expect(subPacks.some((p) => p.id === 'recurring')).toBe(true);

    const nwPacks = selectPacks({
      userMessage: 'Show my historical net worth over time',
      now: fixedNow,
    });
    expect(nwPacks.some((p) => p.id === 'net_worth_history')).toBe(true);

    const formPacks = selectPacks({
      userMessage: 'How is savings rate calculated?',
      now: fixedNow,
    });
    expect(formPacks.some((p) => p.id === 'metric_definitions')).toBe(true);

    const actualPacks = selectPacks({
      userMessage: 'Am I on track with my retirement assumptions?',
      now: fixedNow,
    });
    expect(actualPacks.some((p) => p.id === 'plan_vs_actual')).toBe(true);
  });

  it('respects explicit chips and caps selected packs at 4 total', () => {
    const packs = selectPacks({
      userMessage: 'What if I retire at 55? Also check my spending trends, subscriptions, investments, and net worth.',
      explicitPacks: [{ id: 'budgets', params: { month: '2026-09' } }],
      page: { path: '/spending' },
      now: fixedNow,
    });

    // Explicit pack is prioritized first
    expect(packs[0].id).toBe('budgets');
    expect(packs[0].source).toBe('explicit');

    // Never more than 4 packs
    expect(packs.length).toBeLessThanOrEqual(4);
  });

  it('routes to top_merchants on merchant and payee keywords', () => {
    const packs = selectPacks({
      userMessage: 'Who are my top merchants and payees recently?',
      now: fixedNow,
    });
    const merchantPack = packs.find((p) => p.id === 'top_merchants');
    expect(merchantPack).toBeDefined();
    expect(merchantPack?.source).toBe('keyword');
  });

  it('routes to period_comparison on MoM and YoY comparison keywords', () => {
    const momPacks = selectPacks({
      userMessage: 'Compare my spending this month versus last month',
      now: fixedNow,
    });
    const momPack = momPacks.find((p) => p.id === 'period_comparison');
    expect(momPack).toBeDefined();
    expect(momPack?.params?.type).toBe('month_over_month');

    const yoyPacks = selectPacks({
      userMessage: 'How does my cash flow compare year over year?',
      now: fixedNow,
    });
    const yoyPack = yoyPacks.find((p) => p.id === 'period_comparison');
    expect(yoyPack).toBeDefined();
    expect(yoyPack?.params?.type).toBe('year_over_year');
  });

  it('carries forward multi-turn sessionPacks into open slots with session source', () => {
    const packs = selectPacks({
      userMessage: 'Why did it go up in September?',
      sessionPacks: [
        { id: 'category_spending', params: { startMonth: '2026-09', endMonth: '2026-09' } },
        { id: 'top_merchants', params: { months: 3 } },
      ],
      now: fixedNow,
    });

    // Keyword match will pick category_trends
    expect(packs.some((p) => p.id === 'category_trends')).toBe(true);

    // Multi-turn session packs should be carried forward into remaining slots
    const sessionCatPack = packs.find((p) => p.id === 'category_spending');
    expect(sessionCatPack).toBeDefined();
    expect(sessionCatPack?.source).toBe('session');

    const sessionMerchantPack = packs.find((p) => p.id === 'top_merchants');
    expect(sessionMerchantPack).toBeDefined();
    expect(sessionMerchantPack?.source).toBe('session');
  });
});
