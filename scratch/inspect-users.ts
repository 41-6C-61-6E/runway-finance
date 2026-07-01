import { getDb } from '../lib/db';
import { users, user as userTable, userEncryptionKeys } from '../lib/db/schema';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const db = getDb();
  
  const credentialUsers = await db.select().from(users);
  console.log("--- credential users ---", credentialUsers);

  const authUsers = await db.select().from(userTable);
  console.log("--- auth users ---", authUsers);

  const encryptionKeys = await db.select().from(userEncryptionKeys);
  console.log("--- encryption keys ---", encryptionKeys);
}

run().catch(console.error);
