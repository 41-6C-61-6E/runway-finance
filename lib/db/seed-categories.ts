import { getDb } from '@/lib/db';
import { budgets, categoryIncomeSummary, categoryRules, categorySpendingSummary, categories, transactions } from '@/lib/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';

type ChildCategoryDef = {
  name: string;
  color: string;
  excludeFromReports?: boolean;
};

type CategoryDef = {
  name: string;
  color: string;
  isIncome: boolean;
  categoryType?: string;
  excludeFromReports?: boolean;
  children?: ChildCategoryDef[];
};

type CompoundChildDef = {
  name: string;
  color: string;
  expenseParentName: string;
};

type CategoryRow = {
  id: string;
  parentId: string | null;
  expenseParentId: string | null;
  name: string;
  displayOrder: number;
  isSystem: boolean;
  createdAt: Date;
};

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase();
}

function categoryMergeKey(parentId: string | null, name: string) {
  return `${parentId ?? 'root'}::${normalizeCategoryName(name)}`;
}

function toTimestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function pickCanonicalCategory(rows: CategoryRow[]) {
  return [...rows].sort((a, b) => {
    const systemScore = Number(b.isSystem) - Number(a.isSystem);
    if (systemScore !== 0) return systemScore;

    const orderScore = a.displayOrder - b.displayOrder;
    if (orderScore !== 0) return orderScore;

    const timeScore = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
    if (timeScore !== 0) return timeScore;

    return a.id.localeCompare(b.id);
  })[0];
}

export async function mergeDuplicateCategories(userId: string, dek?: Uint8Array): Promise<number> {
  const db = getDb();
  let mergedCount = 0;

  for (let pass = 0; pass < 10; pass++) {
    const allCategoriesRaw = await db
      .select({
        id: categories.id,
        parentId: categories.parentId,
        name: categories.name,
        displayOrder: categories.displayOrder,
        isSystem: categories.isSystem,
        createdAt: categories.createdAt,
      })
      .from(categories)
      .where(eq(categories.userId, userId));

    const allCategories = dek
      ? await decryptRows('categories', allCategoriesRaw, dek)
      : allCategoriesRaw;

    const duplicateGroups = new Map<string, CategoryRow[]>();
    for (const cat of allCategories as CategoryRow[]) {
      const key = categoryMergeKey(cat.parentId, cat.name);
      const group = duplicateGroups.get(key) ?? [];
      group.push(cat);
      duplicateGroups.set(key, group);
    }

    const groupsToMerge = [...duplicateGroups.values()].filter((group) => group.length > 1);
    if (groupsToMerge.length === 0) break;

    let mergedThisPass = 0;
    await db.transaction(async (tx) => {
      for (const group of groupsToMerge) {
        const canonical = pickCanonicalCategory(group);
        const duplicates = group.filter((cat) => cat.id !== canonical.id);

        for (const duplicate of duplicates) {
          await tx.update(transactions)
            .set({ categoryId: canonical.id })
            .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, duplicate.id)));

          await tx.update(budgets)
            .set({ categoryId: canonical.id })
            .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, duplicate.id)));

          await tx.update(categoryRules)
            .set({ setCategoryId: canonical.id })
            .where(and(eq(categoryRules.userId, userId), eq(categoryRules.setCategoryId, duplicate.id)));

          await tx.update(categorySpendingSummary)
            .set({ categoryId: canonical.id })
            .where(and(eq(categorySpendingSummary.userId, userId), eq(categorySpendingSummary.categoryId, duplicate.id)));

          await tx.update(categoryIncomeSummary)
            .set({ categoryId: canonical.id })
            .where(and(eq(categoryIncomeSummary.userId, userId), eq(categoryIncomeSummary.categoryId, duplicate.id)));

          await tx.update(categories)
            .set({ parentId: canonical.id })
            .where(and(eq(categories.userId, userId), eq(categories.parentId, duplicate.id)));

          await tx.update(categories)
            .set({ expenseParentId: canonical.id })
            .where(and(eq(categories.userId, userId), eq(categories.expenseParentId, duplicate.id)));

          await tx.delete(categories)
            .where(and(eq(categories.userId, userId), eq(categories.id, duplicate.id)));

          mergedCount++;
          mergedThisPass++;
        }
      }
    });

    if (mergedThisPass === 0) break;
  }

  return mergedCount;
}

/** All default compound subcategories for Paycheck Deductions. */
const COMPOUND_SUBCATEGORIES: CompoundChildDef[] = [
  { name: '401k / Retirement',           color: '#6366f1', expenseParentName: 'Retirement' },
  { name: 'Health Insurance Premiums',   color: '#8b5cf6', expenseParentName: 'Health & Medical' },
  { name: 'Dental & Vision Premiums',    color: '#a78bfa', expenseParentName: 'Health & Medical' },
  { name: 'HSA / FSA Contribution',      color: '#c4b5fd', expenseParentName: 'Health & Medical' },
  { name: 'Life & Disability Insurance', color: '#a855f7', expenseParentName: 'Bills & Subscriptions' },
  { name: 'Federal Withholding',         color: '#7c3aed', expenseParentName: 'Taxes' },
  { name: 'State Withholding',           color: '#6d28d9', expenseParentName: 'Taxes' },
  { name: 'Payroll Tax (SS / Medicare)', color: '#5b21b6', expenseParentName: 'Taxes' },
  { name: 'Other Paycheck Deductions',   color: '#6b7280', expenseParentName: 'Transfers & Adjustments' },
];

/** All default compound subcategories for Employer Contributions. */
const EMPLOYER_CONTRIBUTION_SUBCATEGORIES: CompoundChildDef[] = [
  { name: 'Employer 401k Match',         color: '#4f46e5', expenseParentName: 'Retirement' },
  { name: 'Employer HSA Contribution',   color: '#0891b2', expenseParentName: 'Health & Medical' },
  { name: 'Employer Pension Contribution', color: '#4338ca', expenseParentName: 'Retirement' },
  { name: 'Employer-paid Insurance',     color: '#7c3aed', expenseParentName: 'Bills & Subscriptions' },
  { name: 'RSU / Stock Vesting',         color: '#0d9488', expenseParentName: 'Financial' },
];

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  {
    name: 'Income',
    color: '#22c55e',
    isIncome: true,
    children: [
      { name: 'Salary & Wages', color: '#22c55e' },
      { name: 'Freelance / 1099', color: '#16a34a' },
      { name: 'Interest & Dividends', color: '#15803d' },
      { name: 'Rental Income', color: '#4ade80' },
      { name: 'Business Income', color: '#86efac' },
      { name: 'Other Income', color: '#bbf7d0' },
      { name: 'Refunds & Reimbursements', color: '#059669' },
      { name: 'Gifts Received', color: '#10b981' },
    ],
  },
  {
    name: 'Housing',
    color: '#ef4444',
    isIncome: false,
    children: [
      { name: 'Rent / Mortgage', color: '#ef4444' },
      { name: 'Property Taxes', color: '#dc2626' },
      { name: 'Home Insurance', color: '#b91c1c' },
      { name: 'HOA Fees', color: '#f87171' },
      { name: 'Home Maintenance & Repairs', color: '#fca5a5' },
      { name: 'Home Supplies', color: '#fecaca' },
    ],
  },
  {
    name: 'Utilities',
    color: '#f97316',
    isIncome: false,
    children: [
      { name: 'Electricity', color: '#f97316' },
      { name: 'Water & Sewer', color: '#ea580c' },
      { name: 'Gas', color: '#c2410c' },
      { name: 'Internet', color: '#fdba74' },
      { name: 'Phone & Cellular', color: '#fed7aa' },
    ],
  },
  {
    name: 'Transportation',
    color: '#eab308',
    isIncome: false,
    children: [
      { name: 'Gas & Fuel', color: '#eab308' },
      { name: 'Auto Insurance', color: '#ca8a04' },
      { name: 'Auto Maintenance', color: '#a16207' },
      { name: 'Auto Payment / Lease', color: '#facc15' },
      { name: 'Parking & Tolls', color: '#fde047' },
      { name: 'Public Transit & Ride Share', color: '#fef08a' },
    ],
  },
  {
    name: 'Food & Dining',
    color: '#84cc16',
    isIncome: false,
    children: [
      { name: 'Groceries', color: '#84cc16' },
      { name: 'Restaurants & Dining Out', color: '#65a30d' },
      { name: 'Coffee Shops', color: '#4d7c0f' },
      { name: 'Food Delivery', color: '#a3e635' },
      { name: 'Alcohol & Bars', color: '#bef264' },
    ],
  },
  {
    name: 'Health & Medical',
    color: '#06b6d4',
    isIncome: false,
    children: [
      { name: 'Health Insurance', color: '#06b6d4' },
      { name: 'Doctor Visits', color: '#0891b2' },
      { name: 'Pharmacy & Prescriptions', color: '#0e7490' },
      { name: 'Dental & Vision', color: '#22d3ee' },
      { name: 'Gym & Fitness', color: '#67e8f9' },
      { name: 'Mental Health', color: '#a5f3fc' },
    ],
  },
  {
    name: 'Shopping',
    color: '#8b5cf6',
    isIncome: false,
    children: [
      { name: 'Clothing & Apparel', color: '#8b5cf6' },
      { name: 'Electronics', color: '#7c3aed' },
      { name: 'Home Goods', color: '#6d28d9' },
      { name: 'Online Shopping', color: '#a78bfa' },
      { name: 'Personal Care', color: '#c4b5fd' },
      { name: 'Pet Supplies', color: '#ddd6fe' },
    ],
  },
  {
    name: 'Entertainment',
    color: '#ec4899',
    isIncome: false,
    children: [
      { name: 'Movies & Events', color: '#ec4899' },
      { name: 'Music & Streaming', color: '#db2777' },
      { name: 'Books & Audiobooks', color: '#be185d' },
      { name: 'Gaming', color: '#f472b6' },
      { name: 'Hobbies', color: '#f9a8d4' },
      { name: 'Sports & Recreation', color: '#fbcfe8' },
    ],
  },
  {
    name: 'Travel',
    color: '#14b8a6',
    isIncome: false,
    children: [
      { name: 'Flights', color: '#14b8a6' },
      { name: 'Hotels & Lodging', color: '#0d9488' },
      { name: 'Travel Insurance', color: '#0f766e' },
      { name: 'Rental Cars & Rides', color: '#2dd4bf' },
      { name: 'Travel Experiences', color: '#5eead4' },
    ],
  },
  {
    name: 'Financial',
    color: '#64748b',
    isIncome: false,
    children: [
      { name: 'Credit Card Fees', color: '#64748b' },
      { name: 'ATM & Bank Fees', color: '#475569' },
      { name: 'Late Fees', color: '#334155' },
      { name: 'Loan Interest', color: '#94a3b8' },
      { name: 'Investments & Brokerage Fees', color: '#cbd5e1' },
    ],
  },
  {
    name: 'Retirement',
    color: '#4f46e5',
    isIncome: false,
    children: [
      { name: '401k', color: '#6366f1' },
      { name: 'Roth IRA', color: '#8b5cf6' },
      { name: 'Traditional IRA', color: '#a855f7' },
    ],
  },
  {
    name: 'Education',
    color: '#0ea5e9',
    isIncome: false,
    children: [
      { name: 'Tuition', color: '#0ea5e9' },
      { name: 'Student Loan Payment', color: '#0284c7' },
      { name: 'Books & Supplies', color: '#0369a1' },
      { name: 'Courses & Certifications', color: '#38bdf8' },
    ],
  },
  {
    name: 'Bills & Subscriptions',
    color: '#a855f7',
    isIncome: false,
    children: [
      { name: 'Streaming Services', color: '#a855f7' },
      { name: 'Software Subscriptions', color: '#9333ea' },
      { name: 'Cloud Storage', color: '#7e22ce' },
      { name: 'Insurance (Non-Health)', color: '#c084fc' },
      { name: 'Memberships & Dues', color: '#d8b4fe' },
    ],
  },
  {
    name: 'Personal',
    color: '#f43f5e',
    isIncome: false,
    children: [
      { name: 'Gifts Given', color: '#f43f5e' },
      { name: 'Donations & Charity', color: '#e11d48' },
      { name: 'Childcare', color: '#be123c' },
      { name: 'Pet Care', color: '#fb7185' },
      { name: 'Dry Cleaning & Laundry', color: '#fda4af' },
      { name: 'Hair & Beauty', color: '#fecdd3' },
    ],
  },
  {
    name: 'Taxes',
    color: '#78716c',
    isIncome: false,
    children: [
      { name: 'Federal Income Tax', color: '#78716c' },
      { name: 'State Income Tax', color: '#57534e' },
      { name: 'Property Tax', color: '#44403c' },
      { name: 'Tax Preparation', color: '#a8a29e' },
    ],
  },
  {
    name: 'Transfers & Adjustments',
    color: '#6b7280',
    isIncome: false,
    categoryType: 'transfer',
    children: [
      { name: 'Transfer to Savings',     color: '#6b7280' },
      { name: 'Transfer to Checking',    color: '#9ca3af' },
      { name: 'Credit Card Payment',     color: '#4b5563' },
      { name: 'Investment Contribution', color: '#374151' },
      { name: 'Loan Principal Payment',  color: '#9ca3af' },
      { name: 'Internal Transfer',       color: '#d1d5db' },
      { name: 'Balance Adjustments',     color: '#6b7280' },
    ],
  },
  {
    name: 'Paycheck Deductions',
    color: '#8b5cf6',
    isIncome: true,
    categoryType: 'compound',
  },
  {
    name: 'Employer Contributions',
    color: '#4f46e5',
    isIncome: true,
    categoryType: 'compound',
  },
];

export async function seedUserCategories(userId: string) {
  const db = getDb();

  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1);

  if (existing.length > 0) return;

  let order = 0;

  for (const group of DEFAULT_CATEGORIES) {
    const [parent] = await db
      .insert(categories)
      .values({
        userId,
        name: group.name,
        color: group.color,
        isIncome: group.isIncome,
        categoryType: group.categoryType ?? 'standard',
        isSystem: true,
        excludeFromReports: group.excludeFromReports ?? false,
        displayOrder: order++,
      })
      .returning();

    if (group.children && parent) {
      for (const child of group.children) {
        await db.insert(categories).values({
          userId,
          parentId: parent.id,
          name: child.name,
          color: child.color,
          isIncome: group.isIncome,
          categoryType: group.categoryType ?? 'standard',
          isSystem: true,
          excludeFromReports: child.excludeFromReports ?? false,
          displayOrder: order++,
        });
      }
    }
  }

  // Seed Paycheck Deductions compound children
  const paycheckParent = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, 'Paycheck Deductions')))
    .limit(1);

  if (paycheckParent[0]) {
    order = await seedCompoundChildren(userId, paycheckParent[0].id, order, COMPOUND_SUBCATEGORIES);
  }

  // Seed Employer Contributions compound children
  const employerParent = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, 'Employer Contributions')))
    .limit(1);

  if (employerParent[0]) {
    await seedCompoundChildren(userId, employerParent[0].id, order, EMPLOYER_CONTRIBUTION_SUBCATEGORIES);
  }
}

async function seedCompoundChildren(userId: string, parentId: string, startOrder: number, subcategories: CompoundChildDef[]): Promise<number> {
  const db = getDb();
  let order = startOrder;

  // Build lookup of expense parent names to IDs
  const allExpenseParents = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, userId), isNull(categories.parentId)));

  const expenseParentByName = new Map(allExpenseParents.map((c) => [c.name, c.id]));

  for (const sub of subcategories) {
    const expenseParentId = expenseParentByName.get(sub.expenseParentName);
    await db.insert(categories).values({
      userId,
      parentId,
      name: sub.name,
      color: sub.color,
      isIncome: true,
      isSystem: true,
      categoryType: 'compound',
      expenseParentId: expenseParentId ?? null,
      displayOrder: order++,
    });
  }

  return order;
}

/** All default subcategories for Transfers & Adjustments, in display order. */
const TRANSFER_SUBCATEGORIES: ChildCategoryDef[] = [
  { name: 'Transfer to Savings',     color: '#6b7280' },
  { name: 'Transfer to Checking',    color: '#9ca3af' },
  { name: 'Credit Card Payment',     color: '#4b5563' },
  { name: 'Investment Contribution', color: '#374151' },
  { name: 'Loan Principal Payment',  color: '#9ca3af' },
  { name: 'Internal Transfer',       color: '#d1d5db' },
  { name: 'Balance Adjustments',     color: '#6b7280' },
];

export async function ensureSystemCategories(userId: string, dek?: Uint8Array) {
  const db = getDb();

  await mergeDuplicateCategories(userId, dek);

  const allCategoriesRaw = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      expenseParentId: categories.expenseParentId,
      name: categories.name,
      displayOrder: categories.displayOrder,
      isSystem: categories.isSystem,
      createdAt: categories.createdAt,
    })
    .from(categories)
    .where(eq(categories.userId, userId));
  const allCategories = dek
    ? await decryptRows('categories', allCategoriesRaw, dek)
    : allCategoriesRaw;

  // Find or create the Transfers & Adjustments parent
  const existingParents = allCategories.filter((c) => !c.parentId && c.name === 'Transfers & Adjustments');

  const [last] = await db
    .select({ maxOrder: sql<number>`max(${categories.displayOrder})` })
    .from(categories)
    .where(eq(categories.userId, userId));
  let order = (last?.maxOrder ?? 0) + 1;

  let parentId: string;

  if (existingParents.length === 0) {
    // Create parent for the first time
    const [parent] = await db
      .insert(categories)
      .values({
        userId,
        name: 'Transfers & Adjustments',
        color: '#6b7280',
        isIncome: false,
        isSystem: true,
        categoryType: 'transfer',
        displayOrder: order++,
      })
      .returning();
    parentId = parent.id;
  } else {
    parentId = existingParents[0].id;
  }

  // Fetch all existing children of this parent
  const existingChildren = allCategories.filter((c) => c.parentId === parentId);
  const existingChildNames = new Set(existingChildren.map((c) => c.name));

  // Upsert any missing subcategories
  let balanceAdjId: string | undefined;
  for (const sub of TRANSFER_SUBCATEGORIES) {
    if (existingChildNames.has(sub.name)) {
      // Already exists — fetch its id only if it's Balance Adjustments (needed for migration below)
      if (sub.name === 'Balance Adjustments') {
        const found = allCategories.find((c) => c.parentId === parentId && c.name === 'Balance Adjustments');
        balanceAdjId = found?.id;
      }
      continue;
    }
    const [inserted] = await db
      .insert(categories)
      .values({
        userId,
        parentId,
        name: sub.name,
        color: sub.color,
        isIncome: false,
        categoryType: 'transfer',
        isSystem: true,
        excludeFromReports: true,
        displayOrder: order++,
      })
      .returning();
    if (sub.name === 'Balance Adjustments') balanceAdjId = inserted.id;
  }

  // Migrate existing adj-* transactions to Balance Adjustments (only uncategorized ones)
  if (balanceAdjId) {
    await db
      .update(transactions)
      .set({ categoryId: balanceAdjId })
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.externalId} LIKE 'adj-%'`,
          isNull(transactions.categoryId)
        )
      );
  }

  // Return the Balance Adjustments subcategory ID (callers use this as categoryId for adj- transactions)
  return balanceAdjId ?? parentId;
}

/**
 * Ensure compound categories exist for a given parent group.
 * Idempotent — safe to call on every sync.
 */
async function ensureCompoundGroup(
  userId: string,
  parentName: string,
  parentColor: string,
  subcategories: CompoundChildDef[],
  dek?: Uint8Array
) {
  const db = getDb();

  await mergeDuplicateCategories(userId, dek);

  const allCategoriesRaw = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      expenseParentId: categories.expenseParentId,
      name: categories.name,
      displayOrder: categories.displayOrder,
      isSystem: categories.isSystem,
      createdAt: categories.createdAt,
    })
    .from(categories)
    .where(eq(categories.userId, userId));
  const allCategories = dek
    ? await decryptRows('categories', allCategoriesRaw, dek)
    : allCategoriesRaw;

  const existingParents = allCategories.filter((c) => !c.parentId && c.name === parentName);

  const [last] = await db
    .select({ maxOrder: sql<number>`max(${categories.displayOrder})` })
    .from(categories)
    .where(eq(categories.userId, userId));
  let order = (last?.maxOrder ?? 0) + 1;

  let parentId: string;

  if (existingParents.length === 0) {
    const [parent] = await db
      .insert(categories)
      .values({
        userId,
        name: parentName,
        color: parentColor,
        isIncome: true,
        categoryType: 'compound',
        isSystem: true,
        excludeFromReports: false,
        displayOrder: order++,
      })
      .returning();
    parentId = parent.id;
  } else {
    parentId = existingParents[0].id;
  }

  const existingChildren = allCategories.filter((c) => c.parentId === parentId);
  const existingChildrenByName = new Map(existingChildren.map((c) => [c.name, c]));

  const allExpenseParents = allCategories.filter((c) => !c.parentId);

  const expenseParentByName = new Map(allExpenseParents.map((c) => [c.name, c.id]));
  const neededExpenseParentNames = [...new Set(subcategories.map((sub) => sub.expenseParentName))];

  for (const expenseParentName of neededExpenseParentNames) {
    if (expenseParentByName.has(expenseParentName)) continue;

    const defaultParent = DEFAULT_CATEGORIES.find((group) => group.name === expenseParentName);
    if (!defaultParent) continue;

    const [createdParent] = await db
      .insert(categories)
      .values({
        userId,
        name: defaultParent.name,
        color: defaultParent.color,
        isIncome: defaultParent.isIncome,
        categoryType: defaultParent.categoryType ?? 'standard',
        isSystem: true,
        excludeFromReports: defaultParent.excludeFromReports ?? false,
        displayOrder: order++,
      })
      .returning();

    expenseParentByName.set(createdParent.name, createdParent.id);
  }

  for (const sub of subcategories) {
    const expenseParentId = expenseParentByName.get(sub.expenseParentName);
    const existingChild = existingChildrenByName.get(sub.name);
    if (existingChild) {
      if (expenseParentId && existingChild.expenseParentId !== expenseParentId) {
        await db
          .update(categories)
          .set({ expenseParentId })
          .where(and(eq(categories.userId, userId), eq(categories.id, existingChild.id)));
      }
      continue;
    }

    await db.insert(categories).values({
      userId,
      parentId,
      name: sub.name,
      color: sub.color,
      isIncome: true,
      isSystem: true,
      categoryType: 'compound',
      expenseParentId: expenseParentId ?? null,
      displayOrder: order++,
    });
  }
}

export async function ensureCompoundCategories(userId: string, dek?: Uint8Array) {
  await ensureCompoundGroup(userId, 'Paycheck Deductions', '#8b5cf6', COMPOUND_SUBCATEGORIES, dek);
}

export async function ensureEmployerContributions(userId: string, dek?: Uint8Array) {
  await ensureCompoundGroup(userId, 'Employer Contributions', '#4f46e5', EMPLOYER_CONTRIBUTION_SUBCATEGORIES, dek);
}
