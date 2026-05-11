'use client';

import { useState, useEffect } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { formatCurrency } from '@/lib/utils/format';

interface CategoryData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  isIncome: boolean;
  amount: number;
}

interface SummaryData {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
}

interface SankeyNode {
  id: string;
  nodeColor?: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const theme = {
  background: 'transparent',
  text: { fill: 'var(--color-foreground)', fontSize: 11 },
  axis: {
    domain: { line: { stroke: 'var(--color-border)', strokeWidth: 1 } },
    ticks: { line: { stroke: 'var(--color-border)' }, text: { fill: 'var(--color-muted-foreground)' } },
  },
  grid: { line: { stroke: 'var(--color-border)', strokeDasharray: '3 3' } },
  tooltip: {
    container: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 12px var(--color-border)',
      color: 'var(--color-foreground)',
      fontSize: '12px',
    },
  },
  legends: {
    text: { fill: 'var(--color-muted-foreground)', fontSize: 11 },
  },
};

export function CashFlowSankey() {
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [categoriesRes, summaryRes] = await Promise.all([
          fetch('/api/cash-flow/categories'),
          fetch('/api/cash-flow/summary'),
        ]);
        if (!categoriesRes.ok || !summaryRes.ok) throw new Error('Failed to fetch sankey data');
        const categories: CategoryData[] = await categoriesRes.json();
        const summary: SummaryData = await summaryRes.json();

        const incomeCategories = categories.filter((c) => c.isIncome && c.amount > 0);
        const expenseCategories = categories.filter((c) => !c.isIncome && c.amount > 0);

        const totalIncome = incomeCategories.reduce((s, c) => s + c.amount, 0) || summary.totalIncome;
        const totalExpenses = expenseCategories.reduce((s, c) => s + c.amount, 0) || summary.totalExpenses;
        const savings = Math.max(0, totalIncome - totalExpenses);

        const nodes: SankeyNode[] = [];
        const links: SankeyLink[] = [];

        if (incomeCategories.length > 0) {
          for (const cat of incomeCategories) {
            nodes.push({ id: cat.categoryName, nodeColor: cat.categoryColor });
          }
        } else if (totalIncome > 0) {
          nodes.push({ id: 'Income' });
        }

        if (expenseCategories.length > 0) {
          for (const cat of expenseCategories) {
            nodes.push({ id: cat.categoryName, nodeColor: cat.categoryColor });
          }
        } else if (totalExpenses > 0) {
          nodes.push({ id: 'Expenses' });
        }

        if (savings > 0) {
          nodes.push({ id: 'Savings', nodeColor: 'var(--color-chart-1)' });
        }

        const sources = incomeCategories.length > 0
          ? incomeCategories.map((c) => c.categoryName)
          : totalIncome > 0 ? ['Income'] : [];

        const targets = expenseCategories.length > 0
          ? expenseCategories.map((c) => c.categoryName)
          : totalExpenses > 0 ? ['Expenses'] : [];

        if (incomeCategories.length > 0) {
          for (const source of incomeCategories) {
            const sourceTotal = source.amount;
            const remaining = sourceTotal;

            if (expenseCategories.length > 0) {
              for (const target of expenseCategories) {
                const proportion = target.amount / totalExpenses;
                const linkValue = sourceTotal * proportion;
                if (linkValue > 0) {
                  links.push({ source: source.categoryName, target: target.categoryName, value: linkValue });
                }
              }
            } else if (totalExpenses > 0) {
              links.push({ source: source.categoryName, target: 'Expenses', value: totalExpenses * (sourceTotal / totalIncome) });
            }

            const sourceSavings = savings * (sourceTotal / totalIncome);
            if (sourceSavings > 0) {
              links.push({ source: source.categoryName, target: 'Savings', value: sourceSavings });
            }
          }
        } else if (sources.length > 0) {
          for (const target of targets) {
            links.push({ source: 'Income', target, value: totalExpenses / targets.length });
          }
          if (savings > 0) {
            links.push({ source: 'Income', target: 'Savings', value: savings });
          }
        }

        setSankeyData({ nodes, links });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Cash Flow Sankey</h3>
        </div>
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Sankey</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!sankeyData || sankeyData.nodes.length === 0 || sankeyData.links.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Sankey</h3>
        <p className="text-sm text-muted-foreground">No data available for sankey diagram</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Cash Flow Sankey</h3>
      </div>
      <div className="h-[400px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveSankey
            data={sankeyData}
            margin={{ top: 20, right: 100, bottom: 20, left: 100 }}
            align="justify"
            colors={{ datum: 'data.nodeColor' }}
            nodeOpacity={0.9}
            nodeHoverOthersOpacity={0.3}
            nodeThickness={18}
            nodeSpacing={24}
            nodeBorderWidth={0}
            linkOpacity={0.3}
            linkHoverOpacity={0.6}
            linkContract={3}
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={12}
            theme={theme}
            nodeTooltip={({ node }) => (
              <div>
                <strong>{node.label}</strong><br />
                {formatCurrency(node.value)}
              </div>
            )}
            linkTooltip={({ link }) => (
              <div>
                {link.source.label} → {link.target.label}<br />
                {formatCurrency(link.value)}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}
