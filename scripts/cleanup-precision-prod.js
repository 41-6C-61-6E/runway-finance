const { Pool } = require('pg');
const crypto = require('crypto');

function hexToBytes(hex) {
  return new Uint8Array(hex.match(/.{2}/g).map((c) => parseInt(c, 16)));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64FromBytes(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function bytesFromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function formatToCents(val) {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
    return '0.00';
  }
  return (Math.round(val * 100) / 100).toFixed(2);
}

async function decrypt(ciphertext, iv, key) {
  const cryptoKey = await crypto.webcrypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(iv) },
    cryptoKey,
    bytesFromBase64(ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}

async function encrypt(plaintext, key) {
  const iv = crypto.webcrypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.webcrypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const encrypted = await crypto.webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );
  return {
    ciphertext: base64FromBytes(new Uint8Array(encrypted)),
    iv: bytesToHex(iv)
  };
}

async function decryptField(payload, key) {
  if (!payload) return '';
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return String(payload);
  }
  if (typeof parsed !== 'object' || !parsed.ct || !parsed.iv) {
    return String(payload);
  }
  try {
    return await decrypt(parsed.ct, parsed.iv, key);
  } catch {
    return '';
  }
}

async function encryptField(plaintext, key) {
  const p = await encrypt(plaintext, key);
  return JSON.stringify({ ct: p.ciphertext, iv: p.iv });
}

function getServerKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-f]+$/i.test(key)) {
    throw new Error('ENCRYPTION_KEY is missing or invalid on the server');
  }
  return hexToBytes(key);
}

async function getServerDEK(username, client, serverKey) {
  const result = await client.query(
    'SELECT server_wrapped_dek, server_wrapping_iv FROM user_encryption_keys WHERE user_id = $1 LIMIT 1',
    [username]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`No encryption keys found for user: ${username}`);
  }
  if (row.server_wrapped_dek && row.server_wrapping_iv) {
    const wrappedHex = await decrypt(row.server_wrapped_dek, row.server_wrapping_iv, serverKey);
    return hexToBytes(wrappedHex);
  }
  throw new Error(`No server-wrapped encryption key found for user ${username}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  console.log('Starting standalone production financial precision cleanup script...\n');

  try {
    const serverKey = getServerKey();

    const usersResult = await client.query('SELECT username, email FROM users');
    console.log(`Found ${usersResult.rows.length} user(s) in database.\n`);

    let totalAccountsUpdated = 0;
    let totalSnapshotsUpdated = 0;
    let totalTransactionsUpdated = 0;
    let totalNetWorthUpdated = 0;

    for (const user of usersResult.rows) {
      if (!user.username) {
        console.log(`  [Skip] User has no username: email=${user.email}`);
        continue;
      }
      console.log(`Processing user: ${user.username} (Email: ${user.email})...`);
      let dek;
      try {
        dek = await getServerDEK(user.username, client, serverKey);
      } catch (err) {
        console.error(`  [Error] Failed to resolve server DEK for user ${user.username}:`, err.message);
        continue;
      }

      // 1. Clean up accounts balance
      const accountsResult = await client.query(
        'SELECT id, name, balance FROM accounts WHERE user_id = $1',
        [user.username]
      );

      let accountsUpdated = 0;
      for (const acc of accountsResult.rows) {
        try {
          const decrypted = await decryptField(acc.balance, dek);
          if (!decrypted) continue;

          const formatted = formatToCents(parseFloat(decrypted) || 0);
          if (decrypted !== formatted) {
            const encrypted = await encryptField(formatted, dek);
            await client.query(
              'UPDATE accounts SET balance = $1, updated_at = $2 WHERE id = $3',
              [encrypted, new Date(), acc.id]
            );
            accountsUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update balance for account ${acc.id}:`, err.message);
        }
      }
      if (accountsUpdated > 0) {
        console.log(`  Updated ${accountsUpdated} account balance(s).`);
        totalAccountsUpdated += accountsUpdated;
      }

      // 2. Clean up account snapshots balance
      const snapshotsResult = await client.query(
        'SELECT id, snapshot_date, balance FROM account_snapshots WHERE user_id = $1',
        [user.username]
      );

      let snapshotsUpdated = 0;
      for (const snap of snapshotsResult.rows) {
        try {
          const decrypted = await decryptField(snap.balance, dek);
          if (!decrypted) continue;

          const formatted = formatToCents(parseFloat(decrypted) || 0);
          if (decrypted !== formatted) {
            const encrypted = await encryptField(formatted, dek);
            await client.query(
              'UPDATE account_snapshots SET balance = $1 WHERE id = $2',
              [encrypted, snap.id]
            );
            snapshotsUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update snapshot ${snap.id}:`, err.message);
        }
      }
      if (snapshotsUpdated > 0) {
        console.log(`  Updated ${snapshotsUpdated} account snapshot(s).`);
        totalSnapshotsUpdated += snapshotsUpdated;
      }

      // 3. Clean up transactions amount
      const txsResult = await client.query(
        'SELECT id, date, amount FROM transactions WHERE user_id = $1',
        [user.username]
      );

      let txsUpdated = 0;
      for (const tx of txsResult.rows) {
        try {
          const decrypted = await decryptField(tx.amount, dek);
          if (!decrypted) continue;

          const formatted = formatToCents(parseFloat(decrypted) || 0);
          if (decrypted !== formatted) {
            const encrypted = await encryptField(formatted, dek);
            await client.query(
              'UPDATE transactions SET amount = $1 WHERE id = $2',
              [encrypted, tx.id]
            );
            txsUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update transaction ${tx.id}:`, err.message);
        }
      }
      if (txsUpdated > 0) {
        console.log(`  Updated ${txsUpdated} transaction amount(s).`);
        totalTransactionsUpdated += txsUpdated;
      }

      // 4. Clean up net worth snapshots
      const nwResult = await client.query(
        'SELECT snapshot_date, total_assets, total_liabilities, net_worth FROM net_worth_snapshots WHERE user_id = $1',
        [user.username]
      );

      let nwUpdated = 0;
      for (const nw of nwResult.rows) {
        try {
          const decAssets = await decryptField(nw.total_assets, dek);
          const decLiab = await decryptField(nw.total_liabilities, dek);
          const decNw = await decryptField(nw.net_worth, dek);

          const formAssets = formatToCents(parseFloat(decAssets) || 0);
          const formLiab = formatToCents(parseFloat(decLiab) || 0);
          const formNw = formatToCents(parseFloat(decNw) || 0);

          if (decAssets !== formAssets || decLiab !== formLiab || decNw !== formNw) {
            const encAssets = await encryptField(formAssets, dek);
            const encLiab = await encryptField(formLiab, dek);
            const encNw = await encryptField(formNw, dek);

            await client.query(
              'UPDATE net_worth_snapshots SET total_assets = $1, total_liabilities = $2, net_worth = $3 WHERE user_id = $4 AND snapshot_date = $5',
              [encAssets, encLiab, encNw, user.username, nw.snapshot_date]
            );
            nwUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update net worth snapshot for date ${nw.snapshot_date}:`, err.message);
        }
      }
      if (nwUpdated > 0) {
        console.log(`  Updated ${nwUpdated} net worth snapshot(s).`);
        totalNetWorthUpdated += nwUpdated;
      }
    }

    console.log('\n-----------------------------------------');
    console.log('Cleanup execution report:');
    console.log(`- Accounts updated: ${totalAccountsUpdated}`);
    console.log(`- Account snapshots updated: ${totalSnapshotsUpdated}`);
    console.log(`- Transactions updated: ${totalTransactionsUpdated}`);
    console.log(`- Net worth snapshots updated: ${totalNetWorthUpdated}`);
    console.log('-----------------------------------------');
    console.log('Precision cleanup completed successfully!');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
