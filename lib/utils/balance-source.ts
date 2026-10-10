/**
 * Balance source selection for bank-synced accounts.
 *
 * Aggregators (SimpleFIN/MX, Plaid) can report two balances per account:
 *   - current   — the ledger/posted balance
 *   - available — what the bank says is spendable right now (typically the
 *                 ledger balance minus pending debits / holds)
 *
 * Each connection chooses which one becomes the account's effective `balance`
 * (the value used by net worth, alerts, snapshots, etc.). Both raw values are
 * also stored on the account so switching does not require a re-sync.
 */

export const BALANCE_SOURCES = ['current', 'available'] as const;
export type BalanceSource = (typeof BALANCE_SOURCES)[number];
export const DEFAULT_BALANCE_SOURCE: BalanceSource = 'current';

export function isBalanceSource(value: unknown): value is BalanceSource {
  return typeof value === 'string' && (BALANCE_SOURCES as readonly string[]).includes(value);
}

/**
 * Account types where "available balance" means spendable cash.
 *
 * Deliberately excluded:
 *   - credit / loans: providers report *available credit* (limit − balance),
 *     which is not a pending-adjusted balance and would corrupt net worth.
 *   - investments: "available" is buying power / cash sweep, not account value.
 *   - other: SimpleFIN infers 'other' for any unrecognised account name, which
 *     frequently includes credit cards — too risky to swap automatically.
 */
export const AVAILABLE_BALANCE_ELIGIBLE_TYPES = ['checking', 'savings', 'hsachecking'] as const;

export function supportsAvailableBalance(accountType: string | null | undefined): boolean {
  if (!accountType) return false;
  return (AVAILABLE_BALANCE_ELIGIBLE_TYPES as readonly string[]).includes(accountType.toLowerCase());
}

/** Parse a provider-reported balance. Returns null for missing / non-numeric values. */
export function parseProviderBalance(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pick the effective balance for a synced account.
 *
 * Falls back to the current balance when the connection prefers `current`, the
 * account type is not eligible, or the provider did not report an available
 * balance (SimpleFIN omits `available-balance` when it equals `balance`).
 */
export function resolveEffectiveBalance(params: {
  current: number;
  available: number | null;
  accountType: string | null | undefined;
  source: string | null | undefined;
}): { value: number; usedAvailable: boolean } {
  const { current, available, accountType, source } = params;
  if (source === 'available' && available !== null && supportsAvailableBalance(accountType)) {
    return { value: available, usedAvailable: true };
  }
  return { value: current, usedAvailable: false };
}
