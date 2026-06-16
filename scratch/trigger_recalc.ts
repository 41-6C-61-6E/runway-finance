import 'dotenv/config';
import { recalculateAllSnapshots } from '../lib/services/startup-recalculation';

async function main() {
  console.log('Starting full snapshot recalculation...');
  await recalculateAllSnapshots();
  console.log('Recalculation complete.');
}

main().catch(console.error);
