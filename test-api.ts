import { getDb } from './lib/db';
import { accounts, userEncryptionKeys } from './lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerKey, unwrapKey, decryptRows } from './lib/crypto';

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
}

async function main() {
  process.env.ENCRYPTION_KEY = 'f0d03d94e8cd8cf388a681b5c5d3eb741258699d58680af3ab9468dc6ff429a2';
  const db = getDb();
  
  const [keyRow] = await db
    .select()
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, 'alanracek'))
    .limit(1);

  if (!keyRow) {
    console.error('No encryption key row found for user alanracek');
    return;
  }

  const serverKey = getServerKey();
  let dek: Uint8Array;
  
  if (keyRow.serverWrappedDek && keyRow.serverWrappingIv) {
    dek = await unwrapKey({
      ciphertext: keyRow.serverWrappedDek,
      iv: keyRow.serverWrappingIv,
      tag: keyRow.serverWrappingTag ?? '',
    }, serverKey);
  } else {
    console.error('No server wrapped DEK found');
    return;
  }

  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, 'alanracek'));

  console.log('Total accounts fetched from DB:', userAccounts.length);
  const decrypted = await decryptRows('accounts', userAccounts, dek);
  
  console.log('Decrypted accounts length:', decrypted.length);
  for (const acc of decrypted) {
    console.log(`- ID: ${acc.id}, Name: "${acc.name}", Type: "${acc.type}", ConnectionId: ${acc.connectionId}, isHidden: ${acc.isHidden}`);
  }
}

main().catch(console.error);
