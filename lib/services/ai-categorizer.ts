import { getDb } from '@/lib/db';
import { resolveDataUserId } from '@/lib/sharing';
import { transactions, categories as categoriesTable, categoryRules, userSettings, aiProposals, accounts, aiProviders } from '@/lib/db/schema';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, decryptRows, decryptField, encryptField } from '@/lib/crypto';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { findDuplicateRule } from '@/lib/services/rules-engine';

const LOG_TAG = '[ai-categorizer]';
const BATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per batch

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
};

export async function analyzeUncategorized(
  userId: string,
  onProgress?: (processedCount: number, totalCount: number | null) => void,
  onLog?: (message: string) => void,
  abortController?: AbortController,
): Promise<{ proposalsCreated: number; autoApproved: number; errors: string[] }> {
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
    const dek = await getSessionDEK();
    const dataUserId = await resolveDataUserId(userId);

    let endpoint: string;
    let model: string;
    let apiKey = '';
    let jsonMode = false;

    if (settings.aiActiveProviderId) {
      const providerRows = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.id, settings.aiActiveProviderId))
        .limit(1);
      if (providerRows.length && providerRows[0].endpoint && providerRows[0].model) {
        endpoint = providerRows[0].endpoint;
        model = providerRows[0].model;
        jsonMode = providerRows[0].jsonMode;
        if (providerRows[0].apiKeyEncrypted) {
          try {
            apiKey = await decryptField(providerRows[0].apiKeyEncrypted, dek);
          } catch { /* no api key */ }
        }
      } else {
        const msg = 'Active AI provider not found or misconfigured';
        onLog?.(`Error: ${msg}`);
        return { proposalsCreated: 0, autoApproved: 0, errors: [msg] };
      }
    } else {
      const msg = 'No active AI provider configured';
      onLog?.(`Error: ${msg}`);
      return { proposalsCreated: 0, autoApproved: 0, errors: [msg] };
    }

    onLog?.('Fetching financial categories from database...');
    const categoryRows = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, dataUserId))
      .orderBy(asc(categoriesTable.displayOrder));

    const decryptedCategories = await decryptRows('categories', categoryRows, dek);
    const parentMap = new Map<string, string>();
    for (const cat of decryptedCategories) {
      if (cat.parentId) {
        const parent = decryptedCategories.find((c: any) => c.id === cat.parentId);
        if (parent) parentMap.set(cat.id, parent.name);
      }
    }

    const categories: CategoryInfo[] = decryptedCategories.map((c: any) => ({
      id: c.id,
      name: c.name,
      parentName: parentMap.get(c.id) ?? null,
      parentId: c.parentId ?? null,
      color: c.color,
      isIncome: c.isIncome,
    }));

    onLog?.('Loading active auto-categorization rules...');
    const ruleRows = await db
      .select()
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, dataUserId), eq(categoryRules.isActive, true)))
      .orderBy(asc(categoryRules.priority));

    const decryptedRules = await decryptRows('category_rules', ruleRows, dek);
    const rules: RuleInfo[] = decryptedRules.map((r: any) => {
      const cat = r.setCategoryId ? categories.find((c) => c.id === r.setCategoryId) : null;
      return {
        name: r.name,
        conditionField: r.conditionField,
        conditionOperator: r.conditionOperator,
        conditionValue: r.conditionValue,
        setCategoryName: cat?.name ?? null,
      };
    });

    onLog?.('Counting uncategorized transactions...');
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.userId, dataUserId), isNull(transactions.categoryId), eq(transactions.deleted, false)));
    const totalUncategorized = Number(countResult[0]?.count ?? 0);
    onProgress?.(0, totalUncategorized);
    onLog?.(`Found ${totalUncategorized} uncategorized transaction(s)`);

    const batchSize = settings.aiBatchSize ?? 25;
    const autoApproveThreshold = settings.aiAutoApproveThreshold ?? 95;
    let proposalsCreated = 0;
    let autoApproved = 0;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Check if analysis has been aborted
      if (abortController?.signal.aborted) {
        onLog?.('Analysis cancelled by user');
        break;
      }
      const txnRows = await db
        .select({
          transaction: transactions,
          account: accounts,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(and(
          eq(transactions.userId, dataUserId),
          isNull(transactions.categoryId),
          eq(transactions.deleted, false),
        ))
        .orderBy(asc(transactions.date))
        .limit(batchSize)
        .offset(offset);

      if (txnRows.length === 0) {
        break;
      }

      const decryptedTxns: TransactionInfo[] = [];
      for (let i = 0; i < txnRows.length; i++) {
        const row = txnRows[i];
        const tx = await decryptRow('transactions', row.transaction, dek);
        let accountType: string | null = null;
        if (row.account?.type) {
          accountType = await decryptField(row.account.type, dek);
        }
        decryptedTxns.push({
          index: i,
          id: tx.id,
          description: tx.description,
          payee: tx.payee,
          memo: tx.memo,
          amount: tx.amount,
          date: tx.date,
          accountType,
        });
      }

      const batchNum = Math.floor(offset / batchSize) + 1;
      const prompt = buildPrompt(categories, rules, decryptedTxns);

      const systemPrompt = settings.aiSystemPrompt || SYSTEM_PROMPT;
      onLog?.(`Batch ${batchNum}: Prepared prompt with ${decryptedTxns.length} transaction(s).`);

      // Per-batch AbortController with its own timeout
      const batchAbortController = new AbortController();
      const batchTimeoutId = setTimeout(() => {
        batchAbortController.abort();
      }, BATCH_TIMEOUT_MS);

      // Propagate main cancel signal to per-batch controller
      const onMainAbort = () => {
        if (!batchAbortController.signal.aborted) {
          batchAbortController.abort();
        }
      };
      abortController?.signal.addEventListener('abort', onMainAbort);

      try {
        const batchStart = Date.now();
        logger.info(`${LOG_TAG} Calling AI API (batch offset=${offset})`, { userId, endpoint, model, transactionCount: decryptedTxns.length, usingCustomPrompt: !!settings.aiSystemPrompt });
        onLog?.(`Batch ${batchNum}: Calling model (${model}). Waiting for response...`);
        const aiResponse = await callAiApi(endpoint, model, apiKey, prompt, systemPrompt, jsonMode, batchAbortController.signal);

        const { suggestions } = aiResponse;
        const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
        onLog?.(`Batch ${batchNum}: Received response from ${model} in ${elapsed}s. Found ${suggestions.length} suggestion(s).`);
        logger.info(`${LOG_TAG} Received ${suggestions.length} suggestions from AI (batch offset=${offset})`, { userId });

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

        onProgress?.(offset + txnRows.length, totalUncategorized);
        onLog?.(`Batch ${batchNum}: Saved ${batchProposals} proposal(s) ${batchAutoApproved > 0 ? `(${batchAutoApproved} auto-approved)` : ''}.`);
        logger.info(`${LOG_TAG} Batch complete (offset=${offset})`, { userId, batchProposals, batchAutoApproved });
      } catch (err) {
        if (abortController?.signal.aborted) {
          onLog?.('Analysis cancelled by user');
          break;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          const msg = `Batch ${batchNum} timed out after ${BATCH_TIMEOUT_MS / 1000}s, skipping.`;
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

      offset += txnRows.length;
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
            '/settings?tab=ai',
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
  }
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
  prompt += 'Use the category IDs from the table above when referencing existing categories. ';
  prompt += 'Respond with valid JSON only.\n';

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

async function callAiApi(
  endpoint: string,
  model: string,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  jsonMode: boolean,
  signal?: AbortSignal,
): Promise<AiResponse> {
  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const body: Record<string, any> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    chat_id: 'finance-categorize',
    stream: true,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const response = await fetch(url, {
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

      const decoder = new TextDecoder();
      let content = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            if (cleanLine === 'data: [DONE]') continue;
            if (cleanLine.startsWith('data: ')) {
              try {
                const parsedChunk = JSON.parse(cleanLine.slice(6));
                const text = parsedChunk.choices?.[0]?.delta?.content ?? '';
                content += text;
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
            const text = parsedChunk.choices?.[0]?.delta?.content ?? '';
            content += text;
          } catch {}
        }
      } finally {
        reader.releaseLock();
      }

      if (!content) {
        throw new Error('AI API returned empty response');
      }

      let parsed: AiResponse;
      let jsonText = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
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
          throw new Error(`Failed to parse AI response as JSON: ${errMsg}`);
        }
      }

      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        throw new Error('AI response missing suggestions array');
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
      const tx = txns[suggestion.transactionIndex];
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
            .where(eq(transactions.id, payload.transactionId));
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

  logger.info(`${LOG_TAG} All approved proposals applied`, { userId, count: pending.length });
  invalidateUserSearchCache(dataUserId);
}
