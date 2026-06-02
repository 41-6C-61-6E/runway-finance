import 'dotenv/config';
import { syncConnection } from '../lib/services/sync';
import { getServerDEK } from '../lib/crypto-context';

async function main() {
  const userId = 'alanracek';
  const connectionId = 'd439dee7-ea92-4a9f-a0e8-0fe753c1344b';
  console.log('Fetching DEK for user:', userId);
  try {
    const dek = await getServerDEK(userId);
    console.log('DEK fetched successfully!');

    console.log('Running syncConnection...');
    const result = await syncConnection(connectionId, userId, dek);
    console.log('Sync result:', result);
  } catch (error) {
    console.error('Error running sync connection:', error);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
