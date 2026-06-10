import 'dotenv/config';
import { recalculateAllSnapshots } from '../lib/services/startup-recalculation';

async function main() {
  console.log("Starting manual recalculation of all snapshots...");
  try {
    await recalculateAllSnapshots();
    console.log("Manual recalculation finished successfully!");
  } catch (err) {
    console.error("Error during manual recalculation:", err);
  }
  process.exit(0);
}

main();
