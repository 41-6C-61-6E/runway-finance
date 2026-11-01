'use client';

import React from 'react';
import { Select } from '@/components/ui/select';

interface StepProfileProps {
  name: string;
  setName: (val: string) => void;
  filingStatus: 'single' | 'married_joint' | 'married_separate' | 'head_of_household';
  handleFilingStatusChange: (status: 'single' | 'married_joint' | 'married_separate' | 'head_of_household') => void;
  hasSpouse: boolean;
  setHasSpouse: (val: boolean) => void;
  primaryBirthYear: number | '';
  setPrimaryBirthYear: (val: number | '') => void;
  retirementAge: number | '';
  setRetirementAge: (val: number | '') => void;
  lifeExpectancyAge: number | '';
  setLifeExpectancyAge: (val: number | '') => void;
  primarySalary: number | '';
  handlePrimarySalaryChange: (val: number | '') => void;
  primarySalaryRaisePct: string;
  setPrimarySalaryRaisePct: (val: string) => void;
  isDefault: boolean;
  setIsDefault: (val: boolean) => void;
}

export function StepProfile({
  name,
  setName,
  filingStatus,
  handleFilingStatusChange,
  hasSpouse,
  setHasSpouse,
  primaryBirthYear,
  setPrimaryBirthYear,
  retirementAge,
  setRetirementAge,
  lifeExpectancyAge,
  setLifeExpectancyAge,
  primarySalary,
  handlePrimarySalaryChange,
  primarySalaryRaisePct,
  setPrimarySalaryRaisePct,
  isDefault,
  setIsDefault,
}: StepProfileProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground">Plan Name</label>
          <input
            type="text"
            required
            placeholder="e.g. Default Baseline Plan, Early FIRE at 50, Conservative"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Tax Filing Status</label>
          <Select
            value={filingStatus}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              handleFilingStatusChange(e.target.value as StepProfileProps['filingStatus'])
            }
            className="rounded-xl bg-muted/40 text-xs font-bold"
          >
            <option value="single">Single</option>
            <option value="married_joint">Married Filing Jointly (MFJ)</option>
            <option value="married_separate">Married Filing Separately</option>
            <option value="head_of_household">Head of Household</option>
          </Select>
        </div>

        <div className="space-y-1.5 flex items-center justify-between bg-muted/20 border border-border rounded-xl px-4 py-2 mt-auto">
          <div>
            <span className="text-xs font-semibold text-foreground block">Partner / Spouse Plan</span>
            <span className="text-[11px] text-muted-foreground">Include partner timelines & benefits</span>
          </div>
          <input
            type="checkbox"
            checked={hasSpouse}
            onChange={(e) => setHasSpouse(e.target.checked)}
            className="w-4 h-4 accent-primary rounded cursor-pointer"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Primary Birth Year</label>
          <input
            type="number"
            required
            min={1940}
            max={2010}
            value={primaryBirthYear}
            onChange={(e) => setPrimaryBirthYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Target Retirement Age</label>
          <input
            type="number"
            required
            min={30}
            max={80}
            value={retirementAge}
            onChange={(e) => setRetirementAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Life Expectancy Age</label>
          <input
            type="number"
            required
            min={65}
            max={110}
            value={lifeExpectancyAge}
            onChange={(e) => setLifeExpectancyAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Gross Annual Salary ($)</label>
          <input
            type="number"
            min={0}
            step={1000}
            placeholder="e.g. 120000"
            value={primarySalary === 0 ? '' : primarySalary}
            onChange={(e) => handlePrimarySalaryChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Yearly Salary Raise (%)</label>
          <input
            type="number"
            step={0.1}
            min={0}
            placeholder="e.g. 3.0"
            value={primarySalaryRaisePct || ''}
            onChange={(e) => setPrimarySalaryRaisePct(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-xl p-3 text-xs text-muted-foreground">
        <input
          type="checkbox"
          id="isDefaultCheck"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
        />
        <label htmlFor="isDefaultCheck" className="cursor-pointer font-medium text-foreground">
          Set as Default Baseline Plan (Primary plan used to pre-populate future scenarios)
        </label>
      </div>
    </div>
  );
}
