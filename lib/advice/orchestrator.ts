import { z } from 'zod';
import { streamChat, type ResolvedProvider } from '@/lib/ai/client';
import { extractJsonObject } from '@/lib/ai/json';
import { getPack } from './packs';
import { buildAdvicePromptMessages, type PackBuildResult } from './prompt';
import { getAdviceSnapshot } from './snapshot';
import { selectPacks, type PageContext } from './router';
import { ADVICE_CONFIG, getTokenBudgets } from './config';
import type { FinanceContext } from '@/lib/finance/context';

const NeedSchema = z.object({
  packs: z.array(
    z.object({
      id: z.string(),
      params: z.unknown().optional(),
    })
  ),
});

export type OrchestratorEvent =
  | { type: 'status'; phase: 'gathering' | 'thinking' | 'fetching_more' | 'answering' }
  | { type: 'sources'; items: Array<{ packId: string; label: string; period?: string; href: string }> }
  | { type: 'token'; text: string }
  | { type: 'done'; model: string; servedModel?: string; providerCalls: 1 | 2 }
  | { type: 'error'; code: string; message: string };

export interface RunOrchestratorArgs {
  ctx: FinanceContext;
  provider: ResolvedProvider;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  page?: PageContext;
  explicitPacks?: Array<{ id: string; params?: unknown }>;
  sessionPacks?: Array<{ id: string; params?: unknown }>;
  signal?: AbortSignal;
}

export async function* runAdviceOrchestrator(
  args: RunOrchestratorArgs
): AsyncGenerator<OrchestratorEvent> {
  const { ctx, provider, messages, page, explicitPacks, sessionPacks, signal } = args;

  let providerCalls = 0;
  const maxAllowedCalls = 2;
  const tokenProfile = (ctx.settings as any)?.aiAdviceTokenProfile || (ctx.settings as any)?.aiAskTokenProfile;
  const budgets = getTokenBudgets(tokenProfile);

  // 1. Status: gathering
  yield { type: 'status', phase: 'gathering' };

  const currentQuestion = messages[messages.length - 1]?.content || '';
  const history = messages.slice(0, messages.length - 1);

  // Load snapshot (cached 5 min) and initial packs
  const snapshotText = await getAdviceSnapshot(ctx);

  const initialSelections = selectPacks({
    userMessage: currentQuestion,
    page,
    explicitPacks,
    sessionPacks,
    now: ctx.now,
  });

  const packResults: PackBuildResult[] = [];
  const includedPackIds = new Set<string>();

  for (const entry of initialSelections) {
    try {
      const built = await entry.pack.build(ctx, entry.params);
      packResults.push({
        id: entry.id,
        pack: entry.pack,
        text: built.text,
        period: built.period,
        source: entry.source,
      });
      includedPackIds.add(entry.id);
    } catch {
      // Gracefully continue if a single pack build errors
    }
  }

  // Helper to emit sources
  const emitSources = (packs: PackBuildResult[]) => {
    const items = packs.map((p) => ({
      packId: p.id,
      label: p.pack.label,
      period: p.period,
      href: p.pack.href(p.pack.paramsSchema.safeParse({}).data ?? {}),
    }));
    return { type: 'sources' as const, items };
  };

  yield emitSources(packResults);
  yield { type: 'status', phase: 'thinking' };

  // Guard provider call count
  if (providerCalls >= maxAllowedCalls) {
    throw new Error('Maximum provider calls exceeded');
  }
  providerCalls++;

  const call1Messages = buildAdvicePromptMessages({
    ctx,
    snapshotText,
    packResults,
    history,
    currentQuestion,
    includeCatalog: true,
  });

  let servedModel: string | undefined;
  let buffer = '';
  let flushed = false;
  let isNeedRequest = false;

  const chatStream = streamChat({
    provider,
    messages: call1Messages,
    temperature: ADVICE_CONFIG.DEFAULT_TEMPERATURE,
    maxTokens: budgets.outputMaxTokens,
    signal,
  });

  for await (const ev of chatStream) {
    if (signal?.aborted) return;

    if (ev.type === 'meta') {
      if (ev.servedModel) servedModel = ev.servedModel;
      continue;
    }

    if (ev.type === 'text') {
      if (!flushed) {
        buffer += ev.text;
        const trimmed = buffer.trimStart();

        // Check if starting with @@NEED or {"packs"
        if (trimmed.startsWith('@@NEED') || trimmed.startsWith('{"packs"')) {
          isNeedRequest = true;
          // Keep buffering to parse complete JSON
          continue;
        }

        // If buffered non-whitespace characters are >= 16 and not @@NEED, flush buffer
        if (trimmed.length >= 16) {
          flushed = true;
          yield { type: 'status', phase: 'answering' };
          yield { type: 'token', text: buffer };
          buffer = '';
        }
      } else {
        // Stream tokens directly
        yield { type: 'token', text: ev.text };
      }
    }
  }

  // If buffer never reached 16 chars and was not @@NEED, flush now
  if (!flushed && !isNeedRequest && buffer.length > 0) {
    yield { type: 'status', phase: 'answering' };
    yield { type: 'token', text: buffer };
  }

  // ── Handle Call #2 if Call #1 requested more data (@@NEED) ──────────────────
  if (isNeedRequest) {
    yield { type: 'status', phase: 'fetching_more' };

    const parsedJson = extractJsonObject(buffer);
    const needParsed = NeedSchema.safeParse(parsedJson);

    let newPacksAdded = false;
    if (needParsed.success) {
      const requestedPacks = needParsed.data.packs
        .filter((p) => !includedPackIds.has(p.id))
        .slice(0, 3);

      for (const req of requestedPacks) {
        const pack = getPack(req.id);
        if (pack) {
          try {
            const validParams = pack.paramsSchema.safeParse(req.params).data ?? {};
            const built = await pack.build(ctx, validParams);
            packResults.push({
              id: pack.id,
              pack,
              text: built.text,
              period: built.period,
              source: 'keyword',
            });
            includedPackIds.add(pack.id);
            newPacksAdded = true;
          } catch {
            // Ignore individual pack build failure
          }
        }
      }
    }

    if (newPacksAdded) {
      yield emitSources(packResults);
    }

    // Call #2 guard
    if (providerCalls >= maxAllowedCalls) {
      throw new Error('Maximum provider calls exceeded');
    }
    providerCalls++;

    const call2Messages = buildAdvicePromptMessages({
      ctx,
      snapshotText,
      packResults,
      history,
      currentQuestion,
      includeCatalog: false,
      extraInstruction: 'Answer now. Do not request more data.',
    });

    yield { type: 'status', phase: 'answering' };

    let call2Buffer = '';
    let call2Flushed = false;
    let call2IsNeed = false;

    const call2Stream = streamChat({
      provider,
      messages: call2Messages,
      temperature: ADVICE_CONFIG.DEFAULT_TEMPERATURE,
      maxTokens: budgets.outputMaxTokens,
      signal,
    });

    for await (const ev of call2Stream) {
      if (signal?.aborted) return;

      if (ev.type === 'meta') {
        if (ev.servedModel) servedModel = ev.servedModel;
        continue;
      }

      if (ev.type === 'text') {
        if (!call2Flushed) {
          call2Buffer += ev.text;
          const trimmed = call2Buffer.trimStart();
          if (trimmed.startsWith('@@NEED') || trimmed.startsWith('{"packs"')) {
            call2IsNeed = true;
            continue;
          }
          if (trimmed.length >= 16) {
            call2Flushed = true;
            yield { type: 'token', text: call2Buffer };
            call2Buffer = '';
          }
        } else {
          yield { type: 'token', text: ev.text };
        }
      }
    }

    if (call2IsNeed) {
      // If call #2 still returned @@NEED, emit fallback text
      yield { type: 'token', text: "I couldn't get the data needed for that question." };
    } else if (!call2Flushed && call2Buffer.length > 0) {
      yield { type: 'token', text: call2Buffer };
    }
  }

  yield {
    type: 'done',
    model: provider.model,
    servedModel,
    providerCalls: providerCalls as 1 | 2,
  };
}

export const runAskOrchestrator = runAdviceOrchestrator;
