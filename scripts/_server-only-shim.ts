import Module from 'node:module';
import dotenv from 'dotenv';

dotenv.config({ path: 'tmp/.ui-credentials.env', quiet: true });
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

const mod = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = mod._load;
mod._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'server-only') {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
