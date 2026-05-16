import { logger } from '@/lib/logger';
import { Buffer } from 'node:buffer';

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
}

function base64FromBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function bytesFromBase64(b64: string): Uint8Array {
  return new Uint8Array(atob(b64).split('').map((c) => c.charCodeAt(0)));
}

function toBufferSource(data: Uint8Array): BufferSource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data as any;
}

// ── Server Recovery Key (for cron sync / password reset) ──────────────
// Loaded once at module init. Serves as a fallback to unwrap user DEKs.
export function getServerKey(): Uint8Array {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-f]+$/i.test(key)) {
    logger.error(
      '[crypto] FATAL: ENCRYPTION_KEY is missing or invalid. ' +
        'Must be a 64-character hex string. ' +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
    throw new Error('ENCRYPTION_KEY is missing or invalid');
  }
  return hexToBytes(key);
}

// ── Low-level encrypt/decrypt with explicit key ─────────────────────────

export async function encrypt(plaintext: string, key: Uint8Array): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(key),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: base64FromBytes(new Uint8Array(encrypted)),
    iv: bytesToHex(iv),
    tag: '',
  };
}

export async function decrypt({ ciphertext, iv }: EncryptedPayload, key: Uint8Array): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(key),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const ivBytes = hexToBytes(iv);
  const ciphertextBytes = bytesFromBase64(ciphertext);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toBufferSource(ivBytes) },
      cryptoKey,
      toBufferSource(ciphertextBytes),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('Decryption failed: invalid ciphertext or tampered data');
  }
}

// ── PBKDF2 key derivation ──────────────────────────────────────────────

export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toBufferSource(salt), iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

// ── Key wrapping ───────────────────────────────────────────────────────

export function generateDEK(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function wrapKey(dek: Uint8Array, kek: Uint8Array): Promise<EncryptedPayload> {
  return encrypt(bytesToHex(dek), kek);
}

export async function unwrapKey(payload: EncryptedPayload, kek: Uint8Array): Promise<Uint8Array> {
  const hex = await decrypt(payload, kek);
  return hexToBytes(hex);
}

// ── Field-level helpers (store as JSON string in TEXT column) ──────────

export async function encryptField(plaintext: string, key: Uint8Array): Promise<string> {
  const p = await encrypt(plaintext, key);
  return JSON.stringify({ ct: p.ciphertext, iv: p.iv });
}

export async function decryptField(payload: string, key: Uint8Array): Promise<string> {
  if (typeof payload !== 'string') {
    // Non-string payloads (e.g., jsonb objects from the database) should not be passed here.
    // Return empty string to signal that decryption is not applicable.
    return '';
  }
  let parsed: any;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (typeof parsed !== 'object' || !parsed?.ct || !parsed?.iv) {
    return payload;
  }
  return decrypt({ ciphertext: parsed.ct, iv: parsed.iv, tag: '' }, key);
}

// ── Row-level helpers ──────────────────────────────────────────────────

export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  transactions: ['description', 'payee', 'memo', 'notes', 'amount'],
  accounts: ['name', 'balance', 'institution', 'metadata'],
  categories: ['name'],
  category_rules: ['name', 'conditionValue', 'setPayee'],
  budgets: ['amount', 'notes'],
  financial_goals: ['name', 'description', 'targetAmount', 'currentAmount', 'percentage', 'reserve'],
  net_worth_snapshots: ['totalAssets', 'totalLiabilities', 'netWorth'],
  monthly_cash_flow: ['totalIncome', 'totalExpenses', 'netCashFlow', 'transactionCount'],
  category_spending_summary: ['amount', 'transactionCount'],
  category_income_summary: ['amount', 'transactionCount'],
  account_snapshots: ['balance'],
  retirement_projections: [
    'name', 'portfolioAtRetirement', 'expectedReturnRate', 'inflationRate',
    'annualWithdrawal', 'ssAnnual', 'pensionAnnual', 'partTimeIncome',
    'rentalIncomeAnnual', 'healthcareAnnual', 'legacyGoal',
  ],
  fire_scenarios: [
    'name', 'targetAnnualExpenses', 'currentInvestableAssets', 'annualContributions',
    'expectedReturnRate', 'inflationRate', 'safeWithdrawalRate',
  ],
  simplefin_connections: ['accessUrlEncrypted', 'accessUrlIv', 'accessUrlTag'],
  sync_logs: ['accountsSynced', 'transactionsFetched', 'transactionsNew', 'durationMs'],
  user_settings: ['apiKeys'],
};

export async function encryptRow<T extends Record<string, any>>(table: string, row: T, key: Uint8Array): Promise<T> {
  const fields = ENCRYPTED_FIELDS[table];
  if (!fields) return row;
  const result: any = { ...row };
  for (const field of fields) {
    const val = result[field];
    if (val != null && val !== '') {
      result[field] = await encryptField(typeof val === 'object' ? JSON.stringify(val) : String(val), key);
    }
  }
  return result as T;
}

export async function decryptRow<T extends Record<string, any>>(table: string, row: T, key: Uint8Array): Promise<T> {
  const fields = ENCRYPTED_FIELDS[table];
  if (!fields) return row;
  const result: any = { ...row };
  for (const field of fields) {
    const val = result[field];
    if (val != null && val !== '') {
      result[field] = await decryptField(String(val), key);
    }
  }
  return result as T;
}

export async function decryptRows<T extends Record<string, any>>(table: string, rows: T[], key: Uint8Array): Promise<T[]> {
  const fields = ENCRYPTED_FIELDS[table];
  if (!fields) return rows;
  return Promise.all(rows.map((row) => decryptRow(table, row, key)));
}
