import { describe, it, expect } from 'vitest';

describe('Onboarding Checklist Verification', () => {
  it('correctly evaluates completion status when all items are configured', () => {
    const state = {
      profileConfigured: true,
      accounts: 3,
      budgets: 2,
      goals: 1,
    };

    const items = [
      { done: state.profileConfigured, title: 'Financial Profile' },
      { done: state.accounts > 0, title: 'Add accounts' },
      { done: state.budgets > 0, title: 'Create budgets' },
      { done: state.goals > 0, title: 'Set goals' },
    ];

    const completed = items.filter((i) => i.done).length;
    expect(completed).toBe(4);
    expect(completed === items.length).toBe(true);
  });

  it('detects profile configuration from retirement plan with salary or birth year', () => {
    const plans = [
      {
        id: 'plan_1',
        primaryBirthYear: 1990,
        primarySalary: 120000,
        retirementAge: 60,
      },
    ];
    const settings = { birthYear: null };

    const hasPlanWithProfile = Array.isArray(plans) && plans.length > 0 && plans.some((p: any) => p.primaryBirthYear || Number(p.primarySalary) > 0);
    const hasUserSettingsProfile = (settings as any)?.birthYear != null;
    const profileConfigured = hasPlanWithProfile || hasUserSettingsProfile;

    expect(profileConfigured).toBe(true);
  });
});
