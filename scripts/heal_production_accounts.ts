import { getDb } from '../lib/db';
import { plaidConnections, simplifinConnections, accounts } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptRows, encryptField } from '../lib/crypto';
import { getServerDEK } from '../lib/crypto-context';

async function main() {
  const db = getDb();
  console.log('Starting general production account healing process...\n');

  // Load all accounts and connections
  const allAccounts = await db.select().from(accounts);
  const plaidConns = await db.select().from(plaidConnections);
  const sfConns = await db.select().from(simplifinConnections);

  const plaidConnMap = new Map(plaidConns.map(c => [c.id, c]));
  const sfConnMap = new Map(sfConns.map(c => [c.id, c]));

  // Track counts
  let accountsReenabled = 0;
  let accountsMismatchedFixed = 0;

  // Group accounts by plaidConnectionId to identify mismatches
  const accountsByPlaidConn = new Map<string, typeof allAccounts>();
  for (const acc of allAccounts) {
    if (acc.plaidConnectionId) {
      if (!accountsByPlaidConn.has(acc.plaidConnectionId)) {
        accountsByPlaidConn.set(acc.plaidConnectionId, []);
      }
      accountsByPlaidConn.get(acc.plaidConnectionId)!.push(acc);
    }
  }

  // 1. Scan for active accounts that were incorrectly added to disabledAccounts lists
  for (const acc of allAccounts) {
    // Check Plaid Connections
    if (acc.plaidConnectionId) {
      const conn = plaidConnMap.get(acc.plaidConnectionId);
      if (conn) {
        const disabled = conn.disabledAccounts || [];
        if (disabled.includes(acc.externalId)) {
          console.log(`[Re-enable] Active account ${acc.id} found in disabledAccounts list of Plaid connection ${conn.id} (${conn.institutionName}). Re-enabling...`);
          const updatedDisabled = disabled.filter(id => id !== acc.externalId);
          await db
            .update(plaidConnections)
            .set({ disabledAccounts: updatedDisabled })
            .where(eq(plaidConnections.id, conn.id));
          conn.disabledAccounts = updatedDisabled; // update in-memory map
          accountsReenabled++;
        }
      }
    }

    // Check SimpleFIN Connections
    if (acc.connectionId) {
      const conn = sfConnMap.get(acc.connectionId);
      if (conn) {
        const disabled = conn.disabledAccounts || [];
        if (disabled.includes(acc.externalId)) {
          console.log(`[Re-enable] Active account ${acc.id} found in disabledAccounts list of SimpleFIN connection ${conn.id}. Re-enabling...`);
          const updatedDisabled = disabled.filter(id => id !== acc.externalId);
          await db
            .update(simplifinConnections)
            .set({ disabledAccounts: updatedDisabled })
            .where(eq(simplifinConnections.id, conn.id));
          conn.disabledAccounts = updatedDisabled; // update in-memory map
          accountsReenabled++;
        }
      }
    }
  }

  // 2. Scan for mismatched remapped accounts (e.g. Plaid connection set, but externalId is ACT-... / manual-...)
  for (const [connId, connAccounts] of accountsByPlaidConn.entries()) {
    const conn = plaidConnMap.get(connId);
    if (!conn) continue;

    // Find mismatched accounts on this connection (e.g. externalId starts with ACT- or manual-)
    const mismatchedAccounts = connAccounts.filter(
      acc => acc.externalId.startsWith('ACT-') || acc.externalId.startsWith('manual-')
    );

    if (mismatchedAccounts.length === 0) continue;

    const disabled = conn.disabledAccounts || [];
    console.log(`\nFound ${mismatchedAccounts.length} mismatched remapped account(s) on Plaid connection ${conn.id} (${conn.institutionName}).`);
    console.log('Disabled accounts on this connection:', disabled);

    // If there is exactly one mismatched account and exactly one disabled account, we can auto-match them!
    if (mismatchedAccounts.length === 1 && disabled.length === 1) {
      const mismatchedAcc = mismatchedAccounts[0];
      const correctPlaidId = disabled[0];

      console.log(`[Auto-Repair] Matching mismatched account ${mismatchedAcc.id} with Plaid account ${correctPlaidId}. Upgrading external ID...`);

      // Update account's externalId to the correct Plaid ID
      await db
        .update(accounts)
        .set({
          externalId: correctPlaidId,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, mismatchedAcc.id));

      // Remove it from the disabled list
      const updatedDisabled = disabled.filter(id => id !== correctPlaidId);
      await db
        .update(plaidConnections)
        .set({ disabledAccounts: updatedDisabled })
        .where(eq(plaidConnections.id, conn.id));
      conn.disabledAccounts = updatedDisabled; // update in-memory map

      accountsMismatchedFixed++;
      console.log(`[Auto-Repair] Successfully matched and re-enabled account ${mismatchedAcc.id}.`);
    } else {
      console.log(`[Auto-Repair] Cannot auto-repair connection ${conn.id} automatically: mismatch/disabled count doesn't align. (Mismatched: ${mismatchedAccounts.length}, Disabled: ${disabled.length})`);
    }
  }

  console.log(`\nProduction account healing process finished.`);
  console.log(`Total accounts re-enabled: ${accountsReenabled}`);
  console.log(`Total mismatched accounts repaired: ${accountsMismatchedFixed}`);
}

main().catch(console.error).finally(() => process.exit(0));
