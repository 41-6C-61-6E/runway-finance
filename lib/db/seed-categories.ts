import { getDb } from '@/lib/db';
import { categories, transactions } from '@/lib/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';

type ChildCategoryDef = {
  name: string;
  color: string;
  excludeFromReports?: boolean;
};

type CategoryDef = {
  name: string;
  color: string;
  isIncome: boolean;
  excludeFromReports?: boolean;
  children?: ChildCategoryDef[];
};

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
      { name: 'Investments & Contributions', color: '#cbd5e1' },
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
    excludeFromReports: true,
    children: [
      { name: 'Balance Adjustments', color: '#6b7280', excludeFromReports: true },
    ],
  },
];

const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#06b6d4',
  '#0ea5e9', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#64748b', '#78716c',
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
          isSystem: true,
          excludeFromReports: child.excludeFromReports ?? false,
          displayOrder: order++,
        });
      }
    }
  }
}

export async function ensureSystemCategories(userId: string) {
  const db = getDb();

  const existing = await db
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, 'Transfers & Adjustments')))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [last] = await db
    .select({ maxOrder: sql<number>`max(${categories.displayOrder})` })
    .from(categories)
    .where(eq(categories.userId, userId));
  let order = (last?.maxOrder ?? 0) + 1;

  const [parent] = await db
    .insert(categories)
    .values({
      userId,
      name: 'Transfers & Adjustments',
      color: '#6b7280',
      isIncome: false,
      isSystem: true,
      excludeFromReports: true,
      displayOrder: order++,
    })
    .returning();

  const [child] = await db
    .insert(categories)
    .values({
      userId,
      parentId: parent.id,
      name: 'Balance Adjustments',
      color: '#6b7280',
      isIncome: false,
      isSystem: true,
      excludeFromReports: true,
      displayOrder: order++,
    })
    .returning();

  // Migrate existing adj-* transactions to Balance Adjustments
  await db
    .update(transactions)
    .set({ categoryId: child.id })
    .where(
      and(
        eq(transactions.userId, userId),
        sql`${transactions.externalId} LIKE 'adj-%'`,
        isNull(transactions.categoryId)
      )
    );

  return child.id;
}
