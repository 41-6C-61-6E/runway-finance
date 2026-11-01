'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import type { PageContext } from '@/lib/advice/router';

export interface SuggestionChip {
  label: string;
  question: string;
  packs?: Array<{ id: string; params?: unknown }>;
}

export interface AdviceSuggestionsProps {
  page?: PageContext;
  onSelectSuggestion: (question: string, packs?: Array<{ id: string; params?: unknown }>) => void;
}

export type AskSuggestionsProps = AdviceSuggestionsProps;

export function AdviceSuggestions({ page, onSelectSuggestion }: AdviceSuggestionsProps) {
  const path = page?.path ? page.path.split('?')[0].toLowerCase() : '/';

  let suggestions: SuggestionChip[] = [];

  switch (path) {
    case '/plans':
      suggestions = [
        {
          label: 'Am I on track?',
          question: 'Am I on track with my retirement plan living expenses and savings assumptions?',
          packs: [{ id: 'plan_vs_actual', params: { planId: page?.planId } }],
        },
        {
          label: 'Retire 3 years earlier',
          question: 'What if I retire 3 years earlier? Run a what-if scenario comparison.',
          packs: [{ id: 'fire_plan', params: { planId: page?.planId } }],
        },
        {
          label: 'Plan success probability',
          question: 'How likely is my retirement plan to succeed under market uncertainty?',
          packs: [{ id: 'fire_monte_carlo', params: { planId: page?.planId } }],
        },
        {
          label: 'Explain withdrawal strategy',
          question: 'Explain my withdrawal order across taxable, tax-deferred, and Roth accounts.',
          packs: [{ id: 'fire_plan', params: { planId: page?.planId } }],
        },
      ];
      break;

    case '/spending':
      suggestions = [
        {
          label: 'Top spending categories',
          question: 'Where did most of my money go recently across my expense categories?',
          packs: [{ id: 'category_spending' }],
        },
        {
          label: 'Recent spending spikes',
          question: 'Which of my expense categories saw the biggest spending increases recently?',
          packs: [{ id: 'category_trends' }],
        },
        {
          label: 'Recurring subscriptions',
          question: 'What recurring subscriptions and fixed bills am I paying monthly?',
          packs: [{ id: 'recurring' }],
        },
      ];
      break;

    case '/budgets':
      suggestions = [
        {
          label: 'Over-budget categories',
          question: 'Which categories went over budget this month?',
          packs: [{ id: 'budgets', params: { month: page?.month } }],
        },
        {
          label: 'Total budget variance',
          question: 'How does my total actual spending compare to my monthly budget limit?',
          packs: [{ id: 'budgets', params: { month: page?.month } }],
        },
      ];
      break;

    case '/goals':
      suggestions = [
        {
          label: 'Goal target dates',
          question: 'When are my active savings goals projected to be fully funded?',
          packs: [{ id: 'goals' }],
        },
        {
          label: 'Overall funding progress',
          question: 'How much progress have I made toward all my savings goals combined?',
          packs: [{ id: 'goals' }],
        },
      ];
      break;

    case '/investments':
      suggestions = [
        {
          label: 'Portfolio allocation',
          question: 'What is my overall investment asset allocation across account types?',
          packs: [{ id: 'investments' }],
        },
        {
          label: 'Top holdings %',
          question: 'What are my top stock and ETF ticker holdings by percentage of my portfolio?',
          packs: [{ id: 'investments' }],
        },
      ];
      break;

    default:
      suggestions = [
        {
          label: 'Net worth trend',
          question: 'How has my net worth changed over the past year?',
          packs: [{ id: 'net_worth_history', params: { months: 12 } }],
        },
        {
          label: 'Average monthly savings',
          question: 'What was my average monthly savings rate and cash flow surplus over the last 12 months?',
          packs: [{ id: 'cash_flow_monthly', params: { months: 12 } }],
        },
        {
          label: 'Retirement readiness',
          question: 'Based on my current investable assets and expenses, how close am I to my FI target?',
          packs: [{ id: 'fire_plan' }],
        },
        {
          label: 'Fixed obligations',
          question: 'How much of my income goes toward fixed recurring obligations and subscriptions?',
          packs: [{ id: 'recurring' }],
        },
      ];
      break;
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium px-1">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span>Suggested questions:</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            id={`advice-suggestion-${idx}`}
            onClick={() => onSelectSuggestion(s.question, s.packs)}
            className="text-left text-xs px-2.5 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-secondary-foreground border border-border/40 hover:border-border transition-colors font-medium shadow-2xs hover:shadow-xs"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const AskSuggestions = AdviceSuggestions;
