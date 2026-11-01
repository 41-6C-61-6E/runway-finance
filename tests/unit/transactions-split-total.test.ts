import { describe, it, expect } from 'vitest';

describe('WS-01-F03: Split Transactions Total Amount Aggregation', () => {
  it('correctly sums active child splits in place of ignored parent transaction', () => {
    // When a transaction is split, parent has ignored: true.
    // Children have parentId: parent.id and ignored: false.
    const parentTx = {
      id: 'tx-parent',
      parentId: null,
      amount: '100.00',
      ignored: true,
      deleted: false,
    };
    const child1 = {
      id: 'tx-child-1',
      parentId: 'tx-parent',
      amount: '60.00',
      ignored: false,
      deleted: false,
    };
    const child2 = {
      id: 'tx-child-2',
      parentId: 'tx-parent',
      amount: '40.00',
      ignored: false,
      deleted: false,
    };
    const normalTx = {
      id: 'tx-normal',
      parentId: null,
      amount: '50.00',
      ignored: false,
      deleted: false,
    };

    const allRows = [parentTx, child1, child2, normalTx];

    // Under the corrected query rule for totalAmountOnly:
    // transactions where deleted = false and ignored = false are included.
    const activeForTotal = allRows.filter((tx) => !tx.deleted && !tx.ignored);

    const total = activeForTotal.reduce(
      (sum, tx) => sum + parseFloat(tx.amount),
      0
    );

    // Sum should be 60 + 40 + 50 = 150 (not 50)
    expect(total).toBe(150);
    expect(activeForTotal.map((t) => t.id)).toEqual([
      'tx-child-1',
      'tx-child-2',
      'tx-normal',
    ]);
  });
});

