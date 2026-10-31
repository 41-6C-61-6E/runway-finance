import { NextResponse } from 'next/server';
import { withAuthAndDek } from '@/lib/utils/require-auth';
import { buildFinanceContext } from '@/lib/finance/context';
import { getAdviceSnapshot } from '@/lib/advice/snapshot';
import { selectPacks } from '@/lib/advice/router';
import { formatInTimezone } from '@/lib/utils/timeframe';

export const GET = withAuthAndDek(async (req, { userId, dek }) => {
  const ctx = await buildFinanceContext({ userId, dek });
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || undefined;

  const snapshotText = await getAdviceSnapshot(ctx);
  const userTz = ctx.settings?.timezone || 'America/New_York';
  const asOfStr = formatInTimezone(ctx.now, userTz);

  const lines: string[] = [`<financial_data as_of="${asOfStr}">`, snapshotText];

  if (path) {
    const packs = selectPacks({
      userMessage: '',
      page: { path },
      now: ctx.now,
    });

    for (const p of packs) {
      try {
        const built = await p.pack.build(ctx, p.params);
        const periodStr = built.period ? ` (${built.period})` : '';
        lines.push(`\n## Pack: ${p.id}${periodStr}\n${built.text}`);
      } catch {
        // Skip errored pack preview
      }
    }
  }

  lines.push('</financial_data>');

  return NextResponse.json({ text: lines.join('\n') });
});
