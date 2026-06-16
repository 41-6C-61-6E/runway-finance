import { fetchRentcastValue } from '../lib/services/manual-accounts';
import dotenv from 'dotenv';
import path from 'path';

// Load .env variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
  console.log('Starting RentCast API test...');
  console.log('RENTCAST_API_KEY from env:', process.env.RENTCAST_API_KEY ? 'Present (matches user key)' : 'Missing');

  try {
    const address = '550 California St, San Francisco, CA 94104';
    console.log(`Querying value for address: "${address}"...`);
    const price = await fetchRentcastValue({
      address,
      propertyType: 'commercial',
    });
    console.log(`\nSuccess! RentCast AVM Valuation: $${price.toLocaleString()}`);
  } catch (err) {
    console.error('\nAPI call failed:', err);
  }
}

run();
