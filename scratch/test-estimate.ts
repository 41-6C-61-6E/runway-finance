import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { estimateRealEstateHistory } from '../lib/services/asset-estimator';
import { readApiConfig } from '../lib/services/manual-accounts';

async function run() {
  const userId = 'alanracek';
  const apiConfig = await readApiConfig(userId);

  const purchasePrice = 924500;
  const purchaseDate = '2023-06-20';
  const currentValue = 1148600;
  const zipCode = '98014';

  console.log('Running estimateRealEstateHistory...');
  const snapshots = await estimateRealEstateHistory(purchasePrice, purchaseDate, currentValue, zipCode, apiConfig);

  console.log(`Returned ${snapshots.length} snapshots:`);
  for (const s of snapshots) {
    console.log(`- Date: ${s.date}, Value: ${s.value}`);
  }

  process.exit(0);
}

run().catch(console.error);
