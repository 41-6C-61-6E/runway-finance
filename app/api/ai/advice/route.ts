import { z } from 'zod';
import { withAuthAndDek } from '@/lib/utils/require-auth';
import { buildFinanceContext } from '@/lib/finance/context';
import { resolveAiProvider, AiClientError } from '@/lib/ai/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { ADVICE_CONFIG } from '@/lib/advice/config';
import { runAdviceOrchestrator } from '@/lib/advice/orchestrator';
import { logger } from '@/lib/logger';

export const maxDuration = 120;

const AdviceRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(30),
  page: z
    .object({
      path: z.string(),
      planId: z.string().uuid().optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    })
    .optional(),
  packs: z
    .array(
      z.object({
        id: z.string(),
        params: z.unknown().optional(),
      })
    )
    .max(3)
    .optional(),
  sessionPacks: z
    .array(
      z.object({
        id: z.string(),
        params: z.unknown().optional(),
      })
    )
    .max(5)
    .optional(),
});

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseErrorResponse(code: string, message: string, status = 200): Response {
  return new Response(sseEvent('error', { code, message }), {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

export const POST = withAuthAndDek(async (req, { userId, dek }) => {
  const startTime = Date.now();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return sseErrorResponse('invalid_request', 'Invalid JSON body', 400);
  }

  const parseResult = AdviceRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues[0]?.message || 'Invalid request structure';
    return sseErrorResponse('invalid_request', issueMsg, 400);
  }

  const { messages, page, packs, sessionPacks } = parseResult.data;

  // The last message must be from the user
  if (messages[messages.length - 1].role !== 'user') {
    return sseErrorResponse('invalid_request', 'Last message must be from user', 400);
  }

  // Validate path if provided
  if (page?.path) {
    const cleanPath = page.path.split('?')[0];
    const isAllowed = (ADVICE_CONFIG.ALLOWLISTED_PATHS as readonly string[]).includes(cleanPath);
    if (!isAllowed) {
      return sseErrorResponse('invalid_request', 'Disallowed page path', 400);
    }
  }

  const ctx = await buildFinanceContext({ userId, dek });

  // Gate 1: aiEnabled & aiAdviceEnabled
  const adviceEnabled = ctx.settings.aiAdviceEnabled ?? (ctx.settings as any).aiAskEnabled;
  if (ctx.settings.aiEnabled === false || adviceEnabled === false) {
    return sseErrorResponse('not_available', 'Advice is disabled in settings');
  }

  // Gate 2: provider resolves
  const provider = await resolveAiProvider(userId, dek);
  if (!provider) {
    return sseErrorResponse('not_configured', 'No AI provider configured');
  }

  // Allow optional model override from settings
  const modelOverride = ctx.settings.aiAdviceModel ?? (ctx.settings as any).aiAskModel;
  if (modelOverride) {
    provider.model = modelOverride;
  }

  // Gate 4: consent given for current provider host
  const consentHost = ctx.settings.aiAdviceConsentHost ?? (ctx.settings as any).aiAskConsentHost;
  if (consentHost !== provider.host) {
    return sseErrorResponse('consent_required', `Consent required for host: ${provider.host}`);
  }

  // Gate 5: app rate limits (15/10min and 100/day)
  const isAllowedShort = await checkRateLimit(
    `advice:${userId}`,
    ADVICE_CONFIG.RATE_LIMIT_SHORT_MAX,
    ADVICE_CONFIG.RATE_LIMIT_SHORT_WINDOW_MS
  );
  if (!isAllowedShort) {
    return sseErrorResponse('rate_limited', 'You have reached the short-term question limit. Please wait a few minutes.');
  }

  const isAllowedDay = await checkRateLimit(
    `advice-day:${userId}`,
    ADVICE_CONFIG.RATE_LIMIT_DAY_MAX,
    ADVICE_CONFIG.RATE_LIMIT_DAY_WINDOW_MS
  );
  if (!isAllowedDay) {
    return sseErrorResponse('rate_limited', 'You have reached the daily question limit. Please try again tomorrow.');
  }

  // Stream execution via orchestrator
  const encoder = new TextEncoder();
  let doneProviderCalls: 1 | 2 = 1;
  let doneModel = provider.model;
  let doneServedModel: string | undefined;
  const sourcesPacks: string[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAdviceOrchestrator({
          ctx,
          provider,
          messages,
          page,
          explicitPacks: packs,
          sessionPacks,
          signal: req.signal,
        })) {
          if (req.signal.aborted) {
            controller.close();
            return;
          }

          if (ev.type === 'status') {
            controller.enqueue(encoder.encode(sseEvent('status', { phase: ev.phase })));
          } else if (ev.type === 'sources') {
            for (const item of ev.items) {
              if (!sourcesPacks.includes(item.packId)) sourcesPacks.push(item.packId);
            }
            controller.enqueue(encoder.encode(sseEvent('sources', { items: ev.items })));
          } else if (ev.type === 'token') {
            controller.enqueue(encoder.encode(sseEvent('token', { text: ev.text })));
          } else if (ev.type === 'done') {
            doneModel = ev.model;
            doneServedModel = ev.servedModel;
            doneProviderCalls = ev.providerCalls;
            controller.enqueue(
              encoder.encode(
                sseEvent('done', {
                  model: ev.model,
                  servedModel: ev.servedModel,
                  providerCalls: ev.providerCalls,
                })
              )
            );
          } else if (ev.type === 'error') {
            controller.enqueue(encoder.encode(sseEvent('error', { code: ev.code, message: ev.message })));
          }
        }
        controller.close();

        // Safe telemetry logging — never log message content or response text!
        logger.info('[advice] answered', {
          userId,
          packs: sourcesPacks,
          providerCalls: doneProviderCalls,
          model: doneModel,
          servedModel: doneServedModel,
          ms: Date.now() - startTime,
        });
      } catch (err) {
        const code = err instanceof AiClientError ? err.code : 'provider_error';
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(sseEvent('error', { code, message })));
        controller.close();

        logger.warn('[advice] stream failed', {
          userId,
          code,
          ms: Date.now() - startTime,
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
