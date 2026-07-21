// ── 2026 Default Retirement Rules & Constants ─────────────────────────────────

export interface TaxBracket {
  rate: number;
  threshold: number;
}

export interface IRMAABracket {
  magiSingle: number;
  magiJoint: number;
  partBMonthly: number;
  partDMonthly: number;
}

export interface HistoricalYearReturn {
  year: number;
  stocksGrowth: number; // e.g. 0.08 for 8%
  stocksYield: number;
  bondsGrowth: number;
  bondsYield: number;
  inflationRate: number;
}

export const DEFAULT_2026_RULES = {
  taxYear: 2026,
  filingStatus: 'single',
  standardDeduction: '15000',
  ordinaryTaxBrackets: [
    { rate: 0.10, threshold: 0 },
    { rate: 0.12, threshold: 11925 },
    { rate: 0.22, threshold: 48475 },
    { rate: 0.24, threshold: 103350 },
    { rate: 0.32, threshold: 197300 },
    { rate: 0.35, threshold: 250525 },
    { rate: 0.37, threshold: 626350 },
  ],
  capitalGainsBrackets: [
    { rate: 0.00, threshold: 0 },
    { rate: 0.15, threshold: 48350 },
    { rate: 0.20, threshold: 533400 },
  ],
  niitThreshold: '200000',
  irmaaThresholds: [
    { magiSingle: 0, magiJoint: 0, partBMonthly: 174.70, partDMonthly: 0.00 },
    { magiSingle: 103000, magiJoint: 206000, partBMonthly: 244.60, partDMonthly: 12.90 },
    { magiSingle: 129000, magiJoint: 258000, partBMonthly: 349.40, partDMonthly: 33.30 },
    { magiSingle: 161000, magiJoint: 322000, partBMonthly: 454.20, partDMonthly: 53.80 },
    { magiSingle: 193000, magiJoint: 386000, partBMonthly: 559.00, partDMonthly: 74.20 },
    { magiSingle: 500000, magiJoint: 750000, partBMonthly: 594.00, partDMonthly: 81.00 },
  ],
  ssTaxationThresholds: {
    single: { tier1: 25000, tier2: 34000 },
    married_joint: { tier1: 32000, tier2: 44000 },
  },
  contributionLimits: {
    ira: 7000,
    iraCatchUp: 1000, // age >= 50
    k401: 23000,
    k401CatchUp: 7500, // age >= 50
    hsaSingle: 4150,
    hsaFamily: 8300,
    hsaCatchUp: 1000, // age >= 55
  },
  giftEstateExemptions: {
    annualGiftLimit: 18000,
    lifetimeEstateLimit: 13610000,
  },
  acaSubsidyTable: [
    { fplPercent: 100, premiumCapPercent: 0.00 },
    { fplPercent: 150, premiumCapPercent: 0.00 },
    { fplPercent: 200, premiumCapPercent: 0.02 },
    { fplPercent: 250, premiumCapPercent: 0.04 },
    { fplPercent: 300, premiumCapPercent: 0.06 },
    { fplPercent: 400, premiumCapPercent: 0.085 },
  ],
  fplAmount: '15060',
  secureActRules: {
    rmdAge: 73, // age 73 for birth 1951-1959, 75 for 1960+
    inheritedIraYears: 10,
  },
};

// ── IRS Uniform Lifetime Table III (RMD Divisors) ────────────────────────────
export const IRS_UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.3,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
  111: 3.4,
  112: 3.3,
  113: 3.1,
  114: 3.0,
  115: 2.9,
  116: 2.8,
  117: 2.7,
  118: 2.5,
  119: 2.3,
  120: 2.0,
};

// ── Historical S&P 500 & US Bond Indices (Sample 1928–2025 data) ──────────────
export const HISTORICAL_RETURNS_DATA: HistoricalYearReturn[] = [
  { year: 1928, stocksGrowth: 0.3788, stocksYield: 0.045, bondsGrowth: 0.0084, bondsYield: 0.035, inflationRate: -0.0116 },
  { year: 1929, stocksGrowth: -0.1191, stocksYield: 0.047, bondsGrowth: 0.0420, bondsYield: 0.036, inflationRate: 0.0058 },
  { year: 1930, stocksGrowth: -0.2848, stocksYield: 0.052, bondsGrowth: 0.0454, bondsYield: 0.033, inflationRate: -0.0640 },
  { year: 1931, stocksGrowth: -0.4384, stocksYield: 0.068, bondsGrowth: -0.0256, bondsYield: 0.037, inflationRate: -0.0932 },
  { year: 1932, stocksGrowth: -0.0819, stocksYield: 0.071, bondsGrowth: 0.0879, bondsYield: 0.035, inflationRate: -0.1027 },
  { year: 1933, stocksGrowth: 0.4998, stocksYield: 0.044, bondsGrowth: 0.0186, bondsYield: 0.031, inflationRate: 0.0076 },
  { year: 1966, stocksGrowth: -0.0997, stocksYield: 0.033, bondsGrowth: 0.0369, bondsYield: 0.047, inflationRate: 0.0335 },
  { year: 1973, stocksGrowth: -0.1466, stocksYield: 0.036, bondsGrowth: -0.0111, bondsYield: 0.067, inflationRate: 0.0871 },
  { year: 1974, stocksGrowth: -0.2647, stocksYield: 0.054, bondsGrowth: 0.0199, bondsYield: 0.076, inflationRate: 0.1234 },
  { year: 1999, stocksGrowth: 0.2104, stocksYield: 0.012, bondsGrowth: -0.0825, bondsYield: 0.065, inflationRate: 0.0268 },
  { year: 2000, stocksGrowth: -0.0910, stocksYield: 0.012, bondsGrowth: 0.1666, bondsYield: 0.060, inflationRate: 0.0339 },
  { year: 2001, stocksGrowth: -0.1189, stocksYield: 0.014, bondsGrowth: 0.0557, bondsYield: 0.055, inflationRate: 0.0155 },
  { year: 2002, stocksGrowth: -0.2210, stocksYield: 0.018, bondsGrowth: 0.1512, bondsYield: 0.046, inflationRate: 0.0238 },
  { year: 2008, stocksGrowth: -0.3700, stocksYield: 0.032, bondsGrowth: 0.2010, bondsYield: 0.037, inflationRate: 0.0010 },
  { year: 2009, stocksGrowth: 0.2646, stocksYield: 0.020, bondsGrowth: -0.1112, bondsYield: 0.038, inflationRate: 0.0272 },
  { year: 2021, stocksGrowth: 0.2871, stocksYield: 0.013, bondsGrowth: -0.0442, bondsYield: 0.015, inflationRate: 0.0704 },
  { year: 2022, stocksGrowth: -0.1811, stocksYield: 0.017, bondsGrowth: -0.1783, bondsYield: 0.039, inflationRate: 0.0645 },
  { year: 2023, stocksGrowth: 0.2629, stocksYield: 0.016, bondsGrowth: 0.0553, bondsYield: 0.042, inflationRate: 0.0335 },
  { year: 2024, stocksGrowth: 0.2423, stocksYield: 0.015, bondsGrowth: 0.0168, bondsYield: 0.044, inflationRate: 0.0270 },
  { year: 2025, stocksGrowth: 0.1100, stocksYield: 0.015, bondsGrowth: 0.0250, bondsYield: 0.045, inflationRate: 0.0250 },
];
