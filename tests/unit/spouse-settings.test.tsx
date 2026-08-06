// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsTab } from '@/components/plans/settings-tab';

// Mock Lucide icons & components used in SettingsTab
vi.mock('@/lib/hooks/use-card-collapsed', () => ({
  useCardCollapsed: () => [false, vi.fn()],
}));

describe('SettingsTab - Spouse Profile Isolation', () => {
  const mockPlan = {
    id: 'plan_test_1',
    name: 'Test Plan',
    filingStatus: 'married_joint',
    hasSpouse: true,
    primaryBirthYear: 1985,
    retirementAge: 60,
    lifeExpectancyAge: 100,
    primarySalary: '120000',
    primarySalaryYear: 2026,
    primarySalaryRaisePct: '3.0',
    primarySalaryOverrides: {},

    spouseName: 'Jane Doe',
    spouseBirthYear: 1988,
    spouseRetirementAge: 58,
    spouseLifeExpectancyAge: 95,
    spouseSalary: '85000',
    spouseSalaryYear: 2026,
    spouseSalaryRaisePct: '2.5',
    spouseSalaryOverrides: {},

    primarySsMonthlyAmount: '2500',
    primarySsStartAge: 67,
    spouseSsMonthlyAmount: '2000',
    spouseSsStartAge: 67,
    enableSpousalSsBenefit: true,

    settings: {
      withdrawalMethod: 'textbook',
      fixedInflationRate: '3.0',
    },
    accounts: [],
    events: [],
  };

  it('renders spouse profile input fields separately from primary profile', () => {
    const onUpdatePlan = vi.fn();
    render(<SettingsTab plan={mockPlan} onUpdatePlan={onUpdatePlan} />);

    // Click 'Milestones & Profile' sub-tab to navigate to profile fields
    const milestonesTab = screen.getByText('Milestones & Profile');
    fireEvent.click(milestonesTab);

    // Partner profile fields should display initial values from spouse properties
    const spouseNameInput = screen.getByDisplayValue('Jane Doe') as HTMLInputElement;
    expect(spouseNameInput).toBeDefined();

    const spouseBirthYearInput = screen.getByDisplayValue('1988') as HTMLInputElement;
    expect(spouseBirthYearInput).toBeDefined();

    const spouseRetirementAgeInput = screen.getByDisplayValue('58') as HTMLInputElement;
    expect(spouseRetirementAgeInput).toBeDefined();

    const spouseLifeExpectancyInput = screen.getByDisplayValue('95') as HTMLInputElement;
    expect(spouseLifeExpectancyInput).toBeDefined();

    const spouseSalaryInput = screen.getByDisplayValue('85000') as HTMLInputElement;
    expect(spouseSalaryInput).toBeDefined();
  });

  it('triggers onUpdatePlan with spouse keys when updating spouse fields', () => {
    const onUpdatePlan = vi.fn();
    render(<SettingsTab plan={mockPlan} onUpdatePlan={onUpdatePlan} />);

    // Click 'Milestones & Profile' sub-tab to navigate to profile fields
    const milestonesTab = screen.getByText('Milestones & Profile');
    fireEvent.click(milestonesTab);

    const spouseNameInput = screen.getByDisplayValue('Jane Doe');
    fireEvent.change(spouseNameInput, { target: { value: 'Alex' } });
    expect(onUpdatePlan).toHaveBeenCalledWith({ spouseName: 'Alex' });

    const spouseSalaryInput = screen.getByDisplayValue('85000');
    fireEvent.change(spouseSalaryInput, { target: { value: '95000' } });
    fireEvent.blur(spouseSalaryInput);
    expect(onUpdatePlan).toHaveBeenCalledWith({ spouseSalary: '95000' });
  });
});
