// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiSuggestionsModal from '@/components/features/ai/AiSuggestionsModal';

describe('Simplified AiSuggestionsModal', () => {
  const mockCategories = [
    { id: 'cat-1', name: 'Housing', isIncome: false, parentId: null, color: '#3b82f6' },
    { id: 'cat-2', name: 'Rent', isIncome: false, parentId: 'cat-1', color: '#3b82f6' },
    { id: 'cat-3', name: 'Food & Dining', isIncome: false, parentId: null, color: '#ef4444' },
    { id: 'cat-4', name: 'Restaurants', isIncome: false, parentId: 'cat-3', color: '#ef4444' },
  ];

  const mockProposals = [
    {
      id: 'prop-1',
      type: 'categorize',
      status: 'pending',
      confidence: '95',
      payload: {
        transactionId: 'tx-1',
        proposedCategoryId: 'cat-2',
        proposedCategoryName: 'Rent',
      },
      explanation: 'Matches previous rental payments',
      createdAt: new Date().toISOString(),
      transactionDetails: {
        payee: 'Apartment Leasing Co',
        date: '2026-10-15',
        amount: '-1500.00',
        accountName: 'Checking',
      },
    },
    {
      id: 'prop-2',
      type: 'create_rule',
      status: 'pending',
      confidence: '85',
      payload: {
        ruleName: 'Auto-rule: Restaurants',
        conditionField: 'description',
        conditionOperator: 'contains',
        conditionValue: 'CAFE',
        setCategoryId: 'cat-4',
        setCategoryName: 'Restaurants',
      },
      explanation: 'Cafe visits are dining expenses',
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/ai/proposals')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProposals),
        } as any);
      }
      if (urlStr.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        } as any);
      }
      if (urlStr.includes('/api/user-settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ aiBatchSize: 25 }),
        } as any);
      }
      if (urlStr.includes('/api/ai/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'idle' }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any);
    }) as any;
  });

  it('renders simplified header and does not render key hints, history tabs, or approve all button', async () => {
    render(<AiSuggestionsModal open={true} onOpenChange={vi.fn()} />);

    // Header title and count
    await waitFor(() => {
      expect(screen.getByText('AI Suggestions')).toBeInTheDocument();
      expect(screen.getByText('2 pending')).toBeInTheDocument();
    });

    // Verify removed elements:
    expect(screen.queryByText(/History/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Approve High-Confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tip: Press/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); // No batch checkboxes
  });

  it('renders proposals with inline category pill containing dropdown arrow', async () => {
    render(<AiSuggestionsModal open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Apartment Leasing Co')).toBeInTheDocument();
      expect(screen.getByText('Rent')).toBeInTheDocument();
      expect(screen.getByText('Restaurants')).toBeInTheDocument();
    });

    // Category pills have title "Click to change category"
    const categoryPills = screen.getAllByTitle('Click to change category');
    expect(categoryPills.length).toBe(2);
  });

  it('opens category dropdown on pill click and allows changing category inline', async () => {
    render(<AiSuggestionsModal open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument();
    });

    const rentPill = screen.getAllByTitle('Click to change category')[0];
    fireEvent.click(rentPill);

    // Dropdown should be open with search input, "+ Create new category", and category hierarchy
    expect(screen.getByPlaceholderText('Search categories...')).toBeInTheDocument();
    expect(screen.getByText('+ Create new category')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Housing$/i })).toBeInTheDocument();
    });

    // Select "Housing" parent button from dropdown
    const housingOption = screen.getByRole('button', { name: /^Housing$/i });
    fireEvent.click(housingOption);

    // First card should now display "Housing" instead of "Rent"
    await waitFor(() => {
      const pills = screen.getAllByTitle('Click to change category');
      expect(pills[0]).toHaveTextContent('Housing');
    });
  });

  it('approves a proposal with the modified category', async () => {
    const onProposalsUpdated = vi.fn();
    render(<AiSuggestionsModal open={true} onOpenChange={vi.fn()} onProposalsUpdated={onProposalsUpdated} />);

    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument();
    });

    // Change category to Housing first
    const rentPill = screen.getAllByTitle('Click to change category')[0];
    fireEvent.click(rentPill);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Housing$/i })).toBeInTheDocument();
    });

    const housingOption = screen.getByRole('button', { name: /^Housing$/i });
    fireEvent.click(housingOption);

    // Click Approve on the first card
    const approveButtons = screen.getAllByRole('button', { name: /Approve/i });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      const approveCall = (global.fetch as any).mock.calls.find((c: any) =>
        c[0].includes('/api/ai/proposals/prop-1/approve')
      );
      expect(approveCall).toBeDefined();
      expect(JSON.parse(approveCall[1].body)).toEqual({
        payload: expect.objectContaining({
          proposedCategoryId: 'cat-1',
          proposedCategoryName: 'Housing',
        }),
      });
    });
  });
});
