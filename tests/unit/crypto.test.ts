import { describe, expect, it, beforeAll } from 'vitest';

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
}

describe('Crypto', () => {
  let testKey: Uint8Array;
  let encrypt: (plaintext: string, key: Uint8Array) => Promise<{ ciphertext: string; iv: string; tag: string }>;
  let decrypt: (payload: { ciphertext: string; iv: string; tag: string }, key: Uint8Array) => Promise<string>;
  let encryptField: (plaintext: string, key: Uint8Array) => Promise<string>;
  let decryptField: (payload: string, key: Uint8Array) => Promise<string>;
  let deriveKeyFromPassword: (password: string, salt: Uint8Array) => Promise<Uint8Array>;
  let wrapKey: (dek: Uint8Array, kek: Uint8Array) => Promise<{ ciphertext: string; iv: string; tag: string }>;
  let unwrapKey: (payload: { ciphertext: string; iv: string; tag: string }, kek: Uint8Array) => Promise<Uint8Array>;
  let encryptRow: (table: string, row: any, key: Uint8Array) => Promise<any>;
  let decryptRow: (table: string, row: any, key: Uint8Array) => Promise<any>;

  beforeAll(async () => {
    // Set a valid ENCRYPTION_KEY for getServerKey to work
    process.env.ENCRYPTION_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const mod = await import('@/lib/crypto');
    encrypt = mod.encrypt;
    decrypt = mod.decrypt;
    encryptField = mod.encryptField;
    decryptField = mod.decryptField;
    deriveKeyFromPassword = mod.deriveKeyFromPassword;
    wrapKey = mod.wrapKey;
    unwrapKey = mod.unwrapKey;
    encryptRow = mod.encryptRow;
    decryptRow = mod.decryptRow;
    testKey = hexToBytes('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff');
  });

  it('encrypts and decrypts back to original plaintext', async () => {
    const plaintext = 'https://user:pass@simplefin.example.com/abc123';
    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it('produces unique ciphertext on each call (random IV)', async () => {
    const a = await encrypt('test-value', testKey);
    const b = await encrypt('test-value', testKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('field-level encrypt/decrypt roundtrips', async () => {
    const plaintext = 'Hello World';
    const encrypted = await encryptField(plaintext, testKey);
    const decrypted = await decryptField(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it('throws on tampered ciphertext', async () => {
    const payload = await encrypt('secret', testKey);
    payload.ciphertext = payload.ciphertext.slice(0, -4) + 'XXXX';
    await expect(decrypt(payload, testKey)).rejects.toThrow('Decryption failed');
  });

  it('PBKDF2 + key wrap roundtrips', async () => {
    const password = 'hunter2';
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const kek = await deriveKeyFromPassword(password, salt);
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapKey(dek, kek);
    const unwrapped = await unwrapKey(wrapped, kek);
    expect(unwrapped).toEqual(dek);
  });

  it('field decrypt returns input string as-is on invalid JSON', async () => {
    await expect(decryptField('not-json', testKey)).resolves.toBe('not-json');
  });

  // M-10 (2026-08-27 security review): decryption failures are no longer
  // swallowed into "". decryptField logs server-side and throws; callers
  // surface a generic message via handleApiError so a wrong DEK is visible
  // to the user instead of silently rendering empty data.
  it('field decrypt throws on decryption failure (M-10)', async () => {
    await expect(decryptField('{"ct":"invalid","iv":"0123456789abcdef01234567"}', testKey))
      .rejects.toThrow('could not be decrypted');
  });

  it('row-level encrypt/decrypt roundtrips for JSONB objects (conditions)', async () => {
    const row = {
      name: 'Test Rule',
      conditionField: 'payee',
      conditionOperator: 'contains',
      conditionValue: 'Amazon',
      conditions: [
        { field: 'payee', operator: 'contains', value: 'Amazon', caseSensitive: false }
      ]
    };
    const encrypted = await encryptRow('category_rules', row, testKey);
    expect(encrypted.name).not.toBe(row.name);
    expect(encrypted.conditionValue).not.toBe(row.conditionValue);
    expect(encrypted.conditions).not.toEqual(row.conditions);
    expect(encrypted.conditions.ct).toBeDefined();
    expect(encrypted.conditions.iv).toBeDefined();

    const decrypted = await decryptRow('category_rules', encrypted, testKey);
    expect(decrypted.name).toBe(row.name);
    expect(decrypted.conditionValue).toBe(row.conditionValue);
    expect(decrypted.conditions).toEqual(row.conditions);
  });

  it('decryptRow handles legacy category_rules with unencrypted outer conditions array and encrypted inner condition values', async () => {
    const encryptedVal = await encryptField('Starbucks', testKey);
    const legacyRow = {
      name: 'Test Legacy Rule',
      conditionField: 'payee',
      conditionOperator: 'contains',
      conditionValue: encryptedVal,
      conditions: [
        { field: 'payee', operator: 'contains', value: encryptedVal, caseSensitive: false }
      ]
    };

    const decrypted = await decryptRow('category_rules', legacyRow, testKey);
    expect(decrypted.conditionValue).toBe('Starbucks');
    expect(decrypted.conditions).toEqual([
      { field: 'payee', operator: 'contains', value: 'Starbucks', caseSensitive: false }
    ]);
  });

  it('unwrapKey throws when unwrapping with wrong KEK', async () => {
    const kek1 = hexToBytes('11'.repeat(32));
    const kek2 = hexToBytes('22'.repeat(32));
    const dek = crypto.getRandomValues(new Uint8Array(32));

    const wrapped = await wrapKey(dek, kek1);
    await expect(unwrapKey(wrapped, kek2)).rejects.toThrow('Decryption failed');
  });

  it('wrapKey throws when DEK is not exactly 32 bytes', async () => {
    const invalidDek = new Uint8Array(16);
    await expect(wrapKey(invalidDek, testKey)).rejects.toThrow('DEK must be exactly 32 bytes');
  });

  it('getServerKey throws if ENCRYPTION_KEY is missing or invalid', async () => {
    const originalEnv = process.env.ENCRYPTION_KEY;
    const { getServerKey } = await import('@/lib/crypto');

    delete process.env.ENCRYPTION_KEY;
    expect(() => getServerKey()).toThrow('ENCRYPTION_KEY is missing or invalid');

    process.env.ENCRYPTION_KEY = 'invalid-hex-short';
    expect(() => getServerKey()).toThrow('ENCRYPTION_KEY is missing or invalid');

    process.env.ENCRYPTION_KEY = originalEnv;
  });

  it('backup file-level encrypt/decrypt roundtrips with a passphrase', async () => {
    const { encryptBackupJson, decryptBackupJson, BACKUP_ENCRYPTION_MAGIC } = await import('@/lib/crypto');
    const json = JSON.stringify({ version: 1, exportedAt: '2025-01-01T00:00:00.000Z', data: { accounts: [{ id: 'a1', name: 'Checking' }] } });
    const passphrase = 'correct horse battery staple';

    const payload = await encryptBackupJson(json, passphrase);
    expect(payload.magic).toBe(BACKUP_ENCRYPTION_MAGIC);
    expect(payload.version).toBe(2);
    expect(payload.salt).toBeTruthy();
    expect(payload.iv).toBeTruthy();
    expect(payload.ct).toBeTruthy();

    const decrypted = await decryptBackupJson(payload, passphrase);
    expect(decrypted).toBe(json);
  });

  it('backup decryption fails with the wrong passphrase', async () => {
    const { encryptBackupJson, decryptBackupJson } = await import('@/lib/crypto');
    const payload = await encryptBackupJson('{"version":1}', 'right-passphrase');
    await expect(decryptBackupJson(payload, 'wrong-passphrase')).rejects.toThrow('Backup decryption failed');
  });
});
