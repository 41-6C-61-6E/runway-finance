'use client';

import { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { formatCurrency } from '@/lib/utils/format';
import { formatCompactCurrency, formatPlainPercent } from '@/lib/utils/format';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { isFireEligibleAccount } from '@/lib/utils/account-scope';
import { buildEnginePlan } from '@/lib/utils/build-engine-plan';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { Slider } from '@/components/ui/slider';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { TableScroll } from '@/components/ui/table-scroll';
import { ClickOutsideBackdrop, ModalBackdrop } from '@/components/ui/modal-overlay';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceDot,
  ReferenceArea,
} from 'recharts';
import {
  TrendingUp,
  Flame,
  Calendar,
  Clock,
  Palmtree,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Award,
  Landmark,
  Layers,
  Sparkles,
  ArrowDownCircle,
  HelpCircle,
  Flag,
  Percent,
  ShieldAlert,
  AlertTriangle,
  Scale,
  Eye,
  EyeOff,
  Filter,
  SlidersHorizontal,
  Check,
  Settings,
  Users,
  X,
  Building2,
  ArrowUpCircle,
} from 'lucide-react';

import { ProjectionOptionsPopover } from './projection-options-popover';
import { FireProjectionsSidePanel } from './fire-projections-side-panel';
import { MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';
import {
  YearDetailModal,
  YearlySimulationTable,
  CustomTooltip,
  GroupedLegend,
  MonteCarloTooltip,
  DrawdownTooltip,
  WithdrawalSequencingCard,
  WhatIfScenarioCard,
  buildMilestoneCallouts,
} from './projection';

const WITHDRAWAL_STRATEGIES = [
  { id: 'textbook', title: 'Taxable First (Textbook)', desc: 'Cash → Taxable → Traditional → Roth' },
  { id: 'proportional', title: 'Proportional (Pro-Rata)', desc: 'Draw proportionally across all portfolio accounts' },
  { id: 'tax_deferred_first', title: 'Tax-Deferred First (Waterfall)', desc: 'Traditional before Taxable & Roth to minimize RMDs' },
  { id: 'tax_optimized', title: 'Tax Bracket Filling', desc: 'Fill lower tax brackets with Traditional first' },
  { id: 'roth_ladder', title: 'Roth Conversion Ladder', desc: 'Annual pre-tax conversions to Roth up to 12% bracket', isRothLadder: true, enableRothConversions: true },
];

interface ProjectionTabProps {
  plan: any;
  accounts: any[];
  onUpdatePlan: (updates: any) => void;
  dollarMode?: 'real' | 'nominal';
  onToggleDollarMode?: (mode: 'real' | 'nominal') => void;
  viewMode?: 'deterministic' | 'monte_carlo';
  onToggleViewMode?: (mode: 'deterministic' | 'monte_carlo') => void;
  desktopHeader?: React.ReactNode;
  subHeader?: React.ReactNode;
}

export function ProjectionTab({
  plan,
  accounts,
  onUpdatePlan,
  dollarMode: propDollarMode,
  onToggleDollarMode,
  viewMode: propViewMode,
  onToggleViewMode,
  desktopHeader,
  subHeader,
}: ProjectionTabProps) {
  const [showYearlyTable, setShowYearlyTable] = usePersistentState<boolean>(
    'finance:plans:projection:showYearlyTable',
    false
  );
  const [showDrawdownDetails, setShowDrawdownDetails] = useState(true);
  const [localRetirementAge, setLocalRetirementAge] = useState(Number(plan?.retirementAge) || 60);
  const [localSpouseRetirementAge, setLocalSpouseRetirementAge] = useState(Number(plan?.spouseRetirementAge) || 60);
  const [localReturnRate, setLocalReturnRate] = useState(7);
  const [localInflationRate, setLocalInflationRate] = useState(3.0);
  const [localExpenseModifier, setLocalExpenseModifier] = useState(0);

  // UX Toggles: Dollar Mode, View Mode
  const [internalDollarMode, setInternalDollarMode] = useState<'real' | 'nominal'>('real');
  const [internalViewMode, setInternalViewMode] = useState<'deterministic' | 'monte_carlo'>('deterministic');

  const dollarMode = propDollarMode ?? internalDollarMode;
  const setDollarMode = (mode: 'real' | 'nominal') => {
    if (onToggleDollarMode) onToggleDollarMode(mode);
    else setInternalDollarMode(mode);
  };

  const viewMode = propViewMode ?? internalViewMode;
  const setViewMode = (mode: 'deterministic' | 'monte_carlo') => {
    if (onToggleViewMode) onToggleViewMode(mode);
    else setInternalViewMode(mode);
  };
  const [chartType, setChartType] = usePersistentState<'total' | 'stacked_category' | 'stacked_account'>(
    'finance:plans:projection:chartType',
    'stacked_category'
  );
  const [showMilestones, setShowMilestones] = usePersistentState<boolean>(
    'finance:plans:projection:showMilestones',
    true
  );
  const [showChartOptionsDropdown, setShowChartOptionsDropdown] = useState(false);
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);
  const [isOptionsPopoverOpen, setIsOptionsPopoverOpen] = useState(false);
  const [selectedYearDetail, setSelectedYearDetail] = useState<any>(null);
  const [activeAssetCategories, setActiveAssetCategories] = usePersistentState<Record<string, boolean>>(
    'finance:plans:projection:assetCategories',
    {
      taxable: true,
      taxDeferred: true,
      taxFree: true,
      hsa: true,
      cash: true,
    }
  );
  // Collapsible section states using useCardCollapsed hook
  const [isControlsCollapsed, setIsControlsCollapsed] = useCardCollapsed('fire_projection_controls', true); // Collapsed by default
  const [isMainChartCollapsed, setIsMainChartCollapsed] = useCardCollapsed('fire_main_chart');
  const [isCashFlowCollapsed, setIsCashFlowCollapsed] = useCardCollapsed('fire_cash_flow');
  const [isWhatIfCollapsed, setIsWhatIfCollapsed] = useCardCollapsed('fire_what_if');
  const [isYearlyTableCollapsed, setIsYearlyTableCollapsed] = useCardCollapsed('fire_yearly_table');

  // Sync local retirement age state when plan changes
  useEffect(() => {
    if (plan?.retirementAge) {
      setLocalRetirementAge(Number(plan.retirementAge));
    }
    if (plan?.spouseRetirementAge) {
      setLocalSpouseRetirementAge(Number(plan.spouseRetirementAge));
    }
  }, [plan?.retirementAge, plan?.spouseRetirementAge]);

  const birthYear = Number(plan?.primaryBirthYear) || 1985;
  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - birthYear;

  // Compute current net worth from included plan accounts
  const currentNetWorth = useMemo(() => {
    if (Array.isArray(plan?.accounts) && plan.accounts.length > 0) {
      return plan.accounts
        .filter((acc: any) => acc.isIncluded !== false && isFireEligibleAccount(acc))
        .reduce((sum: number, acc: any) => sum + (parseFloat(acc.balance) || 0), 0);
    }
    let assets = 0;
    let liabilities = 0;
    for (const acc of accounts) {
      if (!isFireEligibleAccount(acc)) continue;
      const bal = parseFloat(acc.balance) || 0;
      if (['credit_card', 'loan', 'mortgage', 'car_loan'].includes(acc.type) || bal < 0) {
        liabilities += Math.abs(bal);
      } else {
        assets += bal;
      }
    }
    return assets - liabilities;
  }, [plan, accounts]);

  const deferredRetirementAge = useDeferredValue(localRetirementAge);
  const deferredSpouseRetirementAge = useDeferredValue(localSpouseRetirementAge);
  const deferredReturnRate = useDeferredValue(localReturnRate);
  const deferredInflationRate = useDeferredValue(localInflationRate);
  const deferredExpenseModifier = useDeferredValue(localExpenseModifier);

  // Construct EnginePlan object dynamically reacting to sliders without blocking UI
  const enginePlanObj = useMemo(() => {
    if (!plan) return null;
    return buildEnginePlan(plan, {
      retirementAge: deferredRetirementAge,
      spouseRetirementAge: deferredSpouseRetirementAge,
      expectedGrowthRate: deferredReturnRate,
      fixedInflationRate: deferredInflationRate,
      expenseModifier: deferredExpenseModifier,
    });
  }, [plan, deferredRetirementAge, deferredSpouseRetirementAge, deferredReturnRate, deferredInflationRate, deferredExpenseModifier]);

  const simulation = useMemo(() => {
    if (!enginePlanObj) return null;
    return runRetirementSimulation(enginePlanObj);
  }, [enginePlanObj]);

  // Monte Carlo output for probabilistic fan chart
  const monteCarloOutput = useMemo(() => {
    if (viewMode !== 'monte_carlo' || !enginePlanObj) return null;
    return runMonteCarloSimulation(enginePlanObj, {
      numberOfTrials: 250,
      model: 'historical_bootstrap',
      adjustForInflation: dollarMode === 'real',
      fixedInflationRate: deferredInflationRate,
    });
  }, [viewMode, enginePlanObj, dollarMode, deferredInflationRate]);

  const yearlySimResults = useMemo(() => simulation?.yearlyResults || [], [simulation]);

  // Rich Milestone Callouts Data (Sorted Chronologically)
  const milestoneCallouts = useMemo(() => {
    return buildMilestoneCallouts({
      birthYear,
      localRetirementAge,
      localSpouseRetirementAge,
      currentAge,
      plan,
    });
  }, [birthYear, localRetirementAge, localSpouseRetirementAge, currentAge, plan]);

  const milestoneMap = useMemo(() => {
    const map: Record<number, any> = {};
    for (const m of milestoneCallouts) {
      map[m.age] = m;
    }
    return map;
  }, [milestoneCallouts]);

  // Active drawdown strategy (switchable via pill on the Withdrawal Sequencing chart)
  const rawWithdrawalMethod: string = plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook';
  const isRothConversionsEnabled = Boolean(plan?.settings?.enableRothConversions);
  // Detect roth_ladder: textbook method + Roth conversions enabled
  const activeWithdrawalMethod: string =
    rawWithdrawalMethod === 'textbook' && isRothConversionsEnabled ? 'roth_ladder' : rawWithdrawalMethod;
  const activeStrategy = WITHDRAWAL_STRATEGIES.find((s) => s.id === activeWithdrawalMethod);
  const activeStrategyLabel = activeStrategy
    ? activeStrategy.title
    : activeWithdrawalMethod === 'custom_order' ? 'Custom Priority Order' : activeWithdrawalMethod;

  const handleSelectWithdrawalMethod = (strategyId: string) => {
    setShowStrategyDropdown(false);
    if (strategyId === activeWithdrawalMethod) return;
    const strat = WITHDRAWAL_STRATEGIES.find((s) => s.id === strategyId);
    if (strat && (strat as any).isRothLadder) {
      // Roth Conversion Ladder uses textbook withdrawal + enables Roth conversions
      onUpdatePlan({
        withdrawalMethod: 'textbook',
        settings: {
          withdrawalMethod: 'textbook',
          enableRothConversions: true,
          rothConversionTargetCeiling: 'top_of_12',
          avoidIrmaaCliffs: true,
        },
      });
    } else {
      onUpdatePlan({
        withdrawalMethod: strategyId,
        settings: {
          withdrawalMethod: strategyId,
          enableRothConversions: false,
        },
      });
    }
  };

  // Unique account list across simulation with color mapping for stacked area chart by individual account
  const accountSeries = useMemo(() => {
    if (!yearlySimResults || yearlySimResults.length === 0) return [];
    const accMap = new Map<string, { id: string; name: string; category: string; type: string; color: string }>();

    const categoryPalette: Record<string, string[]> = {
      taxable: ['#f59e0b', '#d97706', '#b45309', '#fbbf24', '#eab308'],
      taxDeferred: ['#a855f7', '#8b5cf6', '#7c3aed', '#6366f1', '#4f46e5'],
      taxFree: ['#ec4899', '#f43f5e', '#e11d48', '#10b981', '#059669'],
      hsa: ['#14b8a6', '#0d9488', '#0f766e'],
      cash: ['#94a3b8', '#64748b', '#06b6d4', '#0891b2'],
    };

    const categoryIndexTracker: Record<string, number> = {
      taxable: 0,
      taxDeferred: 0,
      taxFree: 0,
      hsa: 0,
      cash: 0,
    };

    yearlySimResults.forEach((y: any) => {
      (y.accountBalances || []).forEach((a: any) => {
        if (!accMap.has(a.id)) {
          const cat = a.category || 'cash';
          const colors = categoryPalette[cat] || ['#3b82f6'];
          const colorIdx = (categoryIndexTracker[cat] || 0) % colors.length;
          categoryIndexTracker[cat] = (categoryIndexTracker[cat] || 0) + 1;
          const color = colors[colorIdx];

          accMap.set(a.id, {
            id: a.id,
            name: a.name,
            category: cat,
            type: a.type,
            color,
          });
        }
      });
    });

    return Array.from(accMap.values());
  }, [yearlySimResults]);

  // Chart data series mapped dynamically with Real vs. Nominal support & Expenses throughout timeline
  const chartData = useMemo(() => {
    if (yearlySimResults.length > 0) {
      return yearlySimResults.map((y: any, idx: number) => {
        const discountFactor = dollarMode === 'real' ? Math.pow(1 + (localInflationRate / 100), idx) : 1;

        const cashD = Math.round((y.drawdownsByType?.cash || 0) / discountFactor);
        const taxD = Math.round((y.drawdownsByType?.taxable || 0) / discountFactor);
        const tradD = Math.round((y.drawdownsByType?.traditional || 0) / discountFactor);
        const rothD = Math.round((y.drawdownsByType?.roth || 0) / discountFactor);
        const hsaD = Math.round((y.drawdownsByType?.hsa || 0) / discountFactor);
        const actualDrawdowns = cashD + taxD + tradD + rothD + hsaD;
        const nw = Math.round(y.netWorth / discountFactor);

        // Portfolio breakdown by tax category with active filter toggles
        const rawCash = Math.round((y.portfolioBreakdown?.cash || 0) / discountFactor);
        const rawTaxable = Math.round((y.portfolioBreakdown?.taxable || 0) / discountFactor);
        const rawTaxDeferred = Math.round((y.portfolioBreakdown?.taxDeferred || 0) / discountFactor);
        const rawTaxFree = Math.round((y.portfolioBreakdown?.taxFree || 0) / discountFactor);
        const rawHsa = Math.round((y.portfolioBreakdown?.hsa || 0) / discountFactor);

        const cashBal = activeAssetCategories.cash ? rawCash : 0;
        const taxableBal = activeAssetCategories.taxable ? rawTaxable : 0;
        const taxDeferredBal = activeAssetCategories.taxDeferred ? rawTaxDeferred : 0;
        const taxFreeBal = activeAssetCategories.taxFree ? rawTaxFree : 0;
        const hsaBal = activeAssetCategories.hsa ? rawHsa : 0;

        const filteredPortfolio = cashBal + taxableBal + taxDeferredBal + taxFreeBal + hsaBal;

        // Process per-account projected balances and map keys for stacked account view
        const accDataPointKeys: Record<string, number> = {};
        const rawAccountBalances = (y.accountBalances || []).map((acc: any) => {
          const projBal = Math.round(acc.balance / discountFactor);
          const isIncluded = activeAssetCategories[acc.category] !== false;
          accDataPointKeys[`acc_${acc.id}`] = isIncluded ? projBal : 0;
          return {
            ...acc,
            projectedBalance: projBal,
          };
        });

        const filteredAccountBalances = rawAccountBalances.filter(
          (acc: any) => activeAssetCategories[acc.category] !== false
        );

        // Discretionary drawdown excludes forced RMD distributions
        const discDeficit = Math.round((y.discretionaryDeficitWithdrawn ?? y.deficitWithdrawn ?? 0) / discountFactor);
        const discretionaryWithdrawalRate = discDeficit > 0 && (nw + discDeficit) > 0
          ? (discDeficit / (nw + discDeficit)) * 100
          : 0;

        const totalWithdrawalRate = actualDrawdowns > 0 && (nw + actualDrawdowns) > 0
          ? (actualDrawdowns / (nw + actualDrawdowns)) * 100
          : 0;

        const salInc = Math.round((y.salaryIncome || 0) / discountFactor);
        const ssInc = Math.round((y.ssIncome || 0) / discountFactor);
        const penInc = Math.round((y.pensionIncome || 0) / discountFactor);
        const othInc = Math.round((y.otherIncome || 0) / discountFactor);
        const totExpenses = Math.round(y.totalExpenses / discountFactor);
        const totSources = salInc + ssInc + penInc + othInc + actualDrawdowns;
        const shortfall = totExpenses > totSources ? totExpenses - totSources : 0;

        return {
          year: y.year,
          age: y.primaryAge,
          spouseAge: y.spouseAge,
          label: `${y.year}`,
          netWorth: filteredPortfolio,
          portfolioBalance: filteredPortfolio,
          totalNetWorth: nw,
          totalUnfilteredPortfolio: rawCash + rawTaxable + rawTaxDeferred + rawTaxFree + rawHsa,
          cashBal,
          taxableBal,
          taxDeferredBal,
          taxFreeBal,
          hsaBal,
          ...accDataPointKeys,
          accountBalances: rawAccountBalances,
          filteredAccountBalances,
          income: Math.round(y.grossIncome / discountFactor),
          expenses: y.primaryAge >= localRetirementAge ? totExpenses : null,
          isRetired: y.primaryAge >= localRetirementAge,
          salaryIncome: salInc,
          ssIncome: ssInc,
          pensionIncome: penInc,
          otherIncome: othInc,
          cashDrawdown: cashD,
          taxableDrawdown: taxD,
          traditionalDrawdown: tradD,
          rothDrawdown: rothD,
          hsaDrawdown: hsaD,
          actualDrawdowns,
          totalSources: totSources,
          shortfall,
          totalDrawdown: Math.round((y.deficitWithdrawn || 0) / discountFactor),
          discretionaryDeficit: discDeficit,
          rmdMandatory: Math.round((y.rmdMandatoryDrawdown || 0) / discountFactor),
          withdrawalRate: Math.round(discretionaryWithdrawalRate * 10) / 10,
          totalWithdrawalRate: Math.round(totalWithdrawalRate * 10) / 10,
          rothConversionAmount: Math.round((y.rothConversionAmount || 0) / discountFactor),
          magi: Math.round((y.magi || 0) / discountFactor),
          taxesPaid: Math.round((y.taxesPaid || 0) / discountFactor),
          effectiveTaxRate: y.effectiveTaxRate || 0,
          niitTax: Math.round((y.niitTax || 0) / discountFactor),
          amtTax: Math.round((y.amtTax || 0) / discountFactor),
          earlyPenaltyTax: Math.round((y.earlyPenaltyTax || 0) / discountFactor),
          irmaaNotice: y.irmaaNotice,
          earlyWithdrawalWarnings: y.earlyWithdrawalWarnings || [],
          earlyPenaltyDetails: y.earlyPenaltyDetails || [],
          irmaaSurchargeAnnual: Math.round((y.irmaaSurchargeAnnual || 0) / discountFactor),
          capitalGains0PctRoom: Math.round((y.capitalGains0PctRoom || 0) / discountFactor),
          niitHeadroom: Math.round((y.niitHeadroom || 0) / discountFactor),
          accountDrawdowns: y.accountDrawdowns || [],
          milestone: milestoneMap[y.primaryAge],
        };
      });
    }
    return [];
  }, [yearlySimResults, localRetirementAge, milestoneMap, dollarMode, localInflationRate, activeAssetCategories]);

  // Monte Carlo chart data format
  const monteCarloChartData = useMemo(() => {
    if (!monteCarloOutput) return [];
    const p = monteCarloOutput.percentiles;
    return p.years.map((year, idx) => ({
      year,
      age: currentAge + idx,
      p10: Math.round(p.p10[idx]),
      p25: Math.round(p.p25[idx]),
      p50: Math.round(p.p50[idx]),
      p75: Math.round(p.p75[idx]),
      p90: Math.round(p.p90[idx]),
    }));
  }, [monteCarloOutput, currentAge]);

  // Fix FIRE Target: Sum ALL expense events, not just the first one
  const totalAnnualExpensesFromPlan = useMemo(() => {
    if (!plan?.events || plan.events.length === 0) return 42500;
    const expenseEvents = plan.events.filter((e: any) => e.category === 'expense');
    if (expenseEvents.length === 0) return 42500;
    const rawSum = expenseEvents.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);
    return rawSum * (1 + localExpenseModifier / 100);
  }, [plan?.events, localExpenseModifier]);

  const fireNumber = totalAnnualExpensesFromPlan * (plan?.fiTargetMultiplier || 25);
  const fireProgress = fireNumber > 0 ? Math.min(100, (currentNetWorth / fireNumber) * 100) : 0;
  const isPlanDepleted = simulation?.depletionAge !== undefined || simulation?.success === false;
  const yearsToFire = !isPlanDepleted ? chartData.findIndex((d) => d.netWorth >= fireNumber) : -1;
  const yearsToFireDisplay = isPlanDepleted ? 'Depletes' : (yearsToFire >= 0 ? yearsToFire : '—');
  // Use discretionary withdrawal rate for peak withdrawal rate risk assessment
  const peakWithdrawalRate = Math.max(0, ...chartData.filter((d) => d.isRetired).map((d) => d.withdrawalRate));

  const retirementDataPoint = chartData.find((d) => d.age === localRetirementAge);
  const netWorthAtRetirement = retirementDataPoint?.netWorth || 0;

  // Plan Health Scorecard
  const planHealth = useMemo(() => {
    const depleted = simulation?.depletionAge !== undefined || !simulation?.success;
    if (depleted) {
      return {
        status: 'High Risk / Depletes',
        badge: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        desc: `Portfolio depletes at age ${simulation?.depletionAge || localRetirementAge}`,
        score: 'D',
      };
    }
    if (peakWithdrawalRate > 5.5) {
      return {
        status: 'Elevated Risk',
        badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        desc: `Peak withdrawal rate (${formatPlainPercent(peakWithdrawalRate)}) exceeds 5.5% threshold`,
        score: 'C',
      };
    }
    if (peakWithdrawalRate > 3.8) {
      return {
        status: 'Sustainable Plan',
        badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        desc: `Peak withdrawal rate (${formatPlainPercent(peakWithdrawalRate)}) fits 4% FIRE safety guidelines`,
        score: 'B+',
      };
    }
    return {
      status: 'Optimal Health',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      desc: `Low withdrawal rate (${formatPlainPercent(peakWithdrawalRate)}) with strong legacy growth buffer`,
      score: 'A+',
    };
  }, [simulation, peakWithdrawalRate, localRetirementAge]);

  const diagnosticWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (totalAnnualExpensesFromPlan <= 0) {
      warnings.push('No living expenses configured for this plan. Add expense events under Settings -> Plan Details to see realistic portfolio drawdowns.');
    }
    if (plan?.hasSpouse && !plan?.spouseBirthYear) {
      warnings.push('Spouse option is enabled, but spouse birth year is missing. Defaulting to 1987.');
    }
    if (simulation?.depletionAge) {
      warnings.push(`Portfolio depletes at age ${simulation.depletionAge}. Consider increasing retirement age or expected growth rate.`);
    }
    return warnings;
  }, [totalAnnualExpensesFromPlan, plan?.hasSpouse, plan?.spouseBirthYear, simulation?.depletionAge]);

  const summaryContent = (
    <div className="space-y-6">
      {subHeader && <div className="lg:hidden">{subHeader}</div>}
      <FireProjectionsSidePanel
        plan={plan}
        currentNetWorth={currentNetWorth}
        netWorthAtRetirement={netWorthAtRetirement}
        fireNumber={fireNumber}
        fireProgress={fireProgress}
        yearsToFireDisplay={yearsToFireDisplay}
        simulation={simulation}
        peakWithdrawalRate={peakWithdrawalRate}
        planHealth={planHealth}
        localRetirementAge={localRetirementAge}
        milestoneCallouts={milestoneCallouts}
      />
    </div>
  );

  const mainContent = (
    <div className="space-y-6">
      {subHeader && <div className="lg:hidden">{subHeader}</div>}
      {/* Engine Diagnostic Warnings Banner */}
      {diagnosticWarnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Engine Setup Diagnostic Warnings ({diagnosticWarnings.length})</span>
          </div>
          <ul className="space-y-1 pl-6 list-disc text-xs text-amber-700 dark:text-amber-300 font-mono">
            {diagnosticWarnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Chart Card: Deterministic vs Monte Carlo Fan Chart */}
      <div className="bg-card border border-border rounded-xl shadow-sm space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isMainChartCollapsed}
          onToggle={setIsMainChartCollapsed}
          icon={TrendingUp}
          title={viewMode === 'monte_carlo' ? 'Monte Carlo Portfolio Trajectory (250 Bootstrap Trials)' : 'Portfolio Trajectory'}
          description={`Age ${currentAge} → ${plan?.lifeExpectancyAge || 100} • ${dollarMode === 'real' ? "Real (Inflation-Adjusted Today's Dollars)" : 'Nominal Dollars'}`}
          actions={
            <div className="flex items-center gap-2 sm:gap-3">
              {viewMode === 'monte_carlo' && monteCarloOutput ? (
                <div className="hidden sm:flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg text-xs font-mono">
                  <span className="font-bold text-amber-500">Success Rate: {formatPlainPercent(monteCarloOutput.successRate)}</span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-foreground">Median Legacy: {formatCurrency(monteCarloOutput.medianLegacy)}</span>
                </div>
              ) : null}
              <ProjectionOptionsPopover
                dollarMode={dollarMode}
                onToggleDollarMode={setDollarMode}
                viewMode={viewMode}
                onToggleViewMode={setViewMode}
              />
            </div>
          }
        />

        {!isMainChartCollapsed && (
          <>

        {/* Collapsible Options Panel (Structured like Net Worth Chart & Accounts page) */}
        {viewMode === 'deterministic' && (
          <CollapsibleFilterPanel
            isOpen={showChartOptionsDropdown}
            onToggle={() => setShowChartOptionsDropdown(!showChartOptionsDropdown)}
            feedback={
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {chartType === 'stacked_account' ? 'Stacked by Account' : chartType === 'stacked_category' ? 'Stacked by Category' : 'Total Trajectory'}
                </span>
                {showMilestones && (
                  <span className="bg-muted/60 text-muted-foreground border border-border px-2 py-0.5 rounded text-[10px] font-semibold">
                    Milestones Enabled
                  </span>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {/* Chart View Style */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Visualization Style
                </label>
                <div className="grid grid-cols-3 gap-1 bg-muted/40 p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setChartType('stacked_category')}
                    className={`py-1 px-1.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      chartType === 'stacked_category' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Layers className="w-3 h-3 text-primary shrink-0" />
                    By Category
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartType('stacked_account')}
                    className={`py-1 px-1.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      chartType === 'stacked_account' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Layers className="w-3 h-3 text-emerald-500 shrink-0" />
                    By Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartType('total')}
                    className={`py-1 px-1.5 rounded text-[11px] font-bold transition-all cursor-pointer text-center ${
                      chartType === 'total' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Total Line
                  </button>
                </div>
              </div>

              {/* Milestones Visibility Toggle */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Milestone Markers
                </label>
                <label className="flex items-center justify-between p-2 bg-muted/30 border border-border rounded-lg cursor-pointer h-[38px]">
                  <span className="text-xs font-medium text-foreground">Show Milestones on Chart</span>
                  <input
                    type="checkbox"
                    checked={showMilestones}
                    onChange={(e) => setShowMilestones(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </label>
              </div>

              {/* Account / Asset Category Filters */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Filter Asset Categories
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                  {[
                    { key: 'taxable', label: 'Taxable Brokerage', dot: 'bg-amber-500' },
                    { key: 'taxDeferred', label: 'Tax-Deferred (Trad)', dot: 'bg-purple-500' },
                    { key: 'taxFree', label: 'Tax-Free (Roth)', dot: 'bg-pink-500' },
                    { key: 'hsa', label: 'HSA', dot: 'bg-teal-500' },
                    { key: 'cash', label: 'Cash & Savings', dot: 'bg-slate-400' },
                  ].map((cat) => (
                    <label
                      key={cat.key}
                      className="flex items-center justify-between p-1.5 bg-muted/20 border border-border rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cat.dot}`} />
                        <span className="truncate">{cat.label}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(activeAssetCategories[cat.key])}
                        onChange={(e) =>
                          setActiveAssetCategories((prev) => ({
                            ...prev,
                            [cat.key]: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 accent-primary rounded cursor-pointer shrink-0 ml-1"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleFilterPanel>
        )}

        {/* Dynamic Chart Container */}
        <div className="p-5">

        {/* Dynamic Chart */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 100, height: 100 }}>
            {viewMode === 'deterministic' ? (
              <AreaChart data={chartData} margin={{ top: 25, right: 25, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="accumulationGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="taxableGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="taxDeferredGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="taxFreeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="hsaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />

                <XAxis
                  dataKey="age"
                  stroke="currentColor"
                  className="text-xs text-muted-foreground"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(age) => `${age}`}
                />
                <YAxis
                  stroke="currentColor"
                  className="text-xs text-muted-foreground"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => formatCompactCurrency(val)}
                />

                <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />

                {chartType === 'total' ? (
                  <Area
                    type="monotone"
                    dataKey="portfolioBalance"
                    name="Retirement Portfolio"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={0}
                    fill="none"
                  />
                ) : chartType === 'stacked_account' ? (
                  accountSeries.map((acc) => (
                    <Area
                      key={acc.id}
                      type="monotone"
                      dataKey={`acc_${acc.id}`}
                      name={acc.name}
                      stackId="portfolio"
                      stroke={acc.color}
                      strokeWidth={1.5}
                      fill={acc.color}
                      fillOpacity={0.45}
                    />
                  ))
                ) : (
                  <>
                    <Area type="monotone" dataKey="cashBal" name="Cash & Savings" stackId="portfolio" stroke="#94a3b8" strokeWidth={1.5} fill="url(#cashGrad)" />
                    <Area type="monotone" dataKey="taxableBal" name="Taxable Brokerage" stackId="portfolio" stroke="#f59e0b" strokeWidth={1.5} fill="url(#taxableGrad)" />
                    <Area type="monotone" dataKey="taxDeferredBal" name="Tax-Deferred (Traditional)" stackId="portfolio" stroke="#a855f7" strokeWidth={1.5} fill="url(#taxDeferredGrad)" />
                    <Area type="monotone" dataKey="taxFreeBal" name="Tax-Free (Roth)" stackId="portfolio" stroke="#ec4899" strokeWidth={1.5} fill="url(#taxFreeGrad)" />
                    <Area type="monotone" dataKey="hsaBal" name="HSA" stackId="portfolio" stroke="#14b8a6" strokeWidth={1.5} fill="url(#hsaGrad)" />
                  </>
                )}

                {showMilestones && milestoneCallouts.map((m, idx) => {
                  const pt = chartData.find((d) => d.age === m.age);
                  if (!pt) return null;
                  const IconComponent = m.icon;
                  return (
                    <ReferenceDot
                      key={idx}
                      x={m.age}
                      y={pt.netWorth}
                      shape={(dotProps: any) => {
                        const { cx, cy } = dotProps;
                        if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
                        return (
                          <g transform={`translate(${cx - 14}, ${cy - 14})`} className="cursor-pointer group">
                            <title>{`${m.title} (Age ${m.age}, Year ${m.year})\n${m.note}\nProjected Portfolio Balance: ${formatCurrency(pt.netWorth)}`}</title>
                            <circle
                              cx={14}
                              cy={14}
                              r={13}
                              fill="var(--card, #ffffff)"
                              stroke={m.stroke || '#10b981'}
                              strokeWidth={2.5}
                              className="shadow-sm transition-transform group-hover:scale-125"
                            />
                            <g transform="translate(6, 6)">
                              <IconComponent size={16} color={m.stroke || '#10b981'} />
                            </g>
                          </g>
                        );
                      }}
                    />
                  );
                })}
              </AreaChart>
            ) : (
              <AreaChart data={monteCarloChartData} margin={{ top: 25, right: 25, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="mcBandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} vertical={false} />
              <XAxis
                dataKey="age"
                stroke="currentColor"
                className="text-xs text-muted-foreground"
                tickLine={false}
                tick={(props: any) => {
                  const { x, y, payload } = props;
                  const dataPoint = chartData.find((d: any) => d.age === payload.value);
                  const hasPenalty = dataPoint && dataPoint.earlyPenaltyTax > 0;
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={0} y={0} dy={14} textAnchor="middle" fill="currentColor" fontSize={11} className="text-muted-foreground">
                        {payload.value}
                      </text>
                      {hasPenalty && (
                        <g transform="translate(-5, 18)">
                          <title>{`${dataPoint.earlyWithdrawalWarnings?.join('\n') || 'Early withdrawal penalty'}`}</title>
                          <polygon points="5,0 10,8 0,8" fill="#f59e0b" opacity={0.9} />
                          <text x={5} y={7} textAnchor="middle" fill="#000" fontSize={6} fontWeight="bold">!</text>
                        </g>
                      )}
                    </g>
                  );
                }}
              />
                <YAxis stroke="currentColor" className="text-xs text-muted-foreground" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} tickLine={false} tickFormatter={(val) => formatCompactCurrency(val)} />
                <Tooltip content={<MonteCarloTooltip />} wrapperStyle={{ zIndex: 100, opacity: 1 }} />
                <Area type="monotone" dataKey="p90" stroke="#f59e0b" strokeWidth={1} fill="url(#mcBandGrad)" name="90th Percentile (Optimistic)" />
                <Area type="monotone" dataKey="p75" stroke="#3b82f6" strokeWidth={1.5} fill="none" name="75th Percentile" />
                <Area type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2.5} fill="none" name="Median (P50)" />
                <Area type="monotone" dataKey="p25" stroke="#a855f7" strokeWidth={1.5} fill="none" name="25th Percentile" />
                <Area type="monotone" dataKey="p10" stroke="#f43f5e" strokeWidth={1.5} fill="none" name="10th Percentile (Conservative / 90% Confidence)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
        </div>
          </>
        )}
      </div>

      <WithdrawalSequencingCard
        chartData={chartData}
        isCashFlowCollapsed={isCashFlowCollapsed}
        setIsCashFlowCollapsed={setIsCashFlowCollapsed}
        showStrategyDropdown={showStrategyDropdown}
        setShowStrategyDropdown={setShowStrategyDropdown}
        activeStrategyLabel={activeStrategyLabel}
        activeWithdrawalMethod={activeWithdrawalMethod}
        handleSelectWithdrawalMethod={handleSelectWithdrawalMethod}
        dollarMode={dollarMode}
        setDollarMode={setDollarMode}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <WhatIfScenarioCard
        plan={plan}
        onUpdatePlan={onUpdatePlan}
        isWhatIfCollapsed={isWhatIfCollapsed}
        setIsWhatIfCollapsed={setIsWhatIfCollapsed}
        localRetirementAge={localRetirementAge}
        setLocalRetirementAge={setLocalRetirementAge}
        localSpouseRetirementAge={localSpouseRetirementAge}
        setLocalSpouseRetirementAge={setLocalSpouseRetirementAge}
        localReturnRate={localReturnRate}
        setLocalReturnRate={setLocalReturnRate}
        localInflationRate={localInflationRate}
        setLocalInflationRate={setLocalInflationRate}
        localExpenseModifier={localExpenseModifier}
        setLocalExpenseModifier={setLocalExpenseModifier}
      />

      <YearlySimulationTable
        chartData={chartData}
        isYearlyTableCollapsed={isYearlyTableCollapsed}
        setIsYearlyTableCollapsed={setIsYearlyTableCollapsed}
        localRetirementAge={localRetirementAge}
        setSelectedYearDetail={setSelectedYearDetail}
      />
    </div>
  );

  return (
    <>
      <MobileViewSwitcher
        desktopHeader={desktopHeader}
        main={mainContent}
        summary={summaryContent}
        summaryLabel="Scorecard"
        summaryCardId="fireProjectionsSidePanel"
      />

      {/* Year Detail Interactive Audit Modal */}
      <YearDetailModal
        isOpen={Boolean(selectedYearDetail)}
        yearData={selectedYearDetail}
        onClose={() => setSelectedYearDetail(null)}
      />
    </>
  );
}
