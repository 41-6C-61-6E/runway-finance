import 'dotenv/config';
import { getDb } from '../lib/db';
import { resolveDataUserId } from '../lib/sharing';
import { transactions, categories as categoriesTable, categoryRules, userSettings, aiProposals, accounts, aiProviders } from '../lib/db/schema';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { getServerDEK } from '../lib/crypto-context';
import { decryptRow, decryptRows, decryptField, encryptField } from '../lib/crypto';
import { SYSTEM_PROMPT } from '../lib/ai/prompts';

async function main() {
  const userId = 'alanracek';
  const db = getDb();
  
  console.log('Starting test analysis for user:', userId);

  try {
    const userSettingsRow = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!userSettingsRow.length) {
      console.error('User settings not found');
      return;
    }

    const settings = userSettingsRow[0];
    const dek = await getServerDEK(userId);
    const dataUserId = await resolveDataUserId(userId);

    let endpoint = '';
    let model = '';
    let apiKey = '';
    let jsonMode = false;
    let providerName = '';

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
        providerName = providerRows[0].name;
        if (providerRows[0].apiKeyEncrypted) {
          apiKey = await decryptField(providerRows[0].apiKeyEncrypted, dek);
        }
      } else {
        console.error('Active AI provider not found or misconfigured');
        return;
      }
    } else {
      console.error('No active AI provider configured');
      return;
    }

    console.log('AI Provider Info:', { name: providerName, endpoint, model, jsonMode });

    console.log('Fetching categories...');
    const categoryRows = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, dataUserId))
      .orderBy(asc(categoriesTable.displayOrder));

    const decryptedCategories = await decryptRows('categories', categoryRows, dek);
    console.log(`Decrypted ${decryptedCategories.length} categories.`);

    const parentMap = new Map<string, string>();
    for (const cat of decryptedCategories) {
      if (cat.parentId) {
        const parent = decryptedCategories.find((c: any) => c.id === cat.parentId);
        if (parent) parentMap.set(cat.id, parent.name);
      }
    }

    const categoriesList = decryptedCategories.map((c: any) => ({
      id: c.id,
      name: c.name,
      parentName: parentMap.get(c.id) ?? null,
      parentId: c.parentId ?? null,
      color: c.color,
      isIncome: c.isIncome,
    }));

    console.log('Loading rules...');
    const ruleRows = await db
      .select()
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, dataUserId), eq(categoryRules.isActive, true)))
      .orderBy(asc(categoryRules.priority));

    const decryptedRules = await decryptRows('category_rules', ruleRows, dek);
    const rules = decryptedRules.map((r: any) => {
      const cat = r.setCategoryId ? categoriesList.find((c) => c.id === r.setCategoryId) : null;
      return {
        name: r.name,
        conditionField: r.conditionField,
        conditionOperator: r.conditionOperator,
        conditionValue: r.conditionValue,
        setCategoryName: cat?.name ?? null,
      };
    });

    console.log('Counting transactions...');
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(eq(transactions.userId, dataUserId), isNull(transactions.categoryId), eq(transactions.deleted, false)));
    const totalUncategorized = Number(countResult[0]?.count ?? 0);
    console.log(`Found ${totalUncategorized} uncategorized transactions`);

    if (totalUncategorized === 0) {
      console.log('No uncategorized transactions to analyze');
      return;
    }

    console.log('Fetching first batch of transactions...');
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
      .limit(5);

    const decryptedTxns = [];
    for (let i = 0; i < txnRows.length; i++) {
      const row = txnRows[i];
      const tx = await decryptRow('transactions', row.transaction, dek);
      let accountType = null;
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

    console.log('Transactions loaded:', decryptedTxns);

    // Call callAiApi logic directly
    const buildPrompt = (cats: any, rls: any, txs: any) => {
      let p = '## Existing Categories\n\n';
      p += 'ID | Name | Parent | Type\n';
      p += '---|------|--------|----\n';
      for (const cat of cats) {
        p += `${cat.id} | ${cat.name} | ${cat.parentName ?? '-'} | ${cat.isIncome ? 'Income' : 'Expense'}\n`;
      }
      p += '\n## Instructions\nAnalyze transactions and respond in valid JSON only.\n';
      return p;
    };

    const promptText = buildPrompt(categoriesList, rules, decryptedTxns);
    const systemPrompt = settings.aiSystemPrompt || SYSTEM_PROMPT;

    console.log('Setting TEST_DEK_HEX to execute real analyzeUncategorized...');
    const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    process.env.TEST_DEK_HEX = bytesToHex(dek);

    const { analyzeUncategorized: realAnalyze } = await import('../lib/services/ai-categorizer');
    
    console.log('Invoking realAnalyze...');
    const result = await realAnalyze(
      userId,
      (processed, total) => console.log('Progress Callback:', processed, '/', total),
      (logMsg) => console.log('Log/Step Callback:', logMsg)
    );

    console.log('Result of realAnalyze:', result);
  } catch (error) {
    console.error('CRITICAL ERROR IN TEST SCRIPT:', error);
  }
}

main().then(() => process.exit(0));
