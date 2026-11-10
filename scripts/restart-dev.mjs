import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';

export function killRunningDevServers() {
  const currentPid = process.pid;
  const parentPid = process.ppid;
  let killed = 0;

  if (fs.existsSync('/proc')) {
    try {
      for (const pidStr of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(pidStr)) continue;
        const pid = parseInt(pidStr, 10);
        if (pid === currentPid || pid === parentPid) continue;

        try {
          const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
          if (cmd.includes('next-server') || (cmd.includes('next') && cmd.includes('dev'))) {
            try {
              process.kill(pid, 'SIGTERM');
              killed++;
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }
  return killed;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
  });
}

async function main() {
  const killed = killRunningDevServers();
  if (killed > 0) {
    console.log(`Stopped ${killed} existing dev process(es). Waiting for port 3001 to clear...`);
  } else {
    console.log('No running dev servers found.');
  }

  // Wait for port 3001 to be completely released
  for (let i = 0; i < 20; i++) {
    const inUse = await isPortInUse(3001);
    if (!inUse) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('Starting dev server on port 3001...');
  if (process.argv.includes('--foreground')) {
    const child = spawn('pnpm', ['dev'], { stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
    return;
  }

  const logFd = fs.openSync('/tmp/dev-server.log', 'a');
  const child = spawn('pnpm', ['dev'], {
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  child.unref();
  try {
    fs.closeSync(logFd);
  } catch {}

  const start = Date.now();
  while (Date.now() - start < 60_000) {
    if (await isPortInUse(3001)) {
      console.log(`Dev server listening on http://localhost:3001 (PID ${child.pid}, logs: /tmp/dev-server.log).`);
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.error('Timed out waiting for dev server to listen on port 3001. Check /tmp/dev-server.log.');
  process.exit(1);
}

// If invoked directly, run main()
if (process.argv[1]?.endsWith('restart-dev.mjs')) {
  main();
}
