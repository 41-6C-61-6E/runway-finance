'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';

export function EnginePipelineDiagram() {
  const steps = [
    {
      step: 'Phase 1',
      title: 'Gross Income & FICA',
      desc: 'Sum salary, passive income, pension, & SS. Compute 7.65% payroll taxes.',
      color: 'bg-muted/20 border-border hover:border-blue-500/40',
    },
    {
      step: 'Phase 2',
      title: 'Pre-Tax Savings Waterfall',
      desc: 'Route employer match, HSA, & 401(k) pre-tax contributions before income tax.',
      color: 'bg-muted/20 border-border hover:border-emerald-500/40',
    },
    {
      step: 'Phase 3',
      title: 'Tax Base & Provisional SS',
      desc: 'Subtract standard deduction; compute SS provisional income (50%/85% tiers).',
      color: 'bg-muted/20 border-border hover:border-purple-500/40',
    },
    {
      step: 'Phase 4',
      title: 'SECURE Act RMD Draw & Offset',
      desc: 'Enforce mandatory RMDs at age 73+; proceeds cover retirement living expenses first.',
      color: 'bg-muted/20 border-border hover:border-indigo-500/40',
    },
    {
      step: 'Phase 5',
      title: 'Deficit Drawdown / RMD Sweep',
      desc: 'Draw remaining deficit via strategy, or sweep excess RMDs above expenses to specified account.',
      color: 'bg-muted/20 border-border hover:border-amber-500/40',
    },
    {
      step: 'Phase 6',
      title: 'Roth Conversion Ladder',
      desc: 'Convert pre-tax to Roth up to target tax bracket, capping at IRMAA cliff if enabled.',
      color: 'bg-muted/20 border-border hover:border-pink-500/40',
    },
    {
      step: 'Phase 7',
      title: 'Tax Stack & 3.8% NIIT',
      desc: 'Reconcile Ordinary Tax, CapGains, State Tax, NIIT surcharge, & early penalties.',
      color: 'bg-muted/20 border-border hover:border-rose-500/40',
    },
    {
      step: 'Phase 8',
      title: 'IRMAA Lag & ACA Subsidy',
      desc: 'Compute MAGI; queue Year Y+2 Medicare surcharge and calculate ACA subsidy.',
      color: 'bg-muted/20 border-border hover:border-cyan-500/40',
    },
    {
      step: 'Phase 9',
      title: 'Asset Growth & Yield',
      desc: 'Accrue stock/bond asset growth & dividend yield, update balances & cost basis for Year Y+1.',
      color: 'bg-muted/20 border-border hover:border-teal-500/40',
    },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
      <div className="border-b border-border pb-3">
        <h4 className="text-base font-bold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-500" />
          Annual Engine Execution Pipeline (9-Phase Projection Loop)
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sequential calculation pipeline executed on each year of the simulation:
        </p>
      </div>

      <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 gap-3 text-xs">
        {steps.map((item, idx) => (
          <div key={idx} className={`p-3.5 rounded-xl border transition-all ${item.color} space-y-1`}>
            <div className="flex items-center justify-between">
              <SectionHeading label>
                {item.step}
              </SectionHeading>
              <span className="text-[10px] font-bold text-foreground bg-background px-1.5 py-0.5 rounded border">
                Step {idx + 1}
              </span>
            </div>
            <h5 className="font-bold text-foreground text-xs">{item.title}</h5>
            <p className="text-[11px] text-muted-foreground leading-snug">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

