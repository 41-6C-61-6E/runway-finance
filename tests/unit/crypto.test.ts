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

  it('field decrypt throws on invalid JSON', async () => {
    await expect(decryptField('not-json', testKey)).rejects.toThrow('Decryption failed');
  });
});
