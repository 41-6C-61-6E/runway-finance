'use client';

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { ShieldCheck } from 'lucide-react';

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
  'Other':        '529, etc.',
};

const WRAPPER_ORDER: TaxWrapper[] = ['Tax-Free', 'Tax-Deferred', 'Taxable', 'Other'];

export function TaxBreakdown({ accounts }: TaxBreakdownProps) {
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

  const advantagedPct = useMemo(() => {
    const adv = (wrapperTotals['Tax-Free'] ?? 0) + (wrapperTotals['Tax-Deferred'] ?? 0);
    return total > 0 ? (adv / total) * 100 : 0;
  }, [wrapperTotals, total]);

  const activeWrappers = WRAPPER_ORDER.filter((w) => (wrapperTotals[w] ?? 0) > 0);

  if (accounts.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm h-full">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <span>Tax Wrapper Breakdown</span>
          </div>
        }
      />

      {!isCollapsed && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Callout */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-chart-1/10 border border-chart-1/20">
            <ShieldCheck className="w-4 h-4 text-chart-1 shrink-0" />
            <p className="text-xs text-foreground">
              <span className="font-bold blur-number">{advantagedPct.toFixed(0)}%</span>
              <span className="text-muted-foreground"> of your portfolio is in tax-advantaged accounts</span>
            </p>
          </div>

          {/* Stacked progress bar */}
          <div className="space-y-1.5">
            <div className="h-3 flex rounded-full overflow-hidden gap-px bg-muted/30">
              {activeWrappers.map((wrapper) => {
                const pct = total > 0 ? ((wrapperTotals[wrapper] ?? 0) / total) * 100 : 0;
                return (
                  <div
                    key={wrapper}
                    style={{ width: `${pct}%`, background: WRAPPER_COLORS[wrapper] }}
                    className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                    title={`${wrapper}: ${pct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            {/* % labels */}
            <div className="flex justify-between text-[9px] text-muted-foreground/60">
              {activeWrappers.map((wrapper) => {
                const pct = total > 0 ? ((wrapperTotals[wrapper] ?? 0) / total) * 100 : 0;
                if (pct < 5) return null;
                return <span key={wrapper}>{pct.toFixed(0)}%</span>;
              })}
            </div>
          </div>

          {/* Wrapper rows */}
          <div className="space-y-3">
            {activeWrappers.map((wrapper) => {
              const value = wrapperTotals[wrapper] ?? 0;
              const pct = total > 0 ? (value / total) * 100 : 0;
              return (
                <div key={wrapper} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: WRAPPER_COLORS[wrapper] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-foreground">{wrapper}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono font-bold text-foreground blur-number">{formatCurrency(value)}</span>
                        <span className="text-[10px] text-muted-foreground/70 w-9 text-right tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed truncate" title={WRAPPER_DESCRIPTIONS[wrapper]}>
                      {WRAPPER_DESCRIPTIONS[wrapper]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
