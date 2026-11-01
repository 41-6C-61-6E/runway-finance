import { describe, it, expect } from 'vitest';
import { buildSankeyData } from '@/components/cash-flow/cash-flow-sankey';

describe('Cash Flow Sankey mass conservation and deficit handling (WS-09-F01)', () => {
  it('balances Sankey diagram when income exceeds expenses with Net Savings sink node', () => {
    const categories: any[] = [
      { categoryId: 'inc1', categoryName: 'Salary', categoryColor: '#10b981', amount: 5000, isIncome: true },
      { categoryId: 'exp1', categoryName: 'Housing', categoryColor: '#ef4444', amount: 2000, isIncome: false },
      { categoryId: 'exp2', categoryName: 'Food', categoryColor: '#f59e0b', amount: 1000, isIncome: false },
    ];

    const result = buildSankeyData(categories, 5000, 3000, false, new Map());
    const savingsNode = result.nodes.find((n) => n.id === '__savings__');
    expect(savingsNode).toBeDefined();
    expect(savingsNode?.label).toBe('Net Savings');
    expect(savingsNode?.value).toBe(2000);

    // Verify incoming links to hub equal outgoing links from hub
    const inLinks = result.links.filter((l) => l.target === '__available_funds__');
    const outLinks = result.links.filter((l) => l.source === '__available_funds__');
    const totalIn = inLinks.reduce((sum, l) => sum + l.value, 0);
    const totalOut = outLinks.reduce((sum, l) => sum + l.value, 0);

    expect(totalIn).toBe(5000);
    expect(totalOut).toBe(5000);
  });

  it('balances Sankey diagram when expenses exceed income with Savings Drawdown source node', () => {
    const categories: any[] = [
      { categoryId: 'inc1', categoryName: 'Side Hustle', categoryColor: '#10b981', amount: 4000, isIncome: true },
      { categoryId: 'exp1', categoryName: 'Tuition & Taxes', categoryColor: '#ef4444', amount: 6000, isIncome: false },
    ];

    const result = buildSankeyData(categories, 4000, 6000, false, new Map());
    const deficitNode = result.nodes.find((n) => n.id === '__deficit__');
    expect(deficitNode).toBeDefined();
    expect(deficitNode?.label).toBe('Savings Drawdown');
    expect(deficitNode?.value).toBe(2000);

    // Hub node should be Available Funds
    const hubNode = result.nodes.find((n) => n.id === '__available_funds__');
    expect(hubNode?.label).toBe('Available Funds');

    // Mass conservation: incoming links to hub must equal outgoing links from hub
    const inLinks = result.links.filter((l) => l.target === '__available_funds__');
    const outLinks = result.links.filter((l) => l.source === '__available_funds__');
    const totalIn = inLinks.reduce((sum, l) => sum + l.value, 0);
    const totalOut = outLinks.reduce((sum, l) => sum + l.value, 0);

    expect(totalIn).toBe(6000);
    expect(totalOut).toBe(6000);
  });
});
