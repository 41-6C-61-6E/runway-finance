import type { PlanData } from '../details/types';
import React from 'react';
import {
  Palmtree,
  Users,
  Award,
  Clock,
  ShieldCheck,
  Landmark,
  Flag,
  LucideIcon,
} from 'lucide-react';

export interface MilestoneCallout {
  age: number;
  title: string;
  year: number;
  icon: LucideIcon;
  emoji: string;
  color: string;
  stroke: string;
  note: string;
}

export interface BuildMilestoneOptions {
  birthYear: number;
  localRetirementAge: number;
  localSpouseRetirementAge: number;
  currentAge: number;
  plan: PlanData;
}

export function buildMilestoneCallouts({
  birthYear,
  localRetirementAge,
  localSpouseRetirementAge,
  currentAge,
  plan,
}: BuildMilestoneOptions): MilestoneCallout[] {
  const list: MilestoneCallout[] = [
    {
      age: localRetirementAge,
      title: 'Primary Retirement',
      year: birthYear + localRetirementAge,
      icon: Palmtree,
      emoji: '🌴',
      color: 'text-emerald-500',
      stroke: '#10b981',
      note: 'Primary career end • Distribution phase begins',
    },
    ...(Boolean(plan?.hasSpouse || plan?.filingStatus === 'married_joint')
      ? [
          {
            age: localSpouseRetirementAge,
            title: `${plan?.spouseName || 'Spouse'} Retirement`,
            year: (plan?.spouseBirthYear ? Number(plan.spouseBirthYear) : birthYear) + localSpouseRetirementAge,
            icon: Users,
            emoji: '👥',
            color: 'text-indigo-500',
            stroke: '#6366f1',
            note: `${plan?.spouseName || 'Spouse'} target career end`,
          },
        ]
      : []),
    {
      age: 50,
      title: 'Catch-up Limits',
      year: birthYear + 50,
      icon: Award,
      emoji: '💡',
      color: 'text-blue-500',
      stroke: '#3b82f6',
      note: 'IRA +$1k & 401(k) +$7.5k annual catch-up limits unlocked',
    },
    {
      age: 55,
      title: 'Rule of 55 Access',
      year: birthYear + 55,
      icon: Clock,
      emoji: '⏳',
      color: 'text-amber-500',
      stroke: '#f59e0b',
      note: 'Penalty-free 401(k) separations allowed if separated from service',
    },
    {
      age: 65,
      title: 'Medicare Eligibility',
      year: birthYear + 65,
      icon: ShieldCheck,
      emoji: '🛡️',
      color: 'text-purple-500',
      stroke: '#a855f7',
      note: 'Transition to Medicare Part B/D • ACA subsidies end',
    },
    {
      age: 67,
      title: 'Full Social Security',
      year: birthYear + 67,
      icon: Landmark,
      emoji: '🏛️',
      color: 'text-cyan-500',
      stroke: '#06b6d4',
      note: '100% Full Retirement Age SS benefit payout',
    },
    {
      age: 73,
      title: 'RMD Mandatory Start',
      year: birthYear + 73,
      icon: Flag,
      emoji: '🚩',
      color: 'text-rose-500',
      stroke: '#f43f5e',
      note: 'Required Minimum Distributions start for tax-deferred accounts',
    },
  ];

  return list
    .filter((m) => m.age >= currentAge && m.age <= (plan?.lifeExpectancyAge || 100))
    .sort((a, b) => a.age - b.age);
}
