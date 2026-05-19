import { getDb } from '@/lib/db';
import { transactions, categories as categoriesTable, categoryRules, userSettings, aiProposals, accounts, aiProviders } from '@/lib/db/schema';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, decryptRows, decryptField, encryptField } from '@/lib/crypto';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';

const LOG_TAG = '[ai-categorizer]';

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
    const userSettingsRow = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!userSettingsRow.length) {
      return { proposalsCreated: 0, autoApproved: 0, errors: ['User settings not found'] };
    }

    const settings = userSettingsRow[0];
    const dek = await getSessionDEK();

    let endpoint: string;
    let model: string;
    let apiKey = '';

    if (settings.aiActiveProviderId) {
      const providerRows = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.id, settings.aiActiveProviderId))
        .limit(1);
      if (providerRows.length && providerRows[0].endpoint && providerRows[0].model) {
        endpoint = providerRows[0].endpoint;
        model = providerRows[0].model;
        if (providerRows[0].apiKeyEncrypted) {
          try {
            apiKey = await decryptField(providerRows[0].apiKeyEncrypted, dek);
          } catch { /* no api key */ }
        }
      } else {
        return { proposalsCreated: 0, autoApproved: 0, errors: ['Active AI provider not found or misconfigured'] };
      }
    } else {
      return { proposalsCreated: 0, autoApproved: 0, errors: ['No active AI provider configured'] };
    }

    const categoryRows = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, userId))
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

    const ruleRows = await db
      .select()
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, userId), eq(categoryRules.isActive, true)))
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

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.categoryId)));
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
          eq(transactions.userId, userId),
          isNull(transactions.categoryId),
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
      onLog?.(`Batch ${batchNum}: Sending ${decryptedTxns.length} transaction(s) to AI (${model})`);
      const batchStart = Date.now();
      logger.info(`${LOG_TAG} Calling AI API (batch offset=${offset})`, { userId, endpoint, model, transactionCount: decryptedTxns.length, usingCustomPrompt: !!settings.aiSystemPrompt });
      const aiResponse = await callAiApi(endpoint, model, apiKey, prompt, systemPrompt, abortController?.signal);

      const { suggestions } = aiResponse;
      onLog?.(`Batch ${batchNum}: AI returned ${suggestions.length} suggestion(s) in ${((Date.now() - batchStart) / 1000).toFixed(1)}s`);
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
          userId,
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
        await applyApprovedProposals(userId, dek);
      }

      onProgress?.(offset + txnRows.length, totalUncategorized);
      onLog?.(`Batch ${batchNum}: ${batchProposals} proposal(s) saved${batchAutoApproved > 0 ? `, ${batchAutoApproved} auto-approved` : ''}`);
      logger.info(`${LOG_TAG} Batch complete (offset=${offset})`, { userId, batchProposals, batchAutoApproved });

      offset += txnRows.length;
      hasMore = txnRows.length >= batchSize;
    }

    onLog?.(`Done: ${proposalsCreated} proposal(s) created, ${autoApproved} auto-approved${errors.length > 0 ? `, ${errors.length} error(s)` : ''}`);
    logger.info(`${LOG_TAG} Analysis complete`, { userId, proposalsCreated, autoApproved, errors: errors.length });
    return { proposalsCreated, autoApproved, errors };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
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

async function callAiApi(
  endpoint: string,
  model: string,
  apiKey: string,
  prompt: string,
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<AiResponse> {
  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('AI API returned empty response');
      }

      let parsed: AiResponse;
      try {
        parsed = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse AI response as JSON');
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
  switch (suggestion.type) {
    case 'categorize': {
      const tx = txns[suggestion.transactionIndex];
      if (!tx) return null;

      let resolvedCategoryId = suggestion.categoryId;
      if (resolvedCategoryId) {
        const catById = categories.find((c) => c.id === resolvedCategoryId);
        if (!catById) {
          const catByName = suggestion.categoryName
            ? categories.find((c) => c.name.toLowerCase() === suggestion.categoryName.toLowerCase())
            : null;
          resolvedCategoryId = catByName?.id ?? null;
        }
      }

      return {
        type: 'categorize',
        transactionId: tx.id,
        transactionDescription: tx.description,
        proposedCategoryId: resolvedCategoryId,
        proposedCategoryName: suggestion.categoryName,
      };
    }
    case 'create_category': {
      let parentId: string | null = null;
      if (suggestion.parentName) {
        const parent = categories.find((c) => c.name.toLowerCase() === suggestion.parentName!.toLowerCase() && !c.parentId);
        parentId = parent?.id ?? null;
      }
      return {
        type: 'create_category',
        name: suggestion.name,
        parentName: suggestion.parentName,
        parentId,
        color: suggestion.color,
        isIncome: suggestion.isIncome,
      };
    }
    case 'create_rule': {
      let setCategoryId: string | null = null;
      if (suggestion.setCategoryName) {
        const cat = categories.find((c) => c.name.toLowerCase() === suggestion.setCategoryName!.toLowerCase());
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
        setCategoryName: suggestion.setCategoryName,
      };
    }
    default:
      return null;
  }
}

export async function applyApprovedProposals(userId: string, dek: Uint8Array): Promise<void> {
  const db = getDb();

  const pending = await db
    .select()
    .from(aiProposals)
    .where(and(
      eq(aiProposals.userId, userId),
      eq(aiProposals.status, 'approved'),
    ))
    .orderBy(asc(aiProposals.createdAt));

  if (pending.length === 0) return;

  logger.info(`${LOG_TAG} Applying ${pending.length} approved proposals`, { userId });

  const categoryIdMap = new Map<string, string>();

  // First pass: Process all create_category proposals and check for duplicates
  const categoryCreationQueue: { payload: any; proposal: typeof pending[0] }[] = [];
  
  for (const proposal of pending) {
    if (proposal.type !== 'create_category') continue;
    const payload = proposal.payload as any;
    
    // Check if category already exists (case insensitive)
    const existingCategory = await db
      .select()
      .from(categoriesTable)
      .where(and(
        eq(categoriesTable.userId, userId),
        eq(categoriesTable.name, payload.name)
      ))
      .limit(1);
    
    if (existingCategory.length > 0) {
      // Category already exists, map it to the existing ID
      categoryIdMap.set(payload.name, existingCategory[0].id);
      logger.info(`${LOG_TAG} Category "${payload.name}" already exists`, { userId, categoryId: existingCategory[0].id });
    } else {
      // Queue for creation
      categoryCreationQueue.push({ payload, proposal });
    }
  }

  // Create new categories that don't already exist
  for (const { payload, proposal } of categoryCreationQueue) {
    const encrypted = await encryptField(payload.name, dek);
    const encryptedParentId = payload.parentId ? await encryptField(payload.parentId, dek) : null;

    const [created] = await db
      .insert(categoriesTable)
      .values({
        userId,
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
    logger.info(`${LOG_TAG} Created category "${payload.name}"`, { userId, categoryId: created.id });
  }

  // Second pass: Process remaining proposals (categorize and create_rule)
  for (const proposal of pending) {
    const payload = proposal.payload as any;

    switch (proposal.type) {
      case 'categorize': {
        let categoryId = payload.proposedCategoryId;
        if (categoryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
          categoryId = null;
        }
        if (!categoryId && payload.proposedCategoryName) {
          categoryId = categoryIdMap.get(payload.proposedCategoryName) ?? null;
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
        if (!setCategoryId && payload.setCategoryName) {
          setCategoryId = categoryIdMap.get(payload.setCategoryName) ?? null;
          if (!setCategoryId) {
            const existing = await db
              .select()
              .from(categoriesTable)
              .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.name, payload.setCategoryName)))
              .limit(1);
            if (existing.length > 0) {
              setCategoryId = existing[0].id;
            }
          }
        }

        const encryptedRule = await encryptField(payload.ruleName, dek);
        await db
          .insert(categoryRules)
          .values({
            userId,
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
}
