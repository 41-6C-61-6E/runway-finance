// Delegates Node.js-only initialization to instrumentation-node.ts.
// Next.js 16 runs instrumentation in both Node.js and Edge runtimes,
// so Node.js-only modules (pg, node-cron, fs, path, crypto) must be
// imported only when NEXT_RUNTIME === 'nodejs'.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeInstrumentation } = await import('./instrumentation-node');
    await registerNodeInstrumentation();
  }
}
