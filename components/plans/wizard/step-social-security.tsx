'use client';

import React from 'react';
import { HeartHandshake, Users, Flame } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import {
  calculateSocialSecurityPIA,
  calculateAdjustedSsBenefit,
} from '@/lib/utils/social-security';

interface StepSocialSecurityProps {
  primarySalary: number | '';
  primarySsMonthlyAmount: number | '';
  setPrimarySsMonthlyAmount: (val: number | '') => void;
  primarySsStartAge: number | '';
  setPrimarySsStartAge: (val: number | '') => void;
  hasSpouse: boolean;
  spouseName: string;
  spouseSalary: number | '';
  spouseSsMonthlyAmount: number | '';
  setSpouseSsMonthlyAmount: (val: number | '') => void;
  spouseSsStartAge: number | '';
  setSpouseSsStartAge: (val: number | '') => void;
  enableSpousalSsBenefit: boolean;
  setEnableSpousalSsBenefit: (val: boolean) => void;
  fiTargetMultiplier: number | '';
  setFiTargetMultiplier: (val: number | '') => void;
  retirementAge: number | '';
  livingExpenseAmount: number | '';
  withdrawalMethod: string;
}

export function StepSocialSecurity({
  primarySalary,
  primarySsMonthlyAmount,
  primarySsStartAge,
  setPrimarySsStartAge,
  hasSpouse,
  spouseName,
  spouseSalary,
  spouseSsMonthlyAmount,
  spouseSsStartAge,
  setSpouseSsStartAge,
  enableSpousalSsBenefit,
  setEnableSpousalSsBenefit,
  fiTargetMultiplier,
  setFiTargetMultiplier,
  retirementAge,
  livingExpenseAmount,
  withdrawalMethod,
}: StepSocialSecurityProps) {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Primary Social Security Planning Card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div>
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <HeartHandshake className="w-4 h-4 text-emerald-500" />
              Primary Person Social Security Planning
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              PIA at Full Retirement Age (67):{' '}
              <span className="font-mono font-bold text-foreground">
                {formatCurrency(
                  calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500)
                )}
                /mo
              </span>{' '}
              (from {formatCurrency(Number(primarySalary || 0))}/yr salary)
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Claiming Strategy</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { age: 62, label: 'Early (Age 62)', sub: '70% FRA' },
                { age: 67, label: 'Full (Age 67)', sub: '100% FRA' },
                { age: 70, label: 'Late (Age 70)', sub: '124% FRA' },
              ].map((opt) => (
                <button
                  key={opt.age}
                  type="button"
                  onClick={() => setPrimarySsStartAge(opt.age)}
                  className={`py-2 px-2 rounded-xl text-center transition-all cursor-pointer border ${
                    Number(primarySsStartAge) === opt.age
                      ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                      : 'bg-muted/20 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-xs block font-semibold">{opt.label}</span>
                  <span className="text-[10px] opacity-80 block">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Estimated Monthly Benefit at Age {primarySsStartAge || 67}:
            </span>
            <span className="font-mono font-bold text-emerald-500">
              {formatCurrency(
                calculateAdjustedSsBenefit(
                  calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500),
                  Number(primarySsStartAge || 67)
                )
              )}
              /mo
              <span className="text-[10px] font-normal text-muted-foreground ml-1">
                (
                {formatCurrency(
                  calculateAdjustedSsBenefit(
                    calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500),
                    Number(primarySsStartAge || 67)
                  ) * 12
                )}
                /yr)
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Partner / Spouse Social Security Planning Card (Conditional) */}
      {hasSpouse && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/[0.02]">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div>
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                Partner Social Security Planning ({spouseName || 'Spouse'})
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                PIA at Full Retirement Age (67):{' '}
                <span className="font-mono font-bold text-foreground">
                  {formatCurrency(
                    calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000)
                  )}
                  /mo
                </span>{' '}
                (from {formatCurrency(Number(spouseSalary || 0))}/yr salary)
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Partner Claiming Strategy</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { age: 62, label: 'Early (Age 62)', sub: '70% FRA' },
                  { age: 67, label: 'Full (Age 67)', sub: '100% FRA' },
                  { age: 70, label: 'Late (Age 70)', sub: '124% FRA' },
                ].map((opt) => (
                  <button
                    key={opt.age}
                    type="button"
                    onClick={() => setSpouseSsStartAge(opt.age)}
                    className={`py-2 px-2 rounded-xl text-center transition-all cursor-pointer border ${
                      Number(spouseSsStartAge) === opt.age
                        ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                        : 'bg-muted/20 border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-xs block font-semibold">{opt.label}</span>
                    <span className="text-[10px] opacity-80 block">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Partner Estimated Monthly Benefit at Age {spouseSsStartAge || 67}:
              </span>
              <span className="font-mono font-bold text-primary">
                {formatCurrency(
                  calculateAdjustedSsBenefit(
                    calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000),
                    Number(spouseSsStartAge || 67)
                  )
                )}
                /mo
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  (
                  {formatCurrency(
                    calculateAdjustedSsBenefit(
                      calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000),
                      Number(spouseSsStartAge || 67)
                    ) * 12
                  )}
                  /yr)
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between bg-muted/20 border border-border rounded-xl px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-foreground block">Spousal SS Benefit Optimization</span>
                <span className="text-[10px] text-muted-foreground">
                  Ensure partner receives at least 50% of primary benefit
                </span>
              </div>
              <input
                type="checkbox"
                checked={enableSpousalSsBenefit}
                onChange={(e) => setEnableSpousalSsBenefit(e.target.checked)}
                className="w-4 h-4 accent-primary rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* FI Target Multiplier Field */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground">FI Target Multiplier</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={15}
            max={40}
            value={fiTargetMultiplier}
            onChange={(e) => setFiTargetMultiplier(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <span className="text-xs text-muted-foreground shrink-0">x Expenses</span>
        </div>
      </div>

      {/* Summary Configuration Card */}
      <div className="bg-muted/20 border border-border rounded-xl p-3.5 space-y-2.5">
        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-amber-500" />
          Plan Configuration Summary
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
          <div>
            <span className="text-muted-foreground block">Retirement Age:</span>
            <span className="font-bold text-foreground">{retirementAge || 60} years</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Living Expenses:</span>
            <span className="font-bold text-foreground">
              ${Number(livingExpenseAmount || 0).toLocaleString()}/yr
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Drawdown Strategy:</span>
            <span className="font-bold text-foreground capitalize">
              {(withdrawalMethod || 'textbook').replace(/_/g, ' ')}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Primary SS Benefit:</span>
            <span className="font-bold text-emerald-500">
              {formatCurrency(
                calculateAdjustedSsBenefit(
                  calculateSocialSecurityPIA(Number(primarySalary || 0)) || Number(primarySsMonthlyAmount || 2500),
                  Number(primarySsStartAge || 67)
                )
              )}
              /mo (Age {primarySsStartAge})
            </span>
          </div>
          {hasSpouse && (
            <div>
              <span className="text-muted-foreground block">Partner SS Benefit:</span>
              <span className="font-bold text-primary">
                {formatCurrency(
                  calculateAdjustedSsBenefit(
                    calculateSocialSecurityPIA(Number(spouseSalary || 0)) || Number(spouseSsMonthlyAmount || 2000),
                    Number(spouseSsStartAge || 67)
                  )
                )}
                /mo (Age {spouseSsStartAge})
              </span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground block">FI Target ({fiTargetMultiplier || 25}x):</span>
            <span className="font-bold text-foreground">
              ${(Number(livingExpenseAmount || 60000) * Number(fiTargetMultiplier || 25)).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
