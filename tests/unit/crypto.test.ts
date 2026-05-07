import { describe, expect, it } from 'vitest';

describe('Crypto', () => {
  it('encrypts and decrypts back to original plaintext', async () => {
    // Dynamic import to ensure ENCRYPTION_KEY is set
    const { decrypt, encrypt } = await import('@/lib/crypto');
    const plaintext = 'https://user:pass@simplefin.example.com/abc123';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces unique ciphertext on each call (random IV)', async () => {
    const { decrypt, encrypt } = await import('@/lib/crypto');
    const a = encrypt('test-value');
    const b = encrypt('test-value');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('throws on tampered ciphertext', async () => {
    const { decrypt, encrypt } = await import('@/lib/crypto');
    const payload = encrypt('secret');
    payload.ciphertext = payload.ciphertext.slice(0, -4) + 'XXXX';
    expect(() => decrypt(payload)).toThrow('Decryption failed');
  });

  it('throws on tampered auth tag', async () => {
    const { decrypt, encrypt } = await import('@/lib/crypto');
    const payload = encrypt('secret');
    payload.tag = 'a'.repeat(32);
    expect(() => decrypt(payload)).toThrow('Decryption failed');
  });
});
