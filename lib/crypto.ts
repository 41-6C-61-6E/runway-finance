import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedPayload = { ciphertext: string; iv: string; tag: string };

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-f]+$/i.test(key)) {
    console.error(
      '[runway] FATAL: ENCRYPTION_KEY is missing or invalid. ' +
        'Must be a 64-character hex string. ' +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
    process.exit(1);
  }
  return Buffer.from(key, 'hex');
}

// Key loaded once at module init. Process exits if invalid.
const ENCRYPTION_KEY = getEncryptionKey();

export function encrypt(plaintext: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt({ ciphertext, iv, tag }: EncryptedPayload): string {
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Decryption failed: invalid ciphertext or tampered data');
  }
}
