import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { AVAILABLE_BALANCE_ELIGIBLE_TYPES, type BalanceSource } from '@/lib/utils/balance-source';

/**
 * Re-derive the effective `balance` of every account under a connection from
 * the raw provider balances captured at the last sync, so a balance-source
 * change takes effect immediately without a (rate-limited / billed) re-sync.
 *
 * Field encryption has no per-column associated data, so the encrypted
 * `current_balance` / `available_balance` envelopes can be copied into
 * `balance` directly without decrypting. Accounts synced before these columns
 * existed (both null) are left untouched until their next sync.
 *
 * Returns the number of accounts updated.
 */
export async function applyBalanceSourceToConnection(params: {
  connectionId: string;
  provider: 'simplefin' | 'plaid';
  source: BalanceSource;
}): Promise<number> {
  const { connectionId, provider, source } = params;
  const connectionColumn = provider === 'simplefin' ? accounts.connectionId : accounts.plaidConnectionId;
  const now = new Date();

  // Always restore the current balance first. This covers switching back to
  // 'current', and makes ineligible account types (credit, loans, investments)
  // correct regardless of the previous setting.
  const restored = await getDb()
    .update(accounts)
    .set({ balance: sql`${accounts.currentBalance}`, updatedAt: now })
    .where(and(eq(connectionColumn, connectionId), isNotNull(accounts.currentBalance)))
    .returning({ id: accounts.id });

  if (source !== 'available') {
    return restored.length;
  }

  // Swap in the available balance for eligible cash accounts that reported one.
  // (SimpleFIN omits `available-balance` when it equals `balance`, in which case
  // the current balance written above is already correct.)
  const swapped = await getDb()
    .update(accounts)
    .set({ balance: sql`${accounts.availableBalance}`, updatedAt: now })
    .where(
      and(
        eq(connectionColumn, connectionId),
        isNotNull(accounts.availableBalance),
        inArray(sql`lower(${accounts.type})`, [...AVAILABLE_BALANCE_ELIGIBLE_TYPES]),
      ),
    )
    .returning({ id: accounts.id });

  const touched = new Set([...restored.map((r) => r.id), ...swapped.map((r) => r.id)]);
  return touched.size;
}
