export const ALL_COLUMNS: string[] = [
  "select",
  "date",
  "postedDate",
  "description",
  "ai",
  "account",
  "accountType",
  "category",
  "tags",
  "amount",
];

export const COLUMN_LABELS: Record<string, string> = {
  select: "",
  date: "Date",
  postedDate: "Posted",
  description: "Description",
  ai: "AI",
  account: "Account",
  accountType: "Account Type",
  category: "Category",
  tags: "Tags",
  amount: "Amount",
};

export const COLUMN_MIN_WIDTHS: Record<string, number> = {
  select: 40,
  date: 95,
  postedDate: 70,
  description: 80,
  ai: 30,
  account: 60,
  accountType: 60,
  category: 80,
  tags: 50,
  amount: 70,
};

