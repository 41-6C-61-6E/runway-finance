import { logger } from '@/lib/logger';
import { Buffer } from 'node:buffer';

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

// L-8 (2026-08-27 security review): validate hex shape explicitly instead of
// relying on Buffer's silent odd-length truncation — a corrupted row's IV
// should fail loudly (at the decrypt boundary) rather than silently garble.
function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`hexToBytes: invalid hex input (length ${hex?.length ?? 'n/a'})`);
  }
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

function base64FromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function bytesFromBase64(b64: string): Uint8Array {
  try {
    return new Uint8Array(Buffer.from(b64.trim(), 'base64'));
  } catch {
    return new Uint8Array(0);
  }
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

const encryptKeyCache = new Map<string, CryptoKey>();
const decryptKeyCache = new Map<string, CryptoKey>();

export async function encrypt(plaintext: string, key: Uint8Array): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyHex = bytesToHex(key);
  let cryptoKey = encryptKeyCache.get(keyHex);
  if (!cryptoKey) {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      toBufferSource(key),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    encryptKeyCache.set(keyHex, cryptoKey);
  }
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

async function importDecryptKey(key: Uint8Array): Promise<CryptoKey> {
  const keyHex = bytesToHex(key);
  let cryptoKey = decryptKeyCache.get(keyHex);
  if (!cryptoKey) {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      toBufferSource(key),
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    decryptKeyCache.set(keyHex, cryptoKey);
  }
  return cryptoKey;
}

export async function decrypt({ ciphertext, iv }: EncryptedPayload, key: Uint8Array): Promise<string> {
  const cryptoKey = await importDecryptKey(key);
  try {
    const ivBytes = hexToBytes(iv);
    const ciphertextBytes = bytesFromBase64(ciphertext);
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

// ── File-level backup encryption ─────────────────────────────────────────
// Whole-file encryption for backup exports. The user supplies a passphrase;
// we derive a key with PBKDF2 (same parameters as the household DEK) and
// encrypt the entire backup JSON with AES-GCM. The result is a self-contained
// container that carries its own salt + ciphertext so it can be decrypted
// later with just the passphrase.

export const BACKUP_ENCRYPTION_MAGIC = 'runway-encrypted-backup';
export const BACKUP_ENCRYPTION_VERSION = 2;
export const BACKUP_KDF = 'pbkdf2-sha256';
export const BACKUP_KDF_ITERATIONS = 600_000;

export interface EncryptedBackupPayload {
  magic: string;
  version: number;
  kdf: string;
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  ct: string; // base64 AES-GCM ciphertext (tag appended by WebCrypto)
}

export async function deriveBackupKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return deriveKeyFromPassword(passphrase, salt);
}

export async function encryptBackupJson(jsonString: string, passphrase: string): Promise<EncryptedBackupPayload> {
  if (!passphrase) {
    throw new Error('A passphrase is required to encrypt the backup');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveBackupKey(passphrase, salt);
  const { ciphertext, iv } = await encrypt(jsonString, key);
  return {
    magic: BACKUP_ENCRYPTION_MAGIC,
    version: BACKUP_ENCRYPTION_VERSION,
    kdf: BACKUP_KDF,
    iterations: BACKUP_KDF_ITERATIONS,
    salt: bytesToHex(salt),
    iv,
    ct: ciphertext,
  };
}

export async function decryptBackupJson(payload: EncryptedBackupPayload, passphrase: string): Promise<string> {
  if (!passphrase) {
    throw new Error('A passphrase is required to decrypt the backup');
  }
  if (!payload || payload.magic !== BACKUP_ENCRYPTION_MAGIC) {
    throw new Error('Not an encrypted backup payload');
  }
  const salt = hexToBytes(payload.salt);
  const key = await deriveBackupKey(passphrase, salt);
  try {
    return await decrypt({ ciphertext: payload.ct, iv: payload.iv, tag: '' }, key);
  } catch {
    throw new Error('Backup decryption failed: wrong passphrase or corrupted file');
  }
}

// ── Key wrapping ───────────────────────────────────────────────────────

export function generateDEK(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function wrapKey(dek: Uint8Array, kek: Uint8Array): Promise<EncryptedPayload> {
  if (dek.length !== 32) {
    throw new Error('DEK must be exactly 32 bytes');
  }
  return encrypt(bytesToHex(dek), kek);
}

export async function unwrapKey(payload: EncryptedPayload, kek: Uint8Array): Promise<Uint8Array> {
  const hex = await decrypt(payload, kek);
  if (!hex || hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Unwrapped DEK is invalid: expected 64-character hex string (32 bytes)');
  }
  return hexToBytes(hex);
}

// ── Field-level helpers (store as JSON string in TEXT column) ──────────

const MAX_FIELD_CACHE_SIZE = 40000;
const decryptedFieldCache = new Map<string, string>();

export function clearDecryptedFieldCache(): void {
  decryptedFieldCache.clear();
}

export async function encryptField(plaintext: string, key: Uint8Array): Promise<string> {
  const p = await encrypt(plaintext, key);
  return JSON.stringify({ ct: p.ciphertext, iv: p.iv });
}

export async function decryptField(payload: string | number, key: Uint8Array): Promise<string> {
  // Convert numbers to strings (plaintext numeric values from database)
  const payloadStr = typeof payload === 'number' ? String(payload) : String(payload ?? '');

  if (!payloadStr) {
    return '';
  }

  let parsed: any;
  try {
    parsed = JSON.parse(payloadStr);
  } catch {
    // Not JSON — pre-encryption legacy plaintext value; return as-is.
    return payloadStr;
  }

  // Only the encrypted JSON envelope ({ ct, iv }) is treated as ciphertext.
  // Anything else (valid JSON that isn't our envelope) is legacy plaintext.
  if (typeof parsed !== 'object' || parsed === null || !parsed.ct || !parsed.iv) {
    return payloadStr;
  }

  const keyHex = bytesToHex(key.subarray(0, 8));
  const cacheKey = `${keyHex}:${parsed.ct}`;
  const cached = decryptedFieldCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const decrypted = await decrypt({ ciphertext: parsed.ct, iv: parsed.iv, tag: '' }, key);
    if (decryptedFieldCache.size >= MAX_FIELD_CACHE_SIZE) {
      // Evict oldest 10% of entries to keep memory bounded and avoid frequent resizing
      const iter = decryptedFieldCache.keys();
      for (let i = 0; i < MAX_FIELD_CACHE_SIZE / 10; i++) {
        const nextKey = iter.next().value;
        if (nextKey) decryptedFieldCache.delete(nextKey);
        else break;
      }
    }
    decryptedFieldCache.set(cacheKey, decrypted);
    return decrypted;
  } catch (err) {
    // M-10 (2026-08-27 security review): an ENCRYPTED value that fails to
    // decrypt (wrong key, corruption, tamper) is a hard, visible failure —
    // log it and throw so bugs don't surface as silent blank fields.
    // L-7: do NOT log the IV or any ciphertext material.
    logger.error('[crypto] Field decryption FAILED for encrypted value (wrong key or corrupted data)', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error('Encrypted field could not be decrypted (wrong key or corrupted data)');
  }
}


// ── Row-level helpers ──────────────────────────────────────────────────

export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  transactions: ['description', 'payee', 'memo', 'notes', 'amount'],
  accounts: ['name', 'balance', 'currentBalance', 'availableBalance', 'institution', 'metadata'],
  categories: ['name'],
  category_rules: ['name', 'conditionValue', 'setPayee', 'conditions'],
  tags: ['name', 'description'],
  budgets: ['amount', 'notes'],
  financial_goals: ['name', 'description', 'targetAmount', 'currentAmount', 'percentage', 'reserve'],
  goal_allocation_history: ['accountBalance', 'allocatedAmount', 'desiredAmount', 'remainingOnAccount'],
  net_worth_snapshots: ['totalAssets', 'totalLiabilities', 'netWorth'],
  monthly_cash_flow: ['totalIncome', 'totalExpenses', 'netCashFlow', 'transactionCount'],
  category_spending_summary: ['amount', 'transactionCount'],
  category_income_summary: ['amount', 'transactionCount'],
  account_snapshots: ['balance'],
  holdings: ['name', 'quantity', 'price', 'costBasis', 'value', 'tickerOverride', 'publicEquivalent'],
  holding_snapshots: ['name', 'quantity', 'price', 'value', 'costBasis'],
  import_log: ['fileContent'],

  ai_providers: ['apiKeyEncrypted'],
  simplefin_connections: ['accessUrlEncrypted', 'accessUrlIv', 'accessUrlTag'],
  plaid_connections: ['accessTokenEncrypted', 'accessTokenIv', 'accessTokenTag'],
  sync_logs: ['accountsSynced', 'transactionsFetched', 'transactionsNew', 'durationMs', 'details'],
  user_settings: ['apiKeys'],
  paystubs: ['grossPay', 'netPay', 'employerName', 'notes'],
  paystub_line_items: ['name', 'amount'],
  paystub_field_mappings: ['sourceField', 'targetField'],
  paystub_auto_generate_settings: ['employerName', 'frequency'],
  plans: ['name', 'description', 'customWithdrawalOrder'],
  plan_accounts: ['name', 'balance', 'costBasis', 'expectedGrowthRate', 'dividendYield', 'qualifiedDividendRatio'],
  plan_liabilities: ['name', 'balance', 'interestRate', 'monthlyPayment', 'yearsRemaining'],
  plan_events: ['name', 'amount', 'growthRate', 'growthCap', 'startTriggerValue', 'endTriggerValue', 'inflationPerRecurrence'],
  plan_flows: ['name', 'ruleValue', 'matchRate', 'matchLimit', 'startTriggerValue', 'endTriggerValue'],
  plan_settings: ['fixedInflationRate', 'fixedBenefitCola', 'withholdingDeferred', 'withholdingTaxable', 'incomeTaxModifier', 'stateTaxTable', 'projectionMode', 'enableAmt', 'capGainsTaxModifier', 'heirFlatIncomeTaxRate', 'realEstateLiquidationRate', 'administrativeCostRate', 'charitableGiving'],
  recurring_transactions: ['merchantName', 'matchPattern', 'averageAmount', 'lastAmount', 'customName', 'notes'],
  equity_grants: ['companyName', 'grantName', 'totalShares', 'exercisedShares', 'soldShares', 'strikePrice', 'currentFmv', 'preferredPrice', 'vestingSchedule', 'logoUrl', 'notes'],
};

export async function encryptRow<T extends Record<string, any>>(table: string, row: T, key: Uint8Array): Promise<T> {
  if (!row || typeof row !== 'object') return row;
  const fields = ENCRYPTED_FIELDS[table];
  if (!fields) return row;
  const result: any = { ...row };
  for (const field of fields) {
    const val = result[field];
    if (val != null && val !== '') {
      const encryptedStr = await encryptField(typeof val === 'object' ? JSON.stringify(val) : String(val), key);
      if (table === 'category_rules' && field === 'conditions') {
        try {
          result[field] = JSON.parse(encryptedStr);
        } catch {
          result[field] = encryptedStr;
        }
      } else {
        result[field] = encryptedStr;
      }
    }
  }
  return result as T;
}

export async function decryptRow<T extends Record<string, any>>(table: string, row: T, key: Uint8Array): Promise<T> {
  if (!row || typeof row !== 'object') return row;
  const fields = ENCRYPTED_FIELDS[table];
  if (!fields) return row;
  const result: any = { ...row };
  for (const field of fields) {
    let val = result[field];
    if (val != null && val !== '') {
      const payloadStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      const decrypted = await decryptField(payloadStr, key);
      // Fields that store JSON objects/arrays were stringified before encryption;
      // parse them back so the caller receives the original type. Scalar results
      // (numbers, booleans, null) are deliberately discarded: encryptRow wrote
      // strings with String(val), so a plaintext like "12345" or "true" is a
      // string that merely *looks* like JSON. Coercing it here turned account
      // names into numbers and crashed `.localeCompare` / `.includes` callers.
      try {
        const parsed = JSON.parse(decrypted);
        val = parsed !== null && typeof parsed === 'object' ? parsed : decrypted;
      } catch {
        val = decrypted;
      }

      // Handle legacy rules where conditions array itself is plaintext in DB but individual values inside are encrypted.
      if (field === 'conditions' && Array.isArray(val)) {
        val = await Promise.all(
          val.map(async (cond: any) => {
            if (cond && typeof cond === 'object' && cond.value != null && cond.value !== '') {
              return {
                ...cond,
                value: await decryptField(String(cond.value), key),
              };
            }
            return cond;
          })
        );
      }

      result[field] = val;
    }
  }
  return result as T;
}

export async function decryptRows<T extends Record<string, any>>(table: string, rows: T[], key: Uint8Array): Promise<T[]> {
  const fields = ENCRYPTED_FIELDS[table];
  if (!fields || rows.length === 0) return rows;

  const CHUNK_SIZE = 100;
  const results: T[] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const decryptedChunk = await Promise.all(chunk.map((row) => decryptRow(table, row, key)));
    results.push(...decryptedChunk);
    if (rows.length > CHUNK_SIZE && i + CHUNK_SIZE < rows.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return results;
}
