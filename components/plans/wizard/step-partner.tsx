'use client';

import React from 'react';
import { Users } from 'lucide-react';

interface StepPartnerProps {
  spouseName: string;
  setSpouseName: (val: string) => void;
  spouseBirthYear: number | '';
  setSpouseBirthYear: (val: number | '') => void;
  spouseRetirementAge: number | '';
  setSpouseRetirementAge: (val: number | '') => void;
  spouseSalary: number | '';
  handleSpouseSalaryChange: (val: number | '') => void;
  spouseSalaryRaisePct: string;
  setSpouseSalaryRaisePct: (val: string) => void;
}

export function StepPartner({
  spouseName,
  setSpouseName,
  spouseBirthYear,
  setSpouseBirthYear,
  spouseRetirementAge,
  setSpouseRetirementAge,
  spouseSalary,
  handleSpouseSalaryChange,
  spouseSalaryRaisePct,
  setSpouseSalaryRaisePct,
}: StepPartnerProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary flex items-center gap-2">
        <Users className="w-4 h-4 shrink-0" />
        <span>Configure partner details for dual-retiree household projections.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted-foreground">Partner Name</label>
          <input
            type="text"
            required
            placeholder="e.g. Alex, Spouse"
            value={spouseName}
            onChange={(e) => setSpouseName(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Partner Birth Year</label>
          <input
            type="number"
            min={1940}
            max={2010}
            value={spouseBirthYear}
            onChange={(e) => setSpouseBirthYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Partner Target Retirement Age</label>
          <input
            type="number"
            min={30}
            max={80}
            value={spouseRetirementAge}
            onChange={(e) => setSpouseRetirementAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Partner Gross Annual Salary ($)</label>
          <input
            type="number"
            min={0}
            step={1000}
            placeholder="e.g. 85000"
            value={spouseSalary === 0 ? '' : spouseSalary}
            onChange={(e) => handleSpouseSalaryChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Partner Yearly Raise (%)</label>
          <input
            type="number"
            step={0.1}
            min={0}
            placeholder="e.g. 3.0"
            value={spouseSalaryRaisePct || ''}
            onChange={(e) => setSpouseSalaryRaisePct(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>
    </div>
  );
}

