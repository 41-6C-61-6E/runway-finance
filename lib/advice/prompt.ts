import type { ChatMessage } from '@/lib/ai/client';
import { ADVICE_CONFIG, estimateTokens, getTokenBudgets } from './config';
import { ADVICE_SYSTEM_PROMPT } from './prompts';
import { getPackCatalogText } from './packs';
import { formatInTimezone } from '@/lib/utils/timeframe';
import type { FinanceContext } from '@/lib/finance/context';
import type { AdvicePack } from './packs';

export interface PackBuildResult {
  id: string;
  pack: AdvicePack;
  text: string;
  period?: string;
  source: 'explicit' | 'page' | 'keyword' | 'session';
}

export interface BuildPromptArgs {
  ctx: FinanceContext;
  snapshotText: string;
  packResults: PackBuildResult[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentQuestion: string;
  includeCatalog?: boolean;
  extraInstruction?: string;
}

/**
 * Assembles the full ChatMessage array with token budget enforcement.
 */
export function buildAdvicePromptMessages(args: BuildPromptArgs): ChatMessage[] {
  const {
    ctx,
    snapshotText,
    packResults,
    history,
    currentQuestion,
    includeCatalog = true,
    extraInstruction,
  } = args;

  const userTz = ctx.settings?.timezone || 'America/New_York';
  const asOfStr = formatInTimezone(ctx.now, userTz);
  const tokenProfile = (ctx.settings as any)?.aiAdviceTokenProfile || (ctx.settings as any)?.aiAskTokenProfile;
  const budgets = getTokenBudgets(tokenProfile);

  // 1. Financial data block assembly
  let packsToInclude = [...packResults];

  const buildDataBlock = (packs: PackBuildResult[]) => {
    const dataLines: string[] = [`<financial_data as_of="${asOfStr}">`];
    dataLines.push(snapshotText);

    for (const p of packs) {
      const periodStr = p.period ? ` (${p.period})` : '';
      dataLines.push(`\n## Pack: ${p.id}${periodStr}\n${p.text}`);
    }

    dataLines.push('</financial_data>');
    return dataLines.join('\n');
  };

  // 2. Trim packs if total pack tokens exceed budget
  let currentPacksTokens = packsToInclude.reduce((sum, p) => sum + estimateTokens(p.text), 0);
  if (currentPacksTokens > budgets.packsBudget) {
    // Drop lowest-priority packs first: session before keyword before page before explicit
    const priorityWeight = { session: 0, keyword: 1, page: 2, explicit: 3 };
    packsToInclude.sort((a, b) => priorityWeight[b.source] - priorityWeight[a.source]);

    while (packsToInclude.length > 1 && currentPacksTokens > budgets.packsBudget) {
      const dropped = packsToInclude.pop();
      if (dropped) {
        currentPacksTokens -= estimateTokens(dropped.text);
      }
    }
  }

  let financialDataBlock = buildDataBlock(packsToInclude);

  // 3. System block assembly
  const systemSections: string[] = [ADVICE_SYSTEM_PROMPT.trim(), financialDataBlock];
  if (includeCatalog) {
    systemSections.push(getPackCatalogText());
  }
  if (extraInstruction) {
    systemSections.push(extraInstruction);
  }

  const systemContent = systemSections.join('\n\n');

  // 4. Sanitize and trim history to HISTORY_BUDGET
  let trimmedHistory = [...history];
  let historyTokens = trimmedHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  while (trimmedHistory.length > 0 && historyTokens > budgets.historyBudget) {
    const removed = trimmedHistory.shift();
    if (removed) {
      historyTokens -= estimateTokens(removed.content);
    }
  }

  // 5. Total token budget check
  const systemTokens = estimateTokens(systemContent);
  const questionTokens = estimateTokens(currentQuestion);
  let totalInputTokens = systemTokens + historyTokens + questionTokens;

  // If still exceeding overall input budget, drop older history entirely
  if (totalInputTokens > budgets.inputTokenBudget && trimmedHistory.length > 0) {
    while (trimmedHistory.length > 0 && totalInputTokens > budgets.inputTokenBudget) {
      const removed = trimmedHistory.shift();
      if (removed) {
        totalInputTokens -= estimateTokens(removed.content);
      }
    }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...trimmedHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: currentQuestion },
  ];

  return messages;
}

export const buildAskPromptMessages = buildAdvicePromptMessages;
