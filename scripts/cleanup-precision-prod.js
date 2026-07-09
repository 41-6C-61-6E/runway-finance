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
    let totalMcfUpdated = 0;
    let totalCssUpdated = 0;
    let totalCisUpdated = 0;
    let totalBudgetsUpdated = 0;
    let totalGoalsUpdated = 0;
    let totalGahUpdated = 0;

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

      // 5. Clean up monthly cash flow
      const mcfResult = await client.query(
        'SELECT year_month, total_income, total_expenses, net_cash_flow FROM monthly_cash_flow WHERE user_id = $1',
        [user.username]
      );

      let mcfUpdated = 0;
      for (const m of mcfResult.rows) {
        try {
          const decInc = await decryptField(m.total_income, dek);
          const decExp = await decryptField(m.total_expenses, dek);
          const decNet = await decryptField(m.net_cash_flow, dek);

          const formInc = formatToCents(parseFloat(decInc) || 0);
          const formExp = formatToCents(parseFloat(decExp) || 0);
          const formNet = formatToCents(parseFloat(decNet) || 0);

          if (decInc !== formInc || decExp !== formExp || decNet !== formNet) {
            const encInc = await encryptField(formInc, dek);
            const encExp = await encryptField(formExp, dek);
            const encNet = await encryptField(formNet, dek);

            await client.query(
              'UPDATE monthly_cash_flow SET total_income = $1, total_expenses = $2, net_cash_flow = $3 WHERE user_id = $4 AND year_month = $5',
              [encInc, encExp, encNet, user.username, m.year_month]
            );
            mcfUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update monthly cash flow for user ${user.username} date ${m.year_month}:`, err.message);
        }
      }
      if (mcfUpdated > 0) {
        console.log(`  Updated ${mcfUpdated} monthly cash flow summary row(s).`);
        totalMcfUpdated += mcfUpdated;
      }

      // 6. Clean up category spending summaries
      const cssResult = await client.query(
        'SELECT category_id, account_id, year_month, amount FROM category_spending_summary WHERE user_id = $1',
        [user.username]
      );

      let cssUpdated = 0;
      for (const s of cssResult.rows) {
        try {
          const decAmt = await decryptField(s.amount, dek);
          if (!decAmt) continue;

          const formAmt = formatToCents(parseFloat(decAmt) || 0);
          if (decAmt !== formAmt) {
            const encAmt = await encryptField(formAmt, dek);
            await client.query(
              'UPDATE category_spending_summary SET amount = $1 WHERE user_id = $2 AND category_id = $3 AND account_id = $4 AND year_month = $5',
              [encAmt, user.username, s.category_id, s.account_id, s.year_month]
            );
            cssUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update category spending summary for user ${user.username} cat ${s.category_id}:`, err.message);
        }
      }
      if (cssUpdated > 0) {
        console.log(`  Updated ${cssUpdated} category spending summary row(s).`);
        totalCssUpdated += cssUpdated;
      }

      // 7. Clean up category income summaries
      const cisResult = await client.query(
        'SELECT category_id, account_id, year_month, amount FROM category_income_summary WHERE user_id = $1',
        [user.username]
      );

      let cisUpdated = 0;
      for (const s of cisResult.rows) {
        try {
          const decAmt = await decryptField(s.amount, dek);
          if (!decAmt) continue;

          const formAmt = formatToCents(parseFloat(decAmt) || 0);
          if (decAmt !== formAmt) {
            const encAmt = await encryptField(formAmt, dek);
            await client.query(
              'UPDATE category_income_summary SET amount = $1 WHERE user_id = $2 AND category_id = $3 AND account_id = $4 AND year_month = $5',
              [encAmt, user.username, s.category_id, s.account_id, s.year_month]
            );
            cisUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update category income summary for user ${user.username} cat ${s.category_id}:`, err.message);
        }
      }
      if (cisUpdated > 0) {
        console.log(`  Updated ${cisUpdated} category income summary row(s).`);
        totalCisUpdated += cisUpdated;
      }

      // 8. Clean up budgets
      const budgetsResult = await client.query(
        'SELECT id, amount FROM budgets WHERE user_id = $1',
        [user.username]
      );

      let budgetsUpdated = 0;
      for (const b of budgetsResult.rows) {
        try {
          const decrypted = await decryptField(b.amount, dek);
          if (!decrypted) continue;

          const formatted = formatToCents(parseFloat(decrypted) || 0);
          if (decrypted !== formatted) {
            const encrypted = await encryptField(formatted, dek);
            await client.query(
              'UPDATE budgets SET amount = $1 WHERE id = $2',
              [encrypted, b.id]
            );
            budgetsUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update budget ${b.id}:`, err.message);
        }
      }
      if (budgetsUpdated > 0) {
        console.log(`  Updated ${budgetsUpdated} budget amount(s).`);
        totalBudgetsUpdated += budgetsUpdated;
      }

      // 9. Clean up financial goals
      const goalsResult = await client.query(
        'SELECT id, target_amount, current_amount, reserve, allocated_amount FROM financial_goals WHERE user_id = $1',
        [user.username]
      );

      let goalsUpdated = 0;
      for (const g of goalsResult.rows) {
        try {
          const decTar = await decryptField(g.target_amount, dek);
          const decCur = await decryptField(g.current_amount, dek);
          const decRes = await decryptField(g.reserve, dek);
          const decAlloc = g.allocated_amount || ''; // NOT encrypted

          const formTar = formatToCents(parseFloat(decTar) || 0);
          const formCur = formatToCents(parseFloat(decCur) || 0);
          const formRes = formatToCents(parseFloat(decRes) || 0);
          const formAlloc = decAlloc ? formatToCents(parseFloat(decAlloc) || 0) : '';

          if (decTar !== formTar || decCur !== formCur || decRes !== formRes || (decAlloc && decAlloc !== formAlloc)) {
            const encTar = await encryptField(formTar, dek);
            const encCur = await encryptField(formCur, dek);
            const encRes = await encryptField(formRes, dek);

            await client.query(
              'UPDATE financial_goals SET target_amount = $1, current_amount = $2, reserve = $3, allocated_amount = $4 WHERE id = $5',
              [encTar, encCur, encRes, formAlloc || null, g.id]
            );
            goalsUpdated++;
          }
        } catch (err) {
          console.error(`    [Error] Failed to decrypt/update financial goal ${g.id}:`, err.message);
        }
      }
      if (goalsUpdated > 0) {
        console.log(`  Updated ${goalsUpdated} financial goal amount(s).`);
        totalGoalsUpdated += goalsUpdated;
      }

      // 10. Clean up goal allocation history (plaintext columns)
      const gahResult = await client.query(
        'SELECT id, account_balance, allocated_amount, desired_amount, remaining_on_account FROM goal_allocation_history WHERE user_id = $1',
        [user.username]
      );

      let gahUpdated = 0;
      for (const g of gahResult.rows) {
        const decBal = g.account_balance;
        const decAlloc = g.allocated_amount;
        const decDes = g.desired_amount;
        const decRem = g.remaining_on_account;

        const formBal = formatToCents(parseFloat(decBal) || 0);
        const formAlloc = formatToCents(parseFloat(decAlloc) || 0);
        const formDes = formatToCents(parseFloat(decDes) || 0);
        const formRem = formatToCents(parseFloat(decRem) || 0);

        if (decBal !== formBal || decAlloc !== formAlloc || decDes !== formDes || decRem !== formRem) {
          await client.query(
            'UPDATE goal_allocation_history SET account_balance = $1, allocated_amount = $2, desired_amount = $3, remaining_on_account = $4 WHERE id = $5',
            [formBal, formAlloc, formDes, formRem, g.id]
          );
          gahUpdated++;
        }
      }
      if (gahUpdated > 0) {
        console.log(`  Updated ${gahUpdated} goal allocation history row(s).`);
        totalGahUpdated += gahUpdated;
      }
    }

    console.log('\n-----------------------------------------');
    console.log('Cleanup execution report:');
    console.log(`- Accounts updated: ${totalAccountsUpdated}`);
    console.log(`- Account snapshots updated: ${totalSnapshotsUpdated}`);
    console.log(`- Transactions updated: ${totalTransactionsUpdated}`);
    console.log(`- Net worth snapshots updated: ${totalNetWorthUpdated}`);
    console.log(`- Monthly cash flow updated: ${totalMcfUpdated}`);
    console.log(`- Category spending summaries updated: ${totalCssUpdated}`);
    console.log(`- Category income summaries updated: ${totalCisUpdated}`);
    console.log(`- Budgets updated: ${totalBudgetsUpdated}`);
    console.log(`- Financial goals updated: ${totalGoalsUpdated}`);
    console.log(`- Goal allocation histories updated: ${totalGahUpdated}`);
    console.log('-----------------------------------------');
    console.log('Precision cleanup completed successfully!');

  } catch (err) {
    console.error('Fatal error during execution:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
