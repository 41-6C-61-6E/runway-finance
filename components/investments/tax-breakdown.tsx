'use client';

import { useMemo } from 'react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { ShieldCheck, PieChart, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Account {
  id: string;
  name: string;
  balance: number;
  institution: string | null;
  type: string;
  metadata?: any;
}

interface TaxBreakdownProps {
  accounts: Account[];
  title?: React.ReactNode;
}

type TaxWrapper = 'Tax-Free' | 'Tax-Deferred' | 'Taxable' | 'Other';

const TAX_WRAPPER_MAP: Record<string, TaxWrapper> = {
  rothira: 'Tax-Free',
  hsa: 'Tax-Free',
  health: 'Tax-Free',
  '401k': 'Tax-Deferred',
  '403b': 'Tax-Deferred',
  traditionalira: 'Tax-Deferred',
  sepira: 'Tax-Deferred',
  simpleira: 'Tax-Deferred',
  pension: 'Tax-Deferred',
  retirement: 'Tax-Deferred',
  investment: 'Taxable',
  brokerage: 'Taxable',
  '529': 'Other',
  otherAsset: 'Other',
  otherinvestment: 'Other',
};

const WRAPPER_COLORS: Record<TaxWrapper, string> = {
  'Tax-Free':     'var(--color-chart-1)',
  'Tax-Deferred': 'var(--color-chart-2)',
  'Taxable':      'var(--color-chart-4)',
  'Other':        'var(--color-muted-foreground)',
};

const WRAPPER_DESCRIPTIONS: Record<TaxWrapper, string> = {
  'Tax-Free':     'Roth IRA, HSA — contributions after-tax, growth & withdrawals tax-free',
  'Tax-Deferred': '401(k), Traditional IRA — contributions pre-tax, taxed on withdrawal',
  'Taxable':      'Brokerage — taxed on dividends and capital gains annually',
  'Other':        '529, education & other accounts',
};

const WRAPPER_ORDER: TaxWrapper[] = ['Tax-Free', 'Tax-Deferred', 'Taxable', 'Other'];

export function TaxBreakdown({ accounts, title }: TaxBreakdownProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('taxBreakdown');

  const wrapperTotals = useMemo(() => {
    const totals: Partial<Record<TaxWrapper, number>> = {};
    for (const acc of accounts) {
      const balance = acc.balance || 0;
      let rothPct: number | null = null;
      if (acc.metadata) {
        const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
        if (typeof meta.rothPercentage === 'number') {
          rothPct = meta.rothPercentage;
        }
      }

      if (rothPct !== null) {
        // Split the balance: Roth portion is Tax-Free
        const rothVal = balance * (rothPct / 100);
        const nonRothVal = balance * (1 - rothPct / 100);

        totals['Tax-Free'] = (totals['Tax-Free'] ?? 0) + rothVal;

        // Non-Roth gets the default wrapper
        const defaultWrapper = TAX_WRAPPER_MAP[acc.type.toLowerCase()] ?? 'Other';
        // Note: if the default wrapper is already Tax-Free (e.g. rothira), then the remaining portion should go to Tax-Deferred
        const nonRothWrapper = defaultWrapper === 'Tax-Free' ? 'Tax-Deferred' : defaultWrapper;
        totals[nonRothWrapper] = (totals[nonRothWrapper] ?? 0) + nonRothVal;
      } else {
        const wrapper = TAX_WRAPPER_MAP[acc.type.toLowerCase()] ?? 'Other';
        totals[wrapper] = (totals[wrapper] ?? 0) + balance;
      }
    }
    return totals;
  }, [accounts]);

  const total = useMemo(
    () => Object.values(wrapperTotals).reduce((s, v) => s + (v ?? 0), 0),
    [wrapperTotals]
  );

  const advantagedTotal = useMemo(
    () => (wrapperTotals['Tax-Free'] ?? 0) + (wrapperTotals['Tax-Deferred'] ?? 0),
    [wrapperTotals]
  );

  const advantagedPct = useMemo(() => {
    return total > 0 ? (advantagedTotal / total) * 100 : 0;
  }, [advantagedTotal, total]);

  const activeWrappers = WRAPPER_ORDER.filter((w) => (wrapperTotals[w] ?? 0) > 0);

  if (accounts.length === 0) return null;

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        collapseDirection="horizontal"
        showMobileToggle={false}
        title={
          title ?? (
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="font-bold text-foreground">Scorecard</span>
            </div>
          )
        }
        actions={
          total > 0 ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border font-mono bg-chart-1/10 text-chart-1 border-chart-1/20 shrink-0">
                <span className="blur-number">{Math.round(advantagedPct)}%</span> Sheltered
              </span>
            </div>
          ) : null
        }
        className="border-b border-sidebar-border/60 bg-sidebar"
      />

      {!isCollapsed && (
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* Section 1: Hero Tax-Advantaged Position */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                Tax-Advantaged Assets
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {activeWrappers.length} {activeWrappers.length === 1 ? 'wrapper' : 'wrappers'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono blur-number">
                {formatCurrency(advantagedTotal)}
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border font-mono bg-chart-1/10 text-chart-1 border-chart-1/20">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="blur-number">{Math.round(advantagedPct)}%</span>
                  <span className="opacity-80">sheltered</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  of <span className="font-mono blur-number">{formatCurrency(total)}</span> total
                </span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
              {advantagedPct >= 50
                ? 'Majority of your portfolio is sheltered in tax-free & tax-deferred accounts.'
                : 'Majority of your investments are held in taxable investment accounts.'}
            </p>
          </div>

          {/* Section 2: Stacked Progress Bar / Wrapper Distribution */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-foreground flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-primary shrink-0" />
                Wrapper Distribution
              </span>
              <span className="text-muted-foreground font-mono text-[11px] blur-number">
                {formatCurrency(total)}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="h-2.5 flex rounded-full overflow-hidden gap-px bg-muted/30">
                {activeWrappers.map((wrapper) => {
                  const pct = total > 0 ? ((wrapperTotals[wrapper] ?? 0) / total) * 100 : 0;
                  return (
                    <div
                      key={wrapper}
                      style={{ width: `${pct}%`, background: WRAPPER_COLORS[wrapper] }}
                      className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                      title={`${wrapper}: ${formatPlainPercent(pct)}`}
                    />
                  );
                })}
              </div>
              {/* % labels */}
              <div className="flex justify-between text-micro text-muted-foreground/60 font-mono">
                {activeWrappers.map((wrapper) => {
                  const pct = total > 0 ? ((wrapperTotals[wrapper] ?? 0) / total) * 100 : 0;
                  if (pct < 5) return null;
                  return <span key={wrapper}>{Math.round(pct)}%</span>;
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Wrapper Breakdown Rows */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
              Wrapper Breakdown
            </span>
            <div className="space-y-3">
              {activeWrappers.map((wrapper) => {
                const value = wrapperTotals[wrapper] ?? 0;
                const pct = total > 0 ? (value / total) * 100 : 0;
                return (
                  <div key={wrapper} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: WRAPPER_COLORS[wrapper] }}
                        />
                        <span className="font-semibold text-foreground truncate">{wrapper}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono">
                        <span className="text-xs font-bold text-foreground blur-number">
                          {formatCurrency(value)}
                        </span>
                        <span className="text-[11px] text-muted-foreground w-11 text-right tabular-nums">
                          {formatPlainPercent(pct)}
                        </span>
                      </div>
                    </div>
                    {/* Subtle progress track */}
                    <div className="w-full bg-muted/30 rounded-full h-1 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: WRAPPER_COLORS[wrapper] }}
                      />
                    </div>
                    <p
                      className="text-[10px] text-muted-foreground/70 leading-relaxed truncate"
                      title={WRAPPER_DESCRIPTIONS[wrapper]}
                    >
                      {WRAPPER_DESCRIPTIONS[wrapper]}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
