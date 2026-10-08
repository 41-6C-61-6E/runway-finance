import { killRunningDevServers } from './restart-dev.mjs';

const killed = killRunningDevServers();
if (killed > 0) {
  console.log(`Stopped ${killed} existing dev process(es).`);
} else {
  console.log('No running dev servers found.');
}
