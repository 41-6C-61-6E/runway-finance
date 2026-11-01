// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DataTable, { CellRenderer } from '@/components/features/data-explorer/data-table';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Privacy Mode completeness and blur-number coverage (WS-09-F03)', () => {
  it('applies blur-number to numeric cells formatted by CellRenderer in DataTable', () => {
    const { container } = render(
      <CellRenderer value={12345.67} type="number" field="balance" />
    );

    const span = container.querySelector('.blur-number');
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe('12,345.67');
  });

  it('renders numeric cells with blur-number class inside rendered DataTable', () => {
    const columns = [
      { field: 'name', label: 'Name', type: 'string' as const, nullable: false },
      { field: 'balance', label: 'Balance', type: 'number' as const, nullable: false },
    ];
    const data = [
      { name: 'Checking Account', balance: 5420.5 },
    ];

    const { container } = render(
      <DataTable
        tableKey="accounts"
        columns={columns}
        data={data}
        total={1}
        offset={0}
        limit={25}
        sort="name"
        order="asc"
        filters={[]}
        search=""
        loading={false}
        onSortChange={() => {}}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        onNavigate={() => {}}
      />
    );

    const numericCells = container.querySelectorAll('td .blur-number');
    expect(numericCells.length).toBeGreaterThan(0);
    expect(numericCells[0].textContent).toContain('5,420.50');
  });
});
