import { createDecipheriv } from 'node:crypto';

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

function getEncryptionKey(): Uint8Array {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-f]+$/i.test(key)) {
    console.error(
      '[runway] FATAL: ENCRYPTION_KEY is missing or invalid. ' +
        'Must be a 64-character hex string. ' +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
    throw new Error('ENCRYPTION_KEY is missing or invalid');
  }
  return new Uint8Array([...Buffer.from(key, 'hex')]);
}

// Key loaded once at module init. Process exits if invalid.
const ENCRYPTION_KEY = getEncryptionKey();

export async function encrypt(plaintext: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw',
    ENCRYPTION_KEY as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join(''),
    tag: '', // AES-GCM tag is appended to ciphertext
  };
}

export async function decrypt({ ciphertext, iv, tag }: EncryptedPayload): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ENCRYPTION_KEY as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const ivBytes = new Uint8Array(iv.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
  const ciphertextBytes = new Uint8Array(
    atob(ciphertext)
      .split('')
      .map((c) => c.charCodeAt(0)),
  );
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      ciphertextBytes,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('Decryption failed: invalid ciphertext or tampered data');
  }
}
