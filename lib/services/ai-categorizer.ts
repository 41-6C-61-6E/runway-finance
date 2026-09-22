import { getDb } from '@/lib/db';
import { resolveDataUserId } from '@/lib/sharing';
import { transactions, categories as categoriesTable, categoryRules, userSettings, aiProposals, accounts, aiProviders } from '@/lib/db/schema';
import { eq, and, or, isNull, asc, gt, inArray, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, decryptRows, decryptField, encryptField } from '@/lib/crypto';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { buildModelParams, isOpenRouterEndpoint, parseStoredFallbacks } from '@/lib/ai/endpoints';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { findDuplicateRule } from '@/lib/services/rules-engine';
import { fetchSecure, validateEndpointUrl } from '@/lib/utils/ssrf';

const LOG_TAG = '[ai-categorizer]';
// Adaptive per-batch timeout so slower models (~20 tok/s) aren't killed:
// output grows ~120 tokens per transaction, plus prefill and a cold model
// load on the first batch.
const BATCH_TIMEOUT_BASE_MS = 2 * 60 * 1000;
const BATCH_TIMEOUT_PER_TXN_MS = 30 * 1000;
const FIRST_BATCH_EXTRA_MS = 3 * 60 * 1000;
const BATCH_TIMEOUT_MAX_MS = 30 * 60 * 1000;

function batchTimeoutMs(batchSize: number, isFirstBatch: boolean): number {
  const timeout =
    BATCH_TIMEOUT_BASE_MS +
    Math.max(1, batchSize) * BATCH_TIMEOUT_PER_TXN_MS +
    (isFirstBatch ? FIRST_BATCH_EXTRA_MS : 0);
  return Math.min(timeout, BATCH_TIMEOUT_MAX_MS);
}
const activeAiAnalysisUsers = new Set<string>();

type TransactionInfo = {
  index: number;
  id: string;
  description: string;
  payee: string | null;
  memo: string | null;
  amount: string;
  date: string;
  accountType: string | null;
};

type CategoryInfo = {
  id: string;
  name: string;
  parentName: string | null;
  parentId: string | null;
  color: string;
  isIncome: boolean;
};

type RuleInfo = {
  name: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  setCategoryName: string | null;
};

type AiSuggestion =
  | { type: 'categorize'; transactionIndex: number; categoryId: string | null; categoryName: string | null; confidence: number; explanation: string }
  | { type: 'create_category'; name: string; parentName: string | null; isIncome: boolean; color: string; reasoning: string; confidence: number; explanation: string }
  | { type: 'create_rule'; ruleName: string; conditionField: string; conditionOperator: string; conditionValue: string; conditionCaseSensitive: boolean; setCategoryName: string | null; confidence: number; explanation: string };

type AiResponse = {
  suggestions: AiSuggestion[];
  /** Model that actually served the request (OpenRouter failover/reporting). */
  servedModel?: string;
};

export async function analyzeUncategorized(
  userId: string,
  onProgress?: (processedCount: number, totalCount: number | null) => void,
  onLog?: (message: string) => void,
  abortController?: AbortController,
  dekOverride?: Uint8Array,
): Promise<{ proposalsCreated: number; autoApproved: number; errors: string[] }> {
  if (activeAiAnalysisUsers.has(userId)) {
    logger.info(`${LOG_TAG} Analysis already in progress for user, skipping duplicate run`, { userId });
    onLog?.('Analysis already in progress for this user.');
    return { proposalsCreated: 0, autoApproved: 0, errors: ['Analysis already in progress'] };
  }
  activeAiAnalysisUsers.add(userId);

  const db = getDb();
  const errors: string[] = [];

  try {
    onLog?.('Loading encryption key and user settings...');
    const userSettingsRow = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!userSettingsRow.length) {
      const msg = 'User settings not found';
      onLog?.(`Error: ${msg}`);
      return { proposalsCreated: 0, autoApproved: 0, errors: [msg] };
    }

    const settings = userSettingsRow[0];
    const dataUserId = await resolveDataUserId(userId);
    // Accept an explicit DEK so background runs kicked off from sync jobs
    // don't depend on request-scoped auth after the response completes.
    const dek = dekOverride ?? await getSessionDEK();

    // Enforce the deployment-wide provider (env vars win over saved settings).
    try {
      const { seedUserAiProviders } = await import('@/lib/db/seed-ai-providers');
      await seedUserAiProviders(userId, dek);
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to enforce env AI provider`, { userId, error: String(err) });
    }

    onLog?.('Resolving AI provider configuration...');
    // Single provider per user: prefer the session user's own config
    // (their API key), falling back to the household's. Legacy rows may
    // have isActive=false, so prefer active but accept any row.
    const pickProvider = (rows: typeof aiProviders.$inferSelect[]) =>
      rows.find((r) => r.isActive) ?? rows[0];
    const ownProviderRows = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.userId, userId))
      .limit(10);

    let activeProvider;
    const ownPick = pickProvider(ownProviderRows);
    if (ownPick) {
      activeProvider = ownPick;
      logger.info(`${LOG_TAG} AI provider resolved from own config`, { userId });
    } else {
      const householdProviderRows = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.userId, dataUserId))
        .limit(10);

      const householdPick = pickProvider(householdProviderRows);
      if (!householdPick) {
        const msg = 'No AI provider configured. Add one in Settings → AI Suggestions.';
        onLog?.(`Error: ${msg}`);
        return { proposalsCreated: 0, autoApproved: 0, errors: [msg] };
      }

      activeProvider = householdPick;
      logger.info(`${LOG_TAG} AI provider fell back to household primary config`, { userId, dataUserId });
    }
    const endpoint = activeProvider.endpoint;
    const model = activeProvider.model;
    const fallbacks = parseStoredFallbacks(activeProvider.fallbackModels);

    // Validate endpoint URL against SSRF
    const validation = await validateEndpointUrl(endpoint);
    if (!validation.ok) {
      const msg = `AI provider endpoint is invalid or blocked: ${validation.error}`;
      onLog?.(`Error: ${msg}`);
      logger.error(`${LOG_TAG} Blocked request to invalid AI endpoint`, { endpoint, error: validation.error });
      return { proposalsCreated: 0, autoApproved: 0, errors: [msg] };
    }

    let apiKey = '';
    if (activeProvider.apiKeyEncrypted) {
      apiKey = await decryptField(activeProvider.apiKeyEncrypted, dek);
    }

    onLog?.('Fetching categories and rules...');
    const categoryRows = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, dataUserId));

    const decryptedCategories = await decryptRows('categories', categoryRows, dek);
    const categoryMap = new Map(decryptedCategories.map((c) => [c.id, c.name]));

    const categories: CategoryInfo[] = decryptedCategories.map((c) => ({
      id: c.id,
      name: c.name,
      parentName: c.parentId ? categoryMap.get(c.parentId) ?? null : null,
      parentId: c.parentId,
      color: c.color,
      isIncome: c.isIncome,
    }));

    const ruleRows = await db
      .select()
      .from(categoryRules)
      .where(
        and(
          eq(categoryRules.userId, dataUserId),
          eq(categoryRules.isActive, true)
        )
      );

    const decryptedRules = await decryptRows('category_rules', ruleRows, dek);
    const rules: RuleInfo[] = decryptedRules.map((r) => ({
      name: r.name,
      conditionField: r.conditionField,
      conditionOperator: r.conditionOperator,
      conditionValue: r.conditionValue,
      setCategoryName: r.setCategoryId ? categoryMap.get(r.setCategoryId) ?? null : null,
    }));

    onLog?.('Counting uncategorized transactions...');
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(
        and(
          eq(transactions.userId, dataUserId),
          isNull(transactions.categoryId),
          eq(transactions.deleted, false),
          or(
            and(
              eq(accounts.isHidden, false),
              eq(accounts.isExcludedFromNetWorth, false)
            ),
            eq(accounts.type, 'paystub')
          )
        )
      );
    const totalUncategorized = Number(countResult[0]?.count ?? 0);
    onProgress?.(0, totalUncategorized);
    onLog?.(`Found ${totalUncategorized} uncategorized transaction(s)`);

    const batchSize = settings.aiBatchSize ?? 100;
    const autoApproveThreshold = settings.aiAutoApproveThreshold ?? 95;
    // Overall deadline (previously a settings field that nothing enforced).
    const analysisTimeoutSeconds = Math.min(
      Math.max(settings.aiAnalysisTimeoutSeconds ?? 3600, 60),
      3600
    );
    const deadline = Date.now() + analysisTimeoutSeconds * 1000;
    onLog?.(
      `Budget: ${analysisTimeoutSeconds}s overall, ~${Math.round(batchTimeoutMs(batchSize, true) / 1000)}s for the first batch of ${batchSize} then ~${Math.round(batchTimeoutMs(batchSize, false) / 1000)}s per batch.`
    );
    let proposalsCreated = 0;
    let autoApproved = 0;
    let processedCount = 0;
    let cursorDate: string | null = null;
    let cursorId: string | null = null;
    let hasMore = true;
    let batchNum = 1;

    while (hasMore) {
      // Check if analysis has been aborted
      if (abortController?.signal.aborted) {
        onLog?.('Analysis cancelled by user');
        break;
      }

      // Enforce the overall analysis timeout so slow models stop gracefully
      // instead of running unbounded.
      if (Date.now() > deadline) {
        const msg = `Analysis timeout after ${analysisTimeoutSeconds}s — stopping with ${proposalsCreated} proposal(s) so far. Raise the analysis timeout in Settings → AI Suggestions → Automation for slower models.`;
        onLog?.(msg);
        errors.push(msg);
        logger.warn(`${LOG_TAG} Analysis timeout reached`, { userId, proposalsCreated });
        break;
      }

      const cursorConditions = [];
      if (cursorDate !== null && cursorId !== null) {
        cursorConditions.push(
          or(
            gt(transactions.date, cursorDate),
            and(eq(transactions.date, cursorDate), gt(transactions.id, cursorId))
          )
        );
      }

      const txnRows = await db
        .select({
          transaction: transactions,
          account: accounts,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            eq(transactions.userId, dataUserId),
            isNull(transactions.categoryId),
            eq(transactions.deleted, false),
            or(
              and(
                eq(accounts.isHidden, false),
                eq(accounts.isExcludedFromNetWorth, false)
              ),
              eq(accounts.type, 'paystub')
            ),
            ...cursorConditions
          )
        )
        .orderBy(asc(transactions.date), asc(transactions.id))
        .limit(batchSize);

      if (txnRows.length === 0) {
        break;
      }

      // Update cursor to last item in current batch
      const lastRow = txnRows[txnRows.length - 1];
      cursorDate = lastRow.transaction.date;
      cursorId = lastRow.transaction.id;

      // Parallel batch decryption for fast throughput
      const decryptedTxns: TransactionInfo[] = await Promise.all(
        txnRows.map(async (row, i) => {
          const tx = await decryptRow('transactions', row.transaction, dek);
          let accountType: string | null = null;
          if (row.account?.type) {
            accountType = await decryptField(row.account.type, dek);
          }
          return {
            index: i + 1,
            id: tx.id,
            description: tx.description,
            payee: tx.payee,
            memo: tx.memo,
            amount: tx.amount,
            date: tx.date,
            accountType,
          };
        })
      );

      const prompt = buildPrompt(categories, rules, decryptedTxns);
      const systemPrompt = settings.aiSystemPrompt || SYSTEM_PROMPT;
      onLog?.(`Batch ${batchNum}: Prepared prompt with ${decryptedTxns.length} transaction(s).`);

      // Per-batch AbortController with a timeout scaled to the batch size
      // (slow models need minutes per batch, plus cold-start on batch 1).
      const perBatchTimeout = batchTimeoutMs(batchSize, batchNum === 1);
      const batchAbortController = new AbortController();
      const batchTimeoutId = setTimeout(() => {
        batchAbortController.abort();
      }, perBatchTimeout);

      // Propagate main cancel signal to per-batch controller
      const onMainAbort = () => {
        if (!batchAbortController.signal.aborted) {
          batchAbortController.abort();
        }
      };
      abortController?.signal.addEventListener('abort', onMainAbort);

      try {
        const batchStart = Date.now();
        logger.info(`${LOG_TAG} Calling AI API (batch ${batchNum})`, { userId, endpoint, model, transactionCount: decryptedTxns.length, usingCustomPrompt: !!settings.aiSystemPrompt });
        onLog?.(`Batch ${batchNum}: Calling model (${model}). Waiting for response...`);
        const aiResponse = await callAiApi(endpoint, model, apiKey, prompt, systemPrompt, batchAbortController.signal, fallbacks);

        const { suggestions } = aiResponse;
        const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
        const servedNote = aiResponse.servedModel && aiResponse.servedModel !== model ? ` served by ${aiResponse.servedModel}` : '';
        onLog?.(`Batch ${batchNum}: Received response from ${model} in ${elapsed}s${servedNote}. Found ${suggestions.length} suggestion(s).`);
        logger.info(`${LOG_TAG} Received ${suggestions.length} suggestions from AI (batch ${batchNum})`, { userId, servedModel: aiResponse.servedModel });

        let batchProposals = 0;
        let batchAutoApproved = 0;

        for (const suggestion of suggestions) {
          const payload = buildPayload(suggestion, decryptedTxns, categories);
          if (!payload) {
            errors.push(`Invalid suggestion: ${JSON.stringify(suggestion).slice(0, 200)}`);
            continue;
          }

          const shouldAutoApprove = settings.aiAutoApprove && (suggestion.confidence * 100) >= autoApproveThreshold;
          const status = shouldAutoApprove ? 'approved' : 'pending';
          const confidenceStr = String(Math.round(suggestion.confidence * 100));

          await db.insert(aiProposals).values({
            userId: dataUserId,
            type: suggestion.type,
            status,
            confidence: confidenceStr,
            payload: payload as any,
            explanation: suggestion.explanation,
          });

          batchProposals++;
          if (shouldAutoApprove) batchAutoApproved++;
        }

        proposalsCreated += batchProposals;
        autoApproved += batchAutoApproved;

        if (batchAutoApproved > 0) {
          onLog?.(`Batch ${batchNum}: Applying ${batchAutoApproved} auto-approved suggestion(s) to database...`);
          await applyApprovedProposals(userId, dek);
        }

        processedCount += txnRows.length;
        onProgress?.(processedCount, totalUncategorized);
        onLog?.(`Batch ${batchNum}: Saved ${batchProposals} proposal(s) ${batchAutoApproved > 0 ? `(${batchAutoApproved} auto-approved)` : ''}.`);
        logger.info(`${LOG_TAG} Batch ${batchNum} complete`, { userId, batchProposals, batchAutoApproved });
      } catch (err) {
        if (abortController?.signal.aborted) {
          onLog?.('Analysis cancelled by user');
          break;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          const sizeHint = batchSize <= 5
            ? ' The model may be stalled or extremely slow — check the provider logs and that the model isn’t still loading.'
            : ' Lower the batch size in Settings → AI Suggestions → Automation for slower models.';
          const msg = `Batch ${batchNum} timed out after ${Math.round(perBatchTimeout / 1000)}s, skipping ${txnRows.length} transaction(s).${sizeHint}`;
          onLog?.(msg);
          errors.push(msg);
        } else {
          const errMsg = err instanceof Error ? err.message : String(err);
          const msg = `Batch ${batchNum} failed: ${errMsg}`;
          onLog?.(msg);
          errors.push(msg);
          logger.error(`${LOG_TAG} Batch ${batchNum} failed`, { userId, error: errMsg });
        }
      } finally {
        clearTimeout(batchTimeoutId);
        abortController?.signal.removeEventListener('abort', onMainAbort);
      }

      batchNum++;
      hasMore = txnRows.length >= batchSize;
    }

    onLog?.(`Done: ${proposalsCreated} proposal(s) created, ${autoApproved} auto-approved${errors.length > 0 ? `, ${errors.length} error(s)` : ''}`);
    logger.info(`${LOG_TAG} Analysis complete`, { userId, proposalsCreated, autoApproved, errors: errors.length });

    // Send push notification if there are new pending proposals
    const pendingCount = proposalsCreated - autoApproved;
    if (pendingCount > 0) {
      try {
        const [settings] = await db
          .select({
            notifyAiProposals: userSettings.notifyAiProposals,
          })
          .from(userSettings)
          .where(eq(userSettings.userId, userId))
          .limit(1);

        if (settings?.notifyAiProposals) {
          const { sendPushNotification } = await import('@/lib/services/notifications');
          const uniqueKey = `ai_proposals:${Date.now().toString().slice(0, -5)}`;
          await sendPushNotification(
            userId,
            `AI Proposals Ready`,
            `AI has generated ${pendingCount} new suggestion${pendingCount > 1 ? 's' : ''} for your transactions.`,
            '/transactions?aiSuggestions=true',
            'ai_proposals',
            uniqueKey
          );
        }
      } catch (err) {
        logger.error(`${LOG_TAG} Failed to send AI proposals notification:`, err);
      }
    }

    return { proposalsCreated, autoApproved, errors };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    onLog?.(`Critical Error: ${message}`);
    logger.error(`${LOG_TAG} Analysis failed`, { userId, error: message });
    return { proposalsCreated: 0, autoApproved: 0, errors: [message] };
  } finally {
    activeAiAnalysisUsers.delete(userId);
  }
}

/**
 * Analyze one uncategorized transaction on demand (per-row "Ask AI" button).
 * Always creates a `pending` proposal for review — never auto-approves.
 */
export async function analyzeSingleTransaction(
  userId: string,
  transactionId: string,
  dek: Uint8Array,
): Promise<{ proposalId: string; type: string; message: string }> {
  const db = getDb();
  const dataUserId = await resolveDataUserId(userId);

  const txnRows = await db
    .select({ transaction: transactions, account: accounts })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, dataUserId)))
    .limit(1);

  if (!txnRows.length) {
    throw new Error('Transaction not found');
  }
  const txnRow = txnRows[0];
  if (txnRow.transaction.categoryId) {
    throw new Error('Transaction is already categorized');
  }
  if (txnRow.transaction.deleted) {
    throw new Error('Transaction is deleted');
  }

  const tx = await decryptRow('transactions', txnRow.transaction, dek);
  let accountType: string | null = null;
  if (txnRow.account?.type) {
    accountType = await decryptField(txnRow.account.type, dek);
  }
  const txnInfo: TransactionInfo = {
    index: 1,
    id: tx.id,
    description: tx.description,
    payee: tx.payee,
    memo: tx.memo,
    amount: tx.amount,
    date: tx.date,
    accountType,
  };

  const categoryRows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, dataUserId));
  const decryptedCategories = await decryptRows('categories', categoryRows, dek);
  const categoryMap = new Map(decryptedCategories.map((c) => [c.id, c.name]));
  const categories: CategoryInfo[] = decryptedCategories.map((c) => ({
    id: c.id,
    name: c.name,
    parentName: c.parentId ? categoryMap.get(c.parentId) ?? null : null,
    parentId: c.parentId,
    color: c.color,
    isIncome: c.isIncome,
  }));

  const ruleRows = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, dataUserId), eq(categoryRules.isActive, true)));
  const decryptedRules = await decryptRows('category_rules', ruleRows, dek);
  const rules: RuleInfo[] = decryptedRules.map((r) => ({
    name: r.name,
    conditionField: r.conditionField,
    conditionOperator: r.conditionOperator,
    conditionValue: r.conditionValue,
    setCategoryName: r.setCategoryId ? categoryMap.get(r.setCategoryId) ?? null : null,
  }));

  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const systemPrompt = settingsRows[0]?.aiSystemPrompt || SYSTEM_PROMPT;

  const pickProvider = (rows: typeof aiProviders.$inferSelect[]) =>
    rows.find((r) => r.isActive) ?? rows[0];
  const ownRows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.userId, userId))
    .limit(10);
  let provider = pickProvider(ownRows);
  if (!provider) {
    const householdRows = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.userId, dataUserId))
      .limit(10);
    provider = pickProvider(householdRows);
  }
  if (!provider) {
    throw new Error('No AI provider configured. Add one in Settings → AI Suggestions.');
  }

  const validation = await validateEndpointUrl(provider.endpoint);
  if (!validation.ok) {
    throw new Error(`AI provider endpoint is invalid or blocked: ${validation.error}`);
  }

  let apiKey = '';
  if (provider.apiKeyEncrypted) {
    apiKey = await decryptField(provider.apiKeyEncrypted, dek);
  }

  const prompt = buildPrompt(categories, rules, [txnInfo]);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  let aiResponse: AiResponse;
  try {
    aiResponse = await callAiApi(
      provider.endpoint,
      provider.model,
      apiKey,
      prompt,
      systemPrompt,
      controller.signal,
      parseStoredFallbacks(provider.fallbackModels),
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const suggestion =
    aiResponse.suggestions.find((s) => s.type === 'categorize') ?? aiResponse.suggestions[0];
  if (!suggestion) {
    throw new Error('AI returned no suggestions for this transaction');
  }
  const payload = buildPayload(suggestion, [txnInfo], categories);
  if (!payload) {
    throw new Error('AI suggestion could not be matched to this transaction');
  }

  const [created] = await db
    .insert(aiProposals)
    .values({
      userId: dataUserId,
      type: suggestion.type,
      status: 'pending',
      confidence: String(Math.round(suggestion.confidence * 100)),
      payload: payload as any,
      explanation: suggestion.explanation,
    })
    .returning({ id: aiProposals.id });

  logger.info(`${LOG_TAG} Single-transaction suggestion created`, { userId, transactionId, type: suggestion.type, servedModel: aiResponse.servedModel });
  return {
    proposalId: created.id,
    type: suggestion.type,
    message: 'AI suggestion created — review it in AI Suggestions.',
  };
}

function buildPrompt(
  categories: CategoryInfo[],
  rules: RuleInfo[],
  transactions: TransactionInfo[],
): string {
  let prompt = '## Existing Categories\n\n';
  prompt += 'ID | Name | Parent | Type\n';
  prompt += '---|------|--------|----\n';
  for (const cat of categories) {
    prompt += `${cat.id} | ${cat.name} | ${cat.parentName ?? '-'} | ${cat.isIncome ? 'Income' : 'Expense'}\n`;
  }

  prompt += '\n## Active Rules\n\n';
  if (rules.length === 0) {
    prompt += '(none)\n';
  } else {
    for (const rule of rules) {
      prompt += `- "${rule.name}": if ${rule.conditionField} ${rule.conditionOperator} "${rule.conditionValue}" → ${rule.setCategoryName ?? 'no category'}\n`;
    }
  }

  prompt += '\n## Uncategorized Transactions\n\n';
  prompt += 'Index | Date | Description | Payee | Amount | Account Type\n';
  prompt += '------|------|-------------|-------|--------|-------------\n';
  for (const tx of transactions) {
    prompt += `${tx.index} | ${tx.date} | ${tx.description} | ${tx.payee ?? '-'} | ${tx.amount} | ${tx.accountType ?? '-'}\n`;
  }

  prompt += '\n## Instructions\n';
  prompt += 'Analyze the transactions above and suggest categorizations, new categories, and rules. ';
  prompt += 'For "categorize" suggestions, transactionIndex must be the 1-based Index matching the transaction from the table above. ';
  prompt += 'Use the category IDs from the table above when referencing existing categories. ';
  prompt += 'Output ONLY the JSON object — no reasoning, no preamble, no text outside the JSON.\n';

  return prompt;
}

function cleanJsonString(content: string): string {
  let clean = content;
  
  const stringKeys = [
    'explanation',
    'reasoning',
    'ruleName',
    'conditionValue',
    'name',
    'parentName',
    'categoryName',
    'color',
    'categoryId'
  ];
  
  for (const key of stringKeys) {
    const regex = new RegExp(`("${key}"\\s*:\\s*")([\\s\\S]*?)("\\s*(?=,|\\n|\\}))`, 'g');
    clean = clean.replace(regex, (match, prefix, value, suffix) => {
      const escapedValue = value.replace(/(?<!\\)"/g, '\\"');
      return prefix + escapedValue + suffix;
    });
  }
  
  clean = clean.replace(/,\s*([\]}])/g, '$1');
  
  return clean;
}

/**
 * Extract the first balanced {...} JSON object from text that may contain
 * prose before/after it. String- and escape-aware. Returns null if none.
 * Exported for reuse by the connection test, which validates JSON output
 * the same way production parsing does.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

function parseAiContent(content: string): AiResponse {
  // Strip reasoning traces some models emit despite JSON-only instructions.
  let stripped = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();

  let parsed: AiResponse;
  let jsonText = stripped;
  const jsonMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  } else {
    // Last resort: extract the largest balanced {...} block (handles
    // preamble/postamble prose around the JSON object).
    const extracted = extractJsonObject(stripped);
    if (extracted) {
      jsonText = extracted;
    }
  }

  try {
    parsed = JSON.parse(jsonText);
  } catch (firstErr) {
    try {
      const cleanedText = cleanJsonString(jsonText);
      parsed = JSON.parse(cleanedText);
      logger.info(`${LOG_TAG} AI response JSON successfully repaired and parsed after initial failure`, { contentLength: content.length });
    } catch (secondErr) {
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      throw new Error(`Failed to parse AI response as JSON: ${errMsg}. Response preview: ${content.slice(0, 200)}`);
    }
  }

  if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
    throw new Error(`AI response missing suggestions array. Response preview: ${content.slice(0, 200)}`);
  }

  for (const s of parsed.suggestions) {
    if (!s.type || !['categorize', 'create_category', 'create_rule'].includes(s.type)) {
      throw new Error(`Invalid suggestion type: ${s.type}`);
    }
    if (typeof s.confidence !== 'number' || s.confidence < 0 || s.confidence > 100) {
      throw new Error(`Invalid confidence value: ${s.confidence}`);
    }
    if (s.confidence > 1) {
      s.confidence /= 100;
    }
  }

  return parsed;
}

/**
 * Pull answer text out of one parsed SSE `data:` payload. Handles two
 * dialects:
 * - Chat Completions: `{choices:[{delta:{content}}]}`
 * - Responses API (what Open WebUI proxies emit): `event: response.created`
 *   snapshots shaped `{response:{...}}` plus `output_text.delta` events shaped
 *   `{delta:"..."}` or `{type:"response.output_text.delta",delta:"..."}`.
 * Returns incremental text plus any full-text snapshot (from a completed
 * event) for use as a fallback when no deltas arrived.
 */
function extractStreamChunk(chunk: any): { text: string; reasoning: boolean; completedText: string } {
  if (!chunk || typeof chunk !== 'object') {
    return { text: '', reasoning: false, completedText: '' };
  }
  const delta = chunk.choices?.[0]?.delta;
  if (typeof delta?.content === 'string' && delta.content) {
    return { text: delta.content, reasoning: false, completedText: '' };
  }
  if (typeof chunk.delta === 'string' && chunk.delta) {
    return { text: chunk.delta, reasoning: false, completedText: '' };
  }

  let completedText = '';
  const outputs = chunk.response?.output ?? chunk.output;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      const parts = item?.content;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (typeof part?.text === 'string') {
            completedText += part.text;
          }
        }
      }
    }
  }

  const reasoning = !!(delta?.reasoning_content || delta?.reasoning || chunk.reasoning);
  return { text: '', reasoning, completedText };
}

/**
 * True when an error means the server rejected the constrained-JSON request
 * (`response_format`), as opposed to a transient or auth failure. Used to
 * fall back to plain mode automatically.
 */
export function isJsonFormatRejection(message: string): boolean {
  return /response_format|json_object|response format|json mode|grammar/i.test(message);
}

export async function callAiApi(
  endpoint: string,
  model: string,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  signal?: AbortSignal,
  fallbacks: string[] = [],
): Promise<AiResponse> {
  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;
  // OpenRouter supports the `reasoning` parameter (reasoning tokens travel
  // outside `content`, so JSON parsing is unaffected). Other backends get
  // the `enable_thinking: false` hint instead; unknown fields are ignored
  // by servers that don't support them.
  const openRouterReasoning = isOpenRouterEndpoint(endpoint);
  const baseBody: Record<string, any> = {
    ...buildModelParams(endpoint, model, fallbacks),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    stream: true,
    ...(openRouterReasoning
      ? { reasoning: { enabled: true } }
      : { enable_thinking: false }),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Smart JSON mode: try constrained JSON first (cleanest output), then fall
  // back to plain mode when the server rejects `response_format`. The parse
  // repair pipeline below is the final safety net either way.
  let lastError: unknown = null;
  for (const useJsonFormat of [true, false]) {
    const body: Record<string, any> = { ...baseBody };
    if (useJsonFormat) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const result = await callAiApiOnce(url, headers, body, model, signal);
      if (!useJsonFormat) {
        logger.info(`${LOG_TAG} Plain (non-JSON-mode) request succeeded`, { model });
      }
      return result;
    } catch (err) {
      if (useJsonFormat && err instanceof Error && !/abort/i.test(err.name) && isJsonFormatRejection(err.message)) {
        logger.info(`${LOG_TAG} Server rejected response_format, retrying without JSON mode`, { model, error: err.message.slice(0, 200) });
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI API call failed after retries');
}

async function callAiApiOnce(
  url: string,
  headers: Record<string, string>,
  body: Record<string, any>,
  model: string,
  signal?: AbortSignal,
): Promise<AiResponse> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      // H-5: user-configured endpoint → fetchSecure validates URL + hops.
      const response = await fetchSecure(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const isRetryable = response.status === 429 || response.status >= 500;
        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`AI API error: ${response.status} ${text.slice(0, 500)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('AI API returned response body that is not readable');
      }

      const contentType = response.headers.get('content-type') ?? '';

      // Some OpenAI-compatible servers (e.g. Open WebUI in certain configs)
      // ignore `stream: true` and return a single JSON payload instead of
      // SSE. Handle that shape directly.
      if (contentType.includes('application/json')) {
        const data = await response.json();
        const msg = data.choices?.[0]?.message;
        const direct =
          (typeof msg?.content === 'string' && msg.content) ||
          msg?.reasoning ||
          msg?.reasoning_content ||
          extractStreamChunk(data).completedText ||
          '';
        if (!direct) {
          throw new Error(
            `AI API returned a non-streaming JSON response with no message content (model: ${model}). Raw keys: ${Object.keys(data ?? {}).join(',') || 'none'}`
          );
        }
        const parsed = parseAiContent(direct);
        if (typeof data?.model === 'string' && data.model) {
          parsed.servedModel = data.model;
        }
        return parsed;
      }

      const decoder = new TextDecoder();
      let content = '';
      let buffer = '';
      let rawSnippet = '';
      let sawReasoningOnly = false;
      let completedSnapshot = '';
      let servedModel: string | undefined;
      const seenEvents: string[] = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const decoded = decoder.decode(value, { stream: true });
          if (!rawSnippet && decoded) {
            rawSnippet = decoded.slice(0, 200);
          }
          buffer += decoded;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            if (cleanLine.startsWith('event:')) {
              const name = cleanLine.slice(6).trim();
              if (name && !seenEvents.includes(name)) {
                seenEvents.push(name);
              }
              continue;
            }
            if (cleanLine === 'data: [DONE]') continue;
            if (cleanLine.startsWith('data: ')) {
              try {
                const parsedChunk = JSON.parse(cleanLine.slice(6));
                if (!servedModel && typeof parsedChunk?.model === 'string') {
                  servedModel = parsedChunk.model;
                }
                const { text, reasoning, completedText } = extractStreamChunk(parsedChunk);
                content += text;
                if (completedText) {
                  completedSnapshot = completedText;
                }
                if (!text && reasoning) {
                  sawReasoningOnly = true;
                }
              } catch {
                // Ignore parsing errors for incomplete SSE lines
              }
            }
          }
        }

        const cleanBuffer = buffer.trim();
        if (cleanBuffer.startsWith('data: ') && cleanBuffer !== 'data: [DONE]') {
          try {
            const parsedChunk = JSON.parse(cleanBuffer.slice(6));
            const { text, reasoning, completedText } = extractStreamChunk(parsedChunk);
            content += text;
            if (completedText) {
              completedSnapshot = completedText;
            }
            if (!text && reasoning) {
              sawReasoningOnly = true;
            }
          } catch {}
        }

        // Responses-API servers may only deliver the full text in the
        // completed-event snapshot rather than as deltas.
        if (!content && completedSnapshot) {
          content = completedSnapshot;
        }
      } finally {
        reader.releaseLock();
      }

      if (!content) {
        const hint = sawReasoningOnly
          ? ' The model streamed only reasoning (reasoning_content) with no answer content — disable thinking mode for this model or use a non-reasoning model.'
          : '';
        const events = seenEvents.length > 0 ? ` Stream events seen: ${seenEvents.slice(0, 8).join(',')}.` : '';
        throw new Error(
          `AI API returned empty response (model: ${model}, content-type: ${contentType || 'unknown'}).${hint}${events} First bytes: ${rawSnippet || '(none)'}`.slice(0, 600)
        );
      }

      const parsed = parseAiContent(content);
      if (servedModel) {
        parsed.servedModel = servedModel;
      }
      return parsed;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      const isNonRetryableHttp = err instanceof Error && /^AI API error: [4][0-9]{2}/.test(err.message);
      if (attempt < MAX_RETRIES && !isNonRetryableHttp) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error('AI API call failed after retries');
}

function buildPayload(
  suggestion: AiSuggestion,
  txns: TransactionInfo[],
  categories: CategoryInfo[],
): Record<string, unknown> | null {
  const normalize = (val: string | null | undefined) => (val === '' ? null : (val ?? null));

  switch (suggestion.type) {
    case 'categorize': {
      let tx = txns.find((t) => t.index === suggestion.transactionIndex);
      if (!tx && typeof suggestion.transactionIndex === 'number') {
        tx = txns[suggestion.transactionIndex - 1] ?? txns[suggestion.transactionIndex];
      }
      if (!tx) return null;

      const categoryId = normalize(suggestion.categoryId);
      const categoryName = normalize(suggestion.categoryName);

      let resolvedCategoryId = categoryId;
      if (resolvedCategoryId) {
        const catById = categories.find((c) => c.id === resolvedCategoryId);
        if (!catById) {
          const catByName = categoryName
            ? categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())
            : null;
          resolvedCategoryId = catByName?.id ?? null;
        }
      }

      return {
        type: 'categorize',
        transactionId: tx.id,
        transactionDescription: tx.description,
        proposedCategoryId: resolvedCategoryId,
        proposedCategoryName: categoryName,
      };
    }
    case 'create_category': {
      const parentName = normalize(suggestion.parentName);
      let parentId: string | null = null;
      if (parentName) {
        const parent = categories.find((c) => c.name.toLowerCase() === parentName.toLowerCase() && !c.parentId);
        parentId = parent?.id ?? null;
      }
      return {
        type: 'create_category',
        name: suggestion.name,
        parentName: parentName,
        parentId,
        color: suggestion.color,
        isIncome: suggestion.isIncome,
      };
    }
    case 'create_rule': {
      const setCategoryName = normalize(suggestion.setCategoryName);
      let setCategoryId: string | null = null;
      if (setCategoryName) {
        const cat = categories.find((c) => c.name.toLowerCase() === setCategoryName.toLowerCase());
        setCategoryId = cat?.id ?? null;
      }
      return {
        type: 'create_rule',
        ruleName: suggestion.ruleName,
        conditionField: suggestion.conditionField,
        conditionOperator: suggestion.conditionOperator,
        conditionValue: suggestion.conditionValue,
        conditionCaseSensitive: suggestion.conditionCaseSensitive,
        setCategoryId,
        setCategoryName: setCategoryName,
      };
    }
    default:
      return null;
  }
}

export async function applyApprovedProposals(userId: string, dek: Uint8Array): Promise<void> {
  const db = getDb();
  const dataUserId = await resolveDataUserId(userId);

  const pending = await db
    .select()
    .from(aiProposals)
    .where(and(
      eq(aiProposals.userId, dataUserId),
      eq(aiProposals.status, 'approved'),
    ))
    .orderBy(asc(aiProposals.createdAt));

  if (pending.length === 0) return;

  logger.info(`${LOG_TAG} Applying ${pending.length} approved proposals`, { userId });

  // Load all existing categories and decrypt them
  const categoryRows = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, dataUserId));
  const decryptedCategories = await decryptRows('categories', categoryRows, dek);

  // Set of valid category IDs to check existence later
  const existingIds = new Set<string>();
  // Map of lowercase category name to ID
  const nameToId = new Map<string, string>();
  for (const cat of decryptedCategories) {
    existingIds.add(cat.id);
    nameToId.set(cat.name.trim().toLowerCase(), cat.id);
  }

  const categoryIdMap = new Map<string, string>();

  // First pass: Process all create_category proposals and check for duplicates
  for (const proposal of pending) {
    if (proposal.type !== 'create_category') continue;
    const payload = proposal.payload as any;
    const normName = payload.name.trim().toLowerCase();

    // Check if category already exists in memory (case insensitive)
    const existingId = nameToId.get(normName);

    if (existingId) {
      // Category already exists, map it to the existing ID
      categoryIdMap.set(payload.name, existingId);
      logger.info(`${LOG_TAG} Category "${payload.name}" already exists`, { userId, categoryId: existingId });
    } else {
      const encrypted = await encryptField(payload.name, dek);
      const [created] = await db
        .insert(categoriesTable)
        .values({
          userId: dataUserId,
          parentId: payload.parentId,
          name: encrypted,
          color: payload.color ?? '#6366f1',
          isIncome: payload.isIncome ?? false,
          isSystem: false,
          createdByAi: true,
          displayOrder: 999,
        })
        .returning();

      categoryIdMap.set(payload.name, created.id);
      nameToId.set(normName, created.id);
      existingIds.add(created.id);
      logger.info(`${LOG_TAG} Created category "${payload.name}"`, { userId, categoryId: created.id });
    }
  }

  // Second pass: Process remaining proposals (categorize and create_rule)
  for (const proposal of pending) {
    const payload = proposal.payload as any;

    switch (proposal.type) {
      case 'categorize': {
        let categoryId = payload.proposedCategoryId;
        // Verify proposedCategoryId exists in the database
        if (categoryId) {
          const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);
          if (!isValidUuid || !existingIds.has(categoryId)) {
            categoryId = null;
          }
        }
        // Fallback to lookup by name
        if (!categoryId && payload.proposedCategoryName) {
          categoryId = categoryIdMap.get(payload.proposedCategoryName) ?? 
                       nameToId.get(payload.proposedCategoryName.trim().toLowerCase()) ?? 
                       null;
        }
        if (categoryId) {
          await db
            .update(transactions)
            .set({ categoryId, reviewed: true, categorizedByAi: true, updatedAt: new Date() })
            .where(
              and(
                eq(transactions.id, payload.transactionId),
                eq(transactions.userId, dataUserId)
              )
            );
          logger.info(`${LOG_TAG} Categorized transaction ${payload.transactionId}`, { userId, categoryId });
        }
        break;
      }
      case 'create_rule': {
        let setCategoryId = payload.setCategoryId;
        // Verify setCategoryId exists in the database
        if (setCategoryId) {
          const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(setCategoryId);
          if (!isValidUuid || !existingIds.has(setCategoryId)) {
            setCategoryId = null;
          }
        }
        // Fallback to lookup by name
        if (!setCategoryId && payload.setCategoryName) {
          setCategoryId = categoryIdMap.get(payload.setCategoryName) ?? 
                          nameToId.get(payload.setCategoryName.trim().toLowerCase()) ?? 
                          null;
        }

        const duplicate = await findDuplicateRule(dataUserId, dek, {
          conditionField: payload.conditionField,
          conditionOperator: payload.conditionOperator,
          conditionValue: payload.conditionValue,
          conditionCaseSensitive: payload.conditionCaseSensitive ?? false,
          setCategoryId,
          overrideExisting: false,
        });

        if (duplicate) {
          logger.info(`${LOG_TAG} Approved create_rule proposal - duplicate rule already exists, skipping insert`, { userId, ruleId: duplicate.id });
          if (!duplicate.isActive) {
            await db
              .update(categoryRules)
              .set({ isActive: true, updatedAt: new Date() })
              .where(eq(categoryRules.id, duplicate.id));
          }
          break;
        }

        const encryptedRule = await encryptField(payload.ruleName, dek);
        await db
          .insert(categoryRules)
          .values({
            userId: dataUserId,
            name: encryptedRule,
            priority: 999,
            isActive: true,
            conditionField: payload.conditionField,
            conditionOperator: payload.conditionOperator,
            conditionValue: await encryptField(payload.conditionValue, dek),
            conditionCaseSensitive: payload.conditionCaseSensitive ?? false,
            setCategoryId,
            isSystem: false,
            createdByAi: true,
          })
          .returning();
        logger.info(`${LOG_TAG} Created rule "${payload.ruleName}"`, { userId });
        break;
      }
    }
  }

  // Mark all processed proposals as applied
  const appliedIds = pending.map((p) => p.id);
  await db
    .update(aiProposals)
    .set({ status: 'applied', updatedAt: new Date() })
    .where(inArray(aiProposals.id, appliedIds));

  logger.info(`${LOG_TAG} All approved proposals applied and marked as applied`, { userId, count: pending.length });
  invalidateUserSearchCache(dataUserId);
}
