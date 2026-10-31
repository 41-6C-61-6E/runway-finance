#!/usr/bin/env node
/**
 * reencrypt-server-wraps.mjs — re-wrap ALL server-side DEK wraps under a new
 * ENCRYPTION_KEY (master-key rotation).
 *
 * Why this script exists:
 *   ENCRYPTION_KEY wraps each user's current DEK
 *   (user_encryption_keys.server_wrapped_dek). It is the server's recovery key. If it
 *   is ever rotated (REQUIRED whenever the old key is considered compromised),
 *   every server wrap must be re-encrypted under the new key or the app can no
 *   longer read any data. This script does that atomically.
 *
 * Usage:
 *   1. Generate a fresh key:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   2. Dry run first (requires the CURRENT/OLD key):
 *        ENCRYPTION_KEY_OLD=<old-64-hex> \
 *        ENCRYPTION_KEY_NEW=<new-64-hex> \
 *        DATABASE_URL=<url> \
 *        node scripts/reencrypt-server-wraps.mjs --dry-run
 *   3. Apply: drop --dry-run.
 *   4. Only after a SUCCESSFUL apply, put ENCRYPTION_KEY_NEW into .env / compose
 *      env and restart the app.
 *
 * Safety:
 *   - Validates both keys (64 hex) before touching anything.
 *   - Unwraps each user's DEK from user_encryption_keys.server_wrapped_dek and
 *     re-wraps it under ENCRYPTION_KEY_NEW.
 *   - Runs inside a single transaction: all-or-nothing.
 *   - Verifies a round-trip (decrypt the freshly written wrap) for a sample.
 *   - Idempotent: running it twice with the same NEW key is safe.
 */

const fs = require('node:fs');
const path = require('node:path');

const OLD_KEY = process.env.ENCRYPTION_KEY_OLD;
const NEW_KEY = process.env.ENCRYPTION_KEY_NEW;
const DATABASE_URL = process.env.DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');

function die(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

if (!OLD_KEY || !NEW_KEY) {
  die('Both ENCRYPTION_KEY_OLD and ENCRYPTION_KEY_NEW must be set (64-char hex).');
}
if (!/^[0-9a-f]{64}$/i.test(OLD_KEY)) die('ENCRYPTION_KEY_OLD must be 64-char hex.');
if (!/^[0-9a-f]{64}$/i.test(NEW_KEY)) die('ENCRYPTION_KEY_NEW must be 64-char hex.');
if (!DATABASE_URL) die('DATABASE_URL must be set.');

const crypto = require('node:crypto');

function hexToBuf(h) {
  return Buffer.from(h, 'hex');
}
function bufToHex(b) {
  return Buffer.from(b).toString('hex');
}
function b64ToBuf(b64) {
  return Buffer.from(b64, 'base64');
}
function bufToB64(b) {
  return Buffer.from(b).toString('base64');
}

/** AES-256-GCM. Ciphertext column stores base64(ct||tag), iv column stores hex(12B). */
function gcmEncrypt(keyBuf, plaintextStr, iv) {
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const ct = Buffer.concat([cipher.update(plaintextStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: bufToB64(Buffer.concat([ct, tag])), iv: bufToHex(iv) };
}
function gcmDecrypt(keyBuf, ciphertextB64, ivHex) {
  const raw = b64ToBuf(ciphertextB64);
  const tag = raw.subarray(raw.length - 16); // GCM auth tag is always 16 bytes
  const ct = raw.subarray(0, raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, hexToBuf(ivHex));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── Load app's pg via its node_modules ─────────────────────────────────────
const pg = require('pg');
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const oldKey = hexToBuf(OLD_KEY);
  const newKey = hexToBuf(NEW_KEY);

  const client = await pool.connect();
  let changedKeys = 0;
  let roundtripVerified = false;
  try {
    await client.query('BEGIN');

    // 1) user_encryption_keys
    const { rows: keyRows } = await client.query(
      `SELECT user_id, server_wrapped_dek, server_wrapping_iv
         FROM user_encryption_keys
        WHERE server_wrapped_dek IS NOT NULL
          AND server_wrapped_dek <> ''
        ORDER BY user_id`
    );
    console.log(`Found ${keyRows.length} user_encryption_keys rows with server wraps.`);

    for (const row of keyRows) {
      let dekHex;
      try {
        dekHex = gcmDecrypt(oldKey, row.server_wrapped_dek, row.server_wrapping_iv);
      } catch {
        die(`Cannot unwrap row user_id=${row.user_id} with ENCRYPTION_KEY_OLD — aborting before commit.`);
      }
      if (!/^[0-9a-f]{64}$/i.test(dekHex)) {
        die(`Decrypted DEK for row user_id=${row.user_id} is not 64-char hex — aborting.`);
      }
      if (DRY_RUN) {
        changedKeys++;
        continue;
      }
      const iv = crypto.randomBytes(12);
      const enc = gcmEncrypt(newKey, dekHex, iv);
      await client.query(
        `UPDATE user_encryption_keys
            SET server_wrapped_dek = $1, server_wrapping_iv = $2, updated_at = now()
          WHERE user_id = $3`,
        [enc.ciphertext, enc.iv, row.user_id]
      );
      changedKeys++;
    }

    if (DRY_RUN) {
      console.log(`DRY RUN OK: would re-wrap ${changedKeys} key rows.`);
      console.log('Re-run WITHOUT --dry-run to apply.');
      await client.query('ROLLBACK');
      return;
    }

    await client.query('COMMIT');

    // 2) Post-commit verification: re-wrap round-trip check with the NEW key
    const { rows: check } = await client.query(
      `SELECT server_wrapped_dek, server_wrapping_iv FROM user_encryption_keys
        WHERE server_wrapped_dek IS NOT NULL LIMIT 1`
    );
    if (check.length) {
      gcmDecrypt(newKey, check[0].server_wrapped_dek, check[0].server_wrapping_iv); // throws if bad
      roundtripVerified = true;
    }

    console.log('COMMIT OK. Summary:');
    console.log(`  user_encryption_keys re-wrapped: ${changedKeys}`);
    console.log(`  new-key round-trip verified:    ${roundtripVerified}`);
    console.log('NEXT: put ENCRYPTION_KEY_NEW into .env/compose env and restart the app.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    die(`Failed (rolled back): ${err.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
