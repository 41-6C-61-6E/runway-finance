'use client';
import type { PlanData } from '../details/types';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { SectionHeading } from '@/components/ui/section-heading';
import { Slider } from '@/components/ui/slider';
import { formatPlainPercent } from '@/lib/utils/format';

export interface WhatIfScenarioCardProps {
  plan: PlanData;
  onUpdatePlan: (updates: Record<string, any>) => void;
  isWhatIfCollapsed: boolean;
  setIsWhatIfCollapsed: (v: boolean) => void;
  localRetirementAge: number;
  setLocalRetirementAge: (v: number) => void;
  localSpouseRetirementAge: number;
  setLocalSpouseRetirementAge: (v: number) => void;
  localReturnRate: number;
  setLocalReturnRate: (v: number) => void;
  localInflationRate: number;
  setLocalInflationRate: (v: number) => void;
  localExpenseModifier: number;
  setLocalExpenseModifier: (v: number) => void;
}

export function WhatIfScenarioCard({
  plan,
  onUpdatePlan,
  isWhatIfCollapsed,
  setIsWhatIfCollapsed,
  localRetirementAge,
  setLocalRetirementAge,
  localSpouseRetirementAge,
  setLocalSpouseRetirementAge,
  localReturnRate,
  setLocalReturnRate,
  localInflationRate,
  setLocalInflationRate,
  localExpenseModifier,
  setLocalExpenseModifier,
}: WhatIfScenarioCardProps) {
  return (
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <CollapsibleCardHeader
          isCollapsed={isWhatIfCollapsed}
          onToggle={setIsWhatIfCollapsed}
          title={
              <SectionHeading size="sm" icon={<Sparkles className="w-3.5 h-3.5 text-primary" />}>Interactive What-If Scenario Explorer</SectionHeading>
          }
        />

        {!isWhatIfCollapsed && (
          <div className="p-5 space-y-4">

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${Boolean(plan?.hasSpouse || plan?.filingStatus === 'married_joint') ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-6`}>
          {/* Primary Retirement Age Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Retirement Age</span>
              <span className="font-mono font-bold text-primary text-sm">{localRetirementAge}</span>
            </div>
            <Slider
              min={40}
              max={75}
              step={1}
              value={localRetirementAge}
              ticks={[40, 55, 75]}
              onChange={(val) => setLocalRetirementAge(Math.round(val))}
              onRelease={(val) => onUpdatePlan({ retirementAge: Math.round(val) })}
              ariaLabel="Primary Retirement Age"
            />
          </div>

          {/* Spouse Retirement Age Slider */}
          {Boolean(plan?.hasSpouse || plan?.filingStatus === 'married_joint') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">{plan?.spouseName || 'Spouse'} Retirement</span>
                <span className="font-mono font-bold text-primary text-sm">{localSpouseRetirementAge}</span>
              </div>
              <Slider
                min={40}
                max={75}
                step={1}
                value={localSpouseRetirementAge}
                ticks={[40, 55, 75]}
                onChange={(val) => setLocalSpouseRetirementAge(Math.round(val))}
                onRelease={(val) => onUpdatePlan({ spouseRetirementAge: Math.round(val) })}
                ariaLabel="Spouse Retirement Age"
              />
            </div>
          )}

          {/* Expected Return Rate Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Expected Annual Return</span>
              <span className="font-mono font-bold text-primary text-sm">{localReturnRate > 0 ? `+${localReturnRate}%` : `${localReturnRate}%`}</span>
            </div>
            <Slider
              min={1}
              max={12}
              step={0.5}
              value={localReturnRate}
              ticks={[{ value: 1, label: '1%' }, { value: 6, label: '6%' }, { value: 12, label: '12%' }]}
              onChange={(val) => setLocalReturnRate(val)}
              ariaLabel="Expected Annual Return Rate"
            />
          </div>

          {/* Inflation Rate Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Inflation Rate</span>
              <span className="font-mono font-bold text-primary text-sm">{formatPlainPercent(localInflationRate)}</span>
            </div>
            <Slider
              min={1.0}
              max={6.0}
              step={0.25}
              value={localInflationRate}
              ticks={[{ value: 1.0, label: '1.0%' }, { value: 3.0, label: '3.0%' }, { value: 6.0, label: '6.0%' }]}
              onChange={(val) => setLocalInflationRate(val)}
              ariaLabel="Inflation Rate"
            />
          </div>

          {/* Annual Expenses Modifier Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Expense Adjustment</span>
              <span className="font-mono font-bold text-primary text-sm">{localExpenseModifier > 0 ? `+${localExpenseModifier}%` : `${localExpenseModifier}%`}</span>
            </div>
            <Slider
              min={-30}
              max={30}
              step={5}
              value={localExpenseModifier}
              ticks={[{ value: -30, label: '-30%' }, { value: 0, label: '0%' }, { value: 30, label: '+30%' }]}
              onChange={(val) => setLocalExpenseModifier(Math.round(val))}
              ariaLabel="Expense Adjustment Percentage"
            />
          </div>
        </div>
          </div>
        )}
      </div>
  );
}
