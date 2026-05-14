'use client';

import { useState, useEffect } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';

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

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const sankeyTheme = {
  background: 'transparent',
  text: { fill: 'var(--color-foreground)', fontSize: 10 },
  axis: {
    domain: { line: { stroke: 'var(--color-border)', strokeWidth: 1 } },
    ticks: { line: { stroke: 'var(--color-border)' }, text: { fill: 'var(--color-muted-foreground)', fontSize: 10 } },
  },
  grid: { line: { stroke: 'var(--color-border)', strokeDasharray: '3 3' } },
  tooltip: {
    container: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      color: 'var(--color-foreground)',
      fontSize: '10px',
      padding: '8px 12px',
    },
  },
  legends: {
    text: { fill: 'var(--color-muted-foreground)', fontSize: 10 },
  },
  labels: {
    text: { fill: 'var(--color-foreground)', fontSize: 10, fontWeight: 600 },
  },
};

export function CashFlowSankey() {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [categoriesRes, summaryRes] = await Promise.all([
          fetch(`/api/cash-flow/categories?month=${month}`),
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
  }, [month]);

  const handleNodeClick = (nodeId: string) => {
    const allCategories = sankeyData?.nodes || [];
    const catNode = allCategories.find((n) => n.id === nodeId);
    if (catNode && !['Income', 'Expenses', 'Savings'].includes(catNode.id)) {
      const monthNum = parseInt(month.split('-')[1]);
      const year = parseInt(month.split('-')[0]);
      const lastDay = new Date(year, monthNum, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      router.push(`/transactions?startDate=${month}-01&endDate=${endDate}`);
    }
  };

  const prevMonth = () => {
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() - 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextMonth = () => {
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() + 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Cash Flow Sankey</h3>
        </div>
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Sankey</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (!sankeyData || sankeyData.nodes.length === 0 || sankeyData.links.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Sankey</h3>
        <ChartEmptyState variant="nodata" description="No data available for sankey diagram" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Cash Flow Sankey</h3>
      </div>
      {/* Month navigation */}
      <div className="px-5 pb-2 flex items-center gap-2">
        <button
          onClick={prevMonth}
          className="px-2 py-0.5 rounded-md text-xs bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
        >
          &larr;
        </button>
        <span className="text-xs font-medium text-foreground">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="px-2 py-0.5 rounded-md text-xs bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
        >
          &rarr;
        </button>
      </div>
      <div className="h-[400px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveSankey
            data={sankeyData}
            margin={{ top: 20, right: 120, bottom: 20, left: 120 }}
            align="justify"
            colors={{ datum: 'data.nodeColor' }}
            nodeOpacity={0.95}
            nodeHoverOthersOpacity={0.25}
            nodeThickness={20}
            nodeSpacing={28}
            nodeBorderWidth={0}
            linkOpacity={0.35}
            linkHoverOpacity={0.7}
            linkContract={3}
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={14}
            theme={sankeyTheme}
            onClick={(datum) => {
              const d = datum as unknown as { id: string };
              handleNodeClick(d.id);
            }}
            nodeTooltip={({ node }) => (
              <ChartTooltip>
                <TooltipHeader>{node.label}</TooltipHeader>
                <TooltipRow label="Total" value={formatCurrency(node.value)} />
              </ChartTooltip>
            )}
            linkTooltip={({ link }) => (
              <ChartTooltip>
                <TooltipHeader>{link.source.label} &rarr; {link.target.label}</TooltipHeader>
                <TooltipRow label="Amount" value={formatCurrency(link.value)} />
              </ChartTooltip>
            )}
            animate={true}
            motionConfig="gentle"
          />
        </div>
      </div>
    </div>
  );
}
