import { getDb } from '@/lib/db';
import { categoryRules, categories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

type DefaultRuleDef = {
  name: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  conditionCaseSensitive?: boolean;
  categoryGroup: string;
  categoryName: string;
};

export const DEFAULT_RULES: DefaultRuleDef[] = [
  // ── Food & Dining > Coffee Shops ──────────────────────────────────────
  { name: 'Starbucks', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'STARBUCKS', categoryGroup: 'Food & Dining', categoryName: 'Coffee Shops' },
  { name: 'Dunkin\'', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'DUNKIN', categoryGroup: 'Food & Dining', categoryName: 'Coffee Shops' },

  // ── Food & Dining > Food Delivery ─────────────────────────────────────
  // Uber Eats must come BEFORE Uber (rides)
  { name: 'Uber Eats', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'UBER EATS', categoryGroup: 'Food & Dining', categoryName: 'Food Delivery' },
  { name: 'DoorDash', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'DOORDASH', categoryGroup: 'Food & Dining', categoryName: 'Food Delivery' },
  { name: 'Grubhub', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'GRUBHUB', categoryGroup: 'Food & Dining', categoryName: 'Food Delivery' },

  // ── Food & Dining > Restaurants & Dining Out ──────────────────────────
  { name: 'McDonald\'s', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'MCDONALD', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Taco Bell', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'TACO BELL', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Chipotle', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'CHIPOTLE', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Chick-fil-A', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'CHICK-FIL', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Wendy\'s', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'WENDY', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Burger King', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'BURGER KING', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Subway', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'SUBWAY', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Domino\'s', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'DOMINO', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Pizza Hut', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PIZZA HUT', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Panera', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PANERA', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Olive Garden', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'OLIVE GARDEN', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Five Guys', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'FIVE GUYS', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'Whataburger', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'WHATABURGER', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },
  { name: 'In-N-Out', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'IN-N-OUT', categoryGroup: 'Food & Dining', categoryName: 'Restaurants & Dining Out' },

  // ── Food & Dining > Groceries ─────────────────────────────────────────
  { name: 'Walmart', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'WALMART', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Costco', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'COSTCO', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Kroger', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'KROGER', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Trader Joe\'s', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'TRADER JOE', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Whole Foods', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'WHOLE FOODS', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Publix', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PUBLIX', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Safeway', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'SAFEWAY', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Albertsons', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'ALBERTSONS', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Aldi', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'ALDI', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Wegmans', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'WEGMANS', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'H-E-B', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'H-E-B', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },
  { name: 'Meijer', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'MEIJER', categoryGroup: 'Food & Dining', categoryName: 'Groceries' },

  // ── Shopping > Online Shopping ────────────────────────────────────────
  // Amazon Prime must come BEFORE Amazon
  { name: 'Amazon Prime', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'AMAZON PRIME', categoryGroup: 'Bills & Subscriptions', categoryName: 'Streaming Services' },
  { name: 'Amazon', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'AMAZON', categoryGroup: 'Shopping', categoryName: 'Online Shopping' },
  { name: 'Target', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'TARGET', categoryGroup: 'Shopping', categoryName: 'Online Shopping' },
  { name: 'eBay', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'EBAY', categoryGroup: 'Shopping', categoryName: 'Online Shopping' },
  { name: 'Etsy', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'ETSY', categoryGroup: 'Shopping', categoryName: 'Online Shopping' },
  { name: 'PayPal', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PAYPAL', categoryGroup: 'Shopping', categoryName: 'Online Shopping' },

  // ── Shopping > Electronics ────────────────────────────────────────────
  // Apple Music, Apple TV, and iCloud must come BEFORE generic Apple
  { name: 'Apple Music', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'APPLE MUSIC', categoryGroup: 'Entertainment', categoryName: 'Music & Streaming' },
  { name: 'Apple TV+', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'APPLE TV', categoryGroup: 'Bills & Subscriptions', categoryName: 'Streaming Services' },
  { name: 'iCloud', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'ICLOUD', categoryGroup: 'Bills & Subscriptions', categoryName: 'Software Subscriptions' },
  { name: 'Apple', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'APPLE', categoryGroup: 'Shopping', categoryName: 'Electronics' },
  { name: 'Best Buy', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'BEST BUY', categoryGroup: 'Shopping', categoryName: 'Electronics' },

  // ── Shopping > Clothing & Apparel ─────────────────────────────────────
  { name: 'Nike', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'NIKE', categoryGroup: 'Shopping', categoryName: 'Clothing & Apparel' },
  { name: 'Old Navy', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'OLD NAVY', categoryGroup: 'Shopping', categoryName: 'Clothing & Apparel' },
  { name: 'H&M', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'H&M', categoryGroup: 'Shopping', categoryName: 'Clothing & Apparel' },
  { name: 'Macy\'s', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'MACYS', categoryGroup: 'Shopping', categoryName: 'Clothing & Apparel' },
  { name: 'Kohl\'s', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'KOHL', categoryGroup: 'Shopping', categoryName: 'Clothing & Apparel' },

  // ── Shopping > Home Goods ─────────────────────────────────────────────
  { name: 'Home Depot', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'HOME DEPOT', categoryGroup: 'Shopping', categoryName: 'Home Goods' },
  { name: 'Lowe\'s', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'LOWE', categoryGroup: 'Shopping', categoryName: 'Home Goods' },
  { name: 'IKEA', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'IKEA', categoryGroup: 'Shopping', categoryName: 'Home Goods' },

  // ── Entertainment > Music & Streaming ─────────────────────────────────
  { name: 'Netflix', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'NETFLIX', categoryGroup: 'Entertainment', categoryName: 'Music & Streaming' },
  { name: 'Spotify', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'SPOTIFY', categoryGroup: 'Entertainment', categoryName: 'Music & Streaming' },
  { name: 'Hulu', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'HULU', categoryGroup: 'Entertainment', categoryName: 'Music & Streaming' },
  { name: 'Disney+', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'DISNEY', categoryGroup: 'Entertainment', categoryName: 'Music & Streaming' },

  // ── Bills & Subscriptions > Streaming Services ────────────────────────
  { name: 'HBO', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'HBO', categoryGroup: 'Bills & Subscriptions', categoryName: 'Streaming Services' },
  { name: 'Paramount+', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PARAMOUNT', categoryGroup: 'Bills & Subscriptions', categoryName: 'Streaming Services' },
  { name: 'Peacock', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PEACOCK', categoryGroup: 'Bills & Subscriptions', categoryName: 'Streaming Services' },
  { name: 'YouTube', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'YOUTUBE', categoryGroup: 'Bills & Subscriptions', categoryName: 'Streaming Services' },

  // ── Entertainment > Gaming ────────────────────────────────────────────
  { name: 'Steam', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'STEAM', categoryGroup: 'Entertainment', categoryName: 'Gaming' },
  { name: 'Xbox', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'XBOX', categoryGroup: 'Entertainment', categoryName: 'Gaming' },
  { name: 'PlayStation', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PLAYSTATION', categoryGroup: 'Entertainment', categoryName: 'Gaming' },
  { name: 'Nintendo', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'NINTENDO', categoryGroup: 'Entertainment', categoryName: 'Gaming' },

  // ── Entertainment > Movies & Events ───────────────────────────────────
  { name: 'AMC Theatres', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'AMC', categoryGroup: 'Entertainment', categoryName: 'Movies & Events' },
  { name: 'Ticketmaster', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'TICKETMASTER', categoryGroup: 'Entertainment', categoryName: 'Movies & Events' },

  // ── Bills & Subscriptions > Software Subscriptions ────────────────────
  { name: 'Microsoft 365', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'MICROSOFT', categoryGroup: 'Bills & Subscriptions', categoryName: 'Software Subscriptions' },
  { name: 'Google', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'GOOGLE', categoryGroup: 'Bills & Subscriptions', categoryName: 'Software Subscriptions' },
  { name: 'Adobe', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'ADOBE', categoryGroup: 'Bills & Subscriptions', categoryName: 'Software Subscriptions' },
  { name: 'Dropbox', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'DROPBOX', categoryGroup: 'Bills & Subscriptions', categoryName: 'Software Subscriptions' },

  // ── Transportation > Gas & Fuel ───────────────────────────────────────
  { name: 'Shell', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'SHELL', categoryGroup: 'Transportation', categoryName: 'Gas & Fuel' },
  { name: 'Exxon', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'EXXON', categoryGroup: 'Transportation', categoryName: 'Gas & Fuel' },
  { name: 'Chevron', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'CHEVRON', categoryGroup: 'Transportation', categoryName: 'Gas & Fuel' },
  { name: 'BP', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'BP ', categoryGroup: 'Transportation', categoryName: 'Gas & Fuel' },

  // ── Transportation > Public Transit & Ride Share ──────────────────────
  // Uber (rides) must come AFTER Uber Eats
  { name: 'Uber', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'UBER', categoryGroup: 'Transportation', categoryName: 'Public Transit & Ride Share' },
  { name: 'Lyft', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'LYFT', categoryGroup: 'Transportation', categoryName: 'Public Transit & Ride Share' },

  // ── Transportation > Parking & Tolls ──────────────────────────────────
  { name: 'E-ZPass', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'EZPASS', categoryGroup: 'Transportation', categoryName: 'Parking & Tolls' },

  // ── Health & Medical > Pharmacy & Prescriptions ───────────────────────
  { name: 'CVS', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'CVS', categoryGroup: 'Health & Medical', categoryName: 'Pharmacy & Prescriptions' },
  { name: 'Walgreens', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'WALGREENS', categoryGroup: 'Health & Medical', categoryName: 'Pharmacy & Prescriptions' },

  // ── Health & Medical > Gym & Fitness ──────────────────────────────────
  { name: 'Planet Fitness', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PLANET FITNESS', categoryGroup: 'Health & Medical', categoryName: 'Gym & Fitness' },
  { name: '24 Hour Fitness', conditionField: 'description', conditionOperator: 'contains', conditionValue: '24 HOUR FITNESS', categoryGroup: 'Health & Medical', categoryName: 'Gym & Fitness' },
  { name: 'LA Fitness', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'LA FITNESS', categoryGroup: 'Health & Medical', categoryName: 'Gym & Fitness' },

  // ── Travel > Flights ──────────────────────────────────────────────────
  { name: 'Delta', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'DELTA', categoryGroup: 'Travel', categoryName: 'Flights' },
  { name: 'American Airlines', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'AMERICAN AIRLINES', categoryGroup: 'Travel', categoryName: 'Flights' },
  { name: 'Southwest', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'SOUTHWEST AIRLINES', categoryGroup: 'Travel', categoryName: 'Flights' },
  { name: 'JetBlue', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'JETBLUE', categoryGroup: 'Travel', categoryName: 'Flights' },

  // ── Travel > Hotels & Lodging ─────────────────────────────────────────
  { name: 'Marriott', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'MARRIOTT', categoryGroup: 'Travel', categoryName: 'Hotels & Lodging' },
  { name: 'Hilton', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'HILTON', categoryGroup: 'Travel', categoryName: 'Hotels & Lodging' },
  { name: 'Airbnb', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'AIRBNB', categoryGroup: 'Travel', categoryName: 'Hotels & Lodging' },
  { name: 'Hotels.com', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'HOTELS.COM', categoryGroup: 'Travel', categoryName: 'Hotels & Lodging' },

  // ── Travel > Travel Experiences ───────────────────────────────────────
  { name: 'Expedia', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'EXPEDIA', categoryGroup: 'Travel', categoryName: 'Travel Experiences' },

  // ── Utilities > Phone & Cellular ──────────────────────────────────────
  { name: 'AT&T', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'AT&T', categoryGroup: 'Utilities', categoryName: 'Phone & Cellular' },
  { name: 'Verizon', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'VERIZON', categoryGroup: 'Utilities', categoryName: 'Phone & Cellular' },
  { name: 'T-Mobile', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'T-MOBILE', categoryGroup: 'Utilities', categoryName: 'Phone & Cellular' },

  // ── Utilities > Internet ──────────────────────────────────────────────
  { name: 'Xfinity', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'XFINITY', categoryGroup: 'Utilities', categoryName: 'Internet' },
  { name: 'Spectrum', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'SPECTRUM', categoryGroup: 'Utilities', categoryName: 'Internet' },

  // ── Utilities > Electricity ───────────────────────────────────────────
  { name: 'PG&E', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'PG&E', categoryGroup: 'Utilities', categoryName: 'Electricity' },
  { name: 'Duke Energy', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'DUKE ENERGY', categoryGroup: 'Utilities', categoryName: 'Electricity' },

  // ── Taxes > Tax Preparation ───────────────────────────────────────────
  { name: 'TurboTax', conditionField: 'description', conditionOperator: 'contains', conditionValue: 'TURBOTAX', categoryGroup: 'Taxes', categoryName: 'Tax Preparation' },
];

export async function seedUserDefaultRules(userId: string) {
  const db = getDb();

  const existing = await db
    .select({ id: categoryRules.id })
    .from(categoryRules)
    .where(eq(categoryRules.userId, userId))
    .limit(1);

  if (existing.length > 0) return;

  const userCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(eq(categories.userId, userId));

  const parentCategories = userCategories.filter((c) => !c.parentId);
  const childCategories = userCategories.filter((c) => c.parentId);

  const categoryMap = new Map<string, string>();

  for (const child of childCategories) {
    const parent = parentCategories.find((p) => p.id === child.parentId);
    if (parent) {
      const key = `${parent.name}›${child.name}`;
      categoryMap.set(key, child.id);
    }
  }

  const values: (typeof categoryRules.$inferInsert)[] = [];

  for (let priority = 0; priority < DEFAULT_RULES.length; priority++) {
    const rule = DEFAULT_RULES[priority];
    const categoryId = categoryMap.get(`${rule.categoryGroup}›${rule.categoryName}`);

    if (!categoryId) continue;

    values.push({
      userId,
      name: rule.name,
      priority,
      isActive: true,
      conditionField: rule.conditionField,
      conditionOperator: rule.conditionOperator,
      conditionValue: rule.conditionValue,
      conditionCaseSensitive: rule.conditionCaseSensitive ?? false,
      setCategoryId: categoryId,
      setPayee: null,
      setReviewed: null,
      isSystem: true,
    });
  }

  if (values.length > 0) {
    await db.insert(categoryRules).values(values);
  }
}
