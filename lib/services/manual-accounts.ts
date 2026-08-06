import { getDb } from '@/lib/db';
import { accounts, transactions, accountSnapshots, netWorthSnapshots, userSettings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { ensureSystemCategories, ensureCompoundCategories, ensureEmployerContributions } from '@/lib/db/seed-categories';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { decryptField, encryptField, encryptRow } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import type { ApiConfig } from '@/lib/services/asset-estimator';
import { API_KEY_DEFAULTS } from '@/config/defaults';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { TYPE_HIERARCHY } from '@/lib/constants/account-types';
import { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots, convertCurrency, roundToCents, getAccountEarliestCalculationDate, formatToCents } from '@/lib/services/account-history';

const LOG_TAG = '[manual-accounts]';

export type { ApiConfig };

const DEFAULT_API_CONFIG: ApiConfig = { ...API_KEY_DEFAULTS };

export function normalizeRedfinApiUrl(url?: string): string {
  const fallback = DEFAULT_API_CONFIG.redfinApiUrl || 'https://www.redfin.com/stingray';
  if (!url || typeof url !== 'string' || !url.trim()) {
    return fallback;
  }
  let trimmed = url.trim().replace(/\/+$/, '');
  trimmed = trimmed.replace(/\/what-is-my-home-worth\/?$/, '');
  if (!trimmed.endsWith('/stingray')) {
    trimmed = `${trimmed}/stingray`;
  }
  return trimmed;
}

export async function readApiConfig(userId: string): Promise<ApiConfig> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({ apiKeys: userSettings.apiKeys })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    let keys: Record<string, string> = {};
    if (settings?.apiKeys) {
      const dek = await getSessionDEK();
      const decrypted = await decryptField(settings.apiKeys, dek);
      keys = JSON.parse(decrypted);
    }
    return {
      metalsApiUrl: keys.metalsApiUrl || DEFAULT_API_CONFIG.metalsApiUrl,
      metalsApiKey: keys.metalsApiKey || '',
      redfinApiUrl: normalizeRedfinApiUrl(keys.redfinApiUrl),
      fredApiUrl: keys.fredApiUrl || DEFAULT_API_CONFIG.fredApiUrl,
      fredApiKey: keys.fredApiKey || (typeof process !== 'undefined' ? (process.env.FRED_API_KEY ?? '') : ''),
      btcApiUrl: keys.btcApiUrl || DEFAULT_API_CONFIG.btcApiUrl,
      btcApiKey: keys.btcApiKey || '',
      btcXpubApiUrl: keys.btcXpubApiUrl || DEFAULT_API_CONFIG.btcXpubApiUrl,
    };

  } catch (err) {
    // May fail if no session DEK is available, fall back to defaults
    return { ...DEFAULT_API_CONFIG };
  }
}

export const MANUAL_ACCOUNT_TYPES: string[] = [
  'realestate', 'vehicle', 'crypto', 'gold', 'silver', 'otherAsset', 'mortgage', 'cash',
  ...Object.keys(TYPE_HIERARCHY),
];

export const ACCOUNT_TYPE_MAP: Record<string, string> = {
  realestate: 'realestate',
  vehicle: 'vehicle',
  crypto: 'crypto',
  gold: 'metals',
  silver: 'metals',
  otherAsset: 'otherAsset',
  mortgage: 'mortgage',
  cash: 'cash',
};



function nowISO(): string {
  return new Date().toISOString().split('T')[0];
}

function adjExternalId(): string {
  return `adj-${randomUUID()}`;
}

function manualExternalId(): string {
  return `manual-${randomUUID()}`;
}

function cleanRedfinJson(text: string): any {
  const cleanText = text.replace(/^\{\}&&/, '');
  return JSON.parse(cleanText);
}

function extractPropertyIdFromHtml(html: string): string | undefined {
  // Check 1: Decoded Yahoo RU= redirect parameters
  const ruMatches = html.match(/RU=([^&"'>]+)/gi) || [];
  for (const m of ruMatches) {
    const decoded = decodeURIComponent(m.replace(/^RU=/i, ''));
    try {
      const parsedUrl = new URL(decoded);
      if (
        (parsedUrl.hostname === 'redfin.com' || parsedUrl.hostname.endsWith('.redfin.com')) &&
        parsedUrl.pathname.includes('/home/')
      ) {
        const propIdMatch = parsedUrl.pathname.match(/\/home\/(\d+)/);
        if (propIdMatch) return propIdMatch[1];
      }
    } catch {}
  }

  // Check 2: Direct Redfin property URLs anywhere in HTML
  const directMatches = html.match(/https?:\/\/(?:www\.)?redfin\.com\/[^\s"'>]*\/home\/(\d+)/gi) || [];
  for (const m of directMatches) {
    try {
      const parsedUrl = new URL(m);
      if (parsedUrl.hostname === 'redfin.com' || parsedUrl.hostname.endsWith('.redfin.com')) {
        const propIdMatch = parsedUrl.pathname.match(/\/home\/(\d+)/);
        if (propIdMatch) return propIdMatch[1];
      }
    } catch {}
  }

  return undefined;
}

export interface RedfinEstimates {
  normal: number;
  conservative: number;
  optimistic: number;
}

export async function fetchRedfinValuationDetails(
  params: {
    address: string;
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
  },
  apiConfig?: ApiConfig
): Promise<RedfinEstimates> {
  const address = params.address.trim();
  const baseUrl = normalizeRedfinApiUrl(apiConfig?.redfinApiUrl);
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  let propertyId: string | undefined;

  // Step 1: Support direct Redfin property URL or numeric Property ID in address input
  const urlMatch = address.match(/\/home\/(\d+)/) || address.match(/^(\d+)$/);
  if (urlMatch) {
    propertyId = urlMatch[1];
    logger.info(`${LOG_TAG} Extracted Redfin property ID directly from input`, { propertyId, address });
  }

  // Step 2: Search web for exact Redfin property URL if address is text
  if (!propertyId) {
    try {
      const yahooUrl = `https://search.yahoo.com/search?p=site:redfin.com+${encodeURIComponent(address)}`;
      logger.info(`${LOG_TAG} Web search lookup for Redfin property URL`, { address, url: yahooUrl });
      const res = await fetch(yahooUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (res.ok) {
        const html = await res.text();
        propertyId = extractPropertyIdFromHtml(html);
        if (propertyId) {
          logger.info(`${LOG_TAG} Resolved Redfin property ID via web search`, { propertyId, address });
        }
      }
    } catch (err) {
      logger.warn(`${LOG_TAG} Web search lookup error`, { address, error: String(err) });
    }

    // Secondary fallback: DuckDuckGo HTML search if Yahoo search returned no matches
    if (!propertyId) {
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=site:redfin.com+${encodeURIComponent(address)}`;
        logger.info(`${LOG_TAG} DuckDuckGo fallback for Redfin property URL`, { address, url: ddgUrl });
        const ddgRes = await fetch(ddgUrl, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        if (ddgRes.ok) {
          const html = await ddgRes.text();
          propertyId = extractPropertyIdFromHtml(html);
          if (propertyId) {
            logger.info(`${LOG_TAG} Resolved Redfin property ID via DuckDuckGo search`, { propertyId, address });
          }
        }
      } catch (err) {
        logger.warn(`${LOG_TAG} DuckDuckGo search lookup error`, { address, error: String(err) });
      }
    }
  }

  let matchedHome: any;

  // Step 3: US Census Geocoder + GIS spatial query ONLY if exact street line matches
  if (!propertyId) {
    let lat: number | undefined;
    let lon: number | undefined;

    try {
      const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
      logger.info(`${LOG_TAG} US Census geocoding call`, { address, url: censusUrl });
      const censusRes = await fetch(censusUrl, {
        headers: { 'User-Agent': 'RunwayFinance/1.0' },
      });
      if (censusRes.ok) {
        const censusJson = await censusRes.json() as any;
        const match = censusJson.result?.addressMatches?.[0];
        if (match?.coordinates) {
          lon = parseFloat(match.coordinates.x);
          lat = parseFloat(match.coordinates.y);
        }
      }
    } catch (err) {
      logger.warn(`${LOG_TAG} US Census geocoding error`, { address, error: String(err) });
    }

    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      const d = 0.005;
      const poly = `${lon - d}+${lat - d},${lon + d}+${lat - d},${lon + d}+${lat + d},${lon - d}+${lat + d},${lon - d}+${lat - d}`;
      const gisUrl = `${baseUrl}/api/gis?al=1&poly=${poly}&v=8`;
      logger.info(`${LOG_TAG} Redfin GIS call`, { address, url: gisUrl });

      try {
        const gisRes = await fetch(gisUrl, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.redfin.com/',
          },
        });

        if (gisRes.ok) {
          const text = await gisRes.text();
          const json = cleanRedfinJson(text);
          const homes = json.payload?.homes || [];
          const streetPart = address.split(',')[0].toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

          for (const h of homes) {
            const s = (h.streetLine?.value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
            // Strict match ONLY - never fallback to arbitrary homes[0]
            if (s && (s.includes(streetPart) || streetPart.includes(s))) {
              matchedHome = h;
              propertyId = String(h.propertyId);
              break;
            }
          }
        }
      } catch (err) {
        logger.warn(`${LOG_TAG} GIS query error`, { address, error: String(err) });
      }
    }
  }

  // Step 3: Query Redfin AVM endpoint if propertyId found
  let normalPrice: number | undefined;
  let lowPrice: number | undefined;
  let highPrice: number | undefined;
  let isRateLimited = false;

  const targetPropId = propertyId || matchedHome?.propertyId;

  if (targetPropId) {
    try {
      const avmUrl = `${baseUrl}/api/home/details/avm?propertyId=${targetPropId}&accessLevel=1`;
      logger.info(`${LOG_TAG} Redfin AVM call`, { propertyId: targetPropId, url: avmUrl });
      const avmRes = await fetch(avmUrl, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.redfin.com/',
        },
      });
      if (avmRes.status === 403 || avmRes.status === 429 || avmRes.status === 503) {
        isRateLimited = true;
        logger.warn(`${LOG_TAG} Redfin AVM rate limited (HTTP ${avmRes.status})`, { propertyId: targetPropId });
      } else if (avmRes.ok) {
        const text = await avmRes.text();
        const trimmed = text.trim().toLowerCase();
        if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('challenge') || trimmed.includes('captcha')) {
          isRateLimited = true;
          logger.warn(`${LOG_TAG} Redfin AVM returned WAF challenge/captcha page`, { propertyId: targetPropId });
        } else {
          try {
            const json = cleanRedfinJson(text);
            const p = json.payload || {};
            normalPrice = p.predictedValue ?? p.value ?? p.price;
            lowPrice = p.priceRangeLow ?? p.predictedValueMin ?? p.priceRangeMin;
            highPrice = p.priceRangeHigh ?? p.predictedValueMax ?? p.priceRangeMax;
          } catch (jsonErr) {
            isRateLimited = true;
            logger.warn(`${LOG_TAG} Redfin AVM JSON parse error (likely WAF challenge)`, { propertyId: targetPropId, error: String(jsonErr) });
          }
        }
      }
    } catch (err) {
      logger.warn(`${LOG_TAG} AVM query error`, { propertyId: targetPropId, error: String(err) });
    }
  }

  // Fallback to GIS price if AVM response is not available
  if (!normalPrice && matchedHome?.price?.value) {
    normalPrice = matchedHome.price.value;
  }

  if (!normalPrice) {
    if (isRateLimited) {
      throw new Error(`Redfin rate limit reached for "${address}". Please chill and wait a few minutes before validating again, or enter the value manually.`);
    }
    throw new Error(`Redfin estimate unavailable for address "${address}". Please check the address, paste the Redfin property link (e.g. redfin.com/.../home/446533), or enter value manually.`);
  }

  const conservative = (lowPrice !== undefined && lowPrice !== null) ? Math.round((lowPrice + normalPrice) / 2) : Math.round(normalPrice * 0.95);
  const optimistic = (highPrice !== undefined && highPrice !== null) ? Math.round((highPrice + normalPrice) / 2) : Math.round(normalPrice * 1.05);

  return { normal: normalPrice, conservative, optimistic };
}

export async function fetchRedfinValue(
  params: {
    address: string;
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    valuationMethod?: 'conservative' | 'normal' | 'optimistic';
  },
  apiConfig?: ApiConfig
): Promise<number> {
  const estimates = await fetchRedfinValuationDetails(params, apiConfig);
  const method = params.valuationMethod || 'normal';
  const selectedValue = estimates[method];

  if (selectedValue === undefined || selectedValue === null || isNaN(selectedValue)) {
    throw new Error(`Redfin parse error: No valid valuation field returned in response.`);
  }

  return selectedValue;
}


const TREZOR_HOSTS = ['btc2.trezor.io', 'btc1.trezor.io', 'btc3.trezor.io'];

async function fetchBtcPrice(apiConfig?: ApiConfig): Promise<number> {
  const url = apiConfig?.btcApiUrl || DEFAULT_API_CONFIG.btcApiUrl!;
  const curlCmd = `curl -s -A 'Mozilla/5.0' '${url}'`;
  logger.info(`${LOG_TAG} BTC price API call`, { url });
  logger.debug(`${LOG_TAG} BTC price curl: ${curlCmd}`);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new Error(`BTC price network error\n  URL: ${url}\n  curl: ${curlCmd}\n  error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`BTC price HTTP ${res.status}\n  URL: ${url}\n  curl: ${curlCmd}\n  response: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
  };
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price === undefined || price === null) {
    throw new Error(`BTC price parse error\n  URL: ${url}\n  curl: ${curlCmd}\n  raw: ${JSON.stringify(data).slice(0, 500)}`);
  }
  logger.info(`${LOG_TAG} BTC price: $${price}/BTC`);
  return price;
}

async function fetchBitcoinBalance(xpub: string, apiConfig?: ApiConfig): Promise<number> {
  const hasDescriptor = xpub.includes('(');
  const xpubFormats = hasDescriptor
    ? [xpub]
    : [xpub, `wpkh(${xpub})`];

  let lastError: string | null = null;
  let btcAmount: number | null = null;

  let baseUrlTemplate = apiConfig?.btcXpubApiUrl || 'https://{host}/api/v2/xpub/{xpub}?details=basic';

  let hostList: string[];
  if (apiConfig?.btcXpubApiUrl && !apiConfig.btcXpubApiUrl.includes('{host}')) {
    const parsed = new URL(apiConfig.btcXpubApiUrl);
    const customHost = parsed.hostname;
    if (customHost === 'host') {
      // User entered literal "host" instead of template "{host}" — fall back to defaults
      logger.warn(`${LOG_TAG} btcXpubApiUrl contains literal 'host' instead of template '{host}'. Falling back to default Trezor configuration.`);
      baseUrlTemplate = DEFAULT_API_CONFIG.btcXpubApiUrl;
      hostList = TREZOR_HOSTS;
    } else {
      // Custom URL without {host} — use the hostname from the URL directly
      hostList = [customHost];
    }
  } else {
    hostList = TREZOR_HOSTS;
  }

  for (const fmt of xpubFormats) {
    for (const host of hostList) {
      const url = baseUrlTemplate.replace('{host}', host).replace('{xpub}', encodeURIComponent(fmt));
      const curlCmd = `curl -s -A 'Mozilla/5.0' '${url}'`;
      logger.info(`${LOG_TAG} Bitcoin API call`, { host, xpub: fmt, url });
      logger.debug(`${LOG_TAG} Bitcoin curl: ${curlCmd}`);

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        lastError = `network error\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  error: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn(`${LOG_TAG} Bitcoin host ${host} failed for ${fmt}`, { error: lastError });
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '(unreadable)');
        lastError = `HTTP ${res.status}\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  response: ${body.slice(0, 300)}`;
        logger.warn(`${LOG_TAG} Bitcoin host ${host} returned ${res.status} for ${fmt}, trying next host`);
        continue;
      }

      const rawJson = await res.text();
      logger.info(`${LOG_TAG} Bitcoin raw response [${host}/${fmt}]: ${rawJson.slice(0, 500)}`);

      let data: { balance?: string; unconfirmedBalance?: string };
      try {
        data = JSON.parse(rawJson);
      } catch {
        lastError = `parse error (invalid JSON)\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  raw: ${rawJson.slice(0, 300)}`;
        continue;
      }

      const confirmed = BigInt(data.balance ?? '0');
      const unconfirmed = BigInt(data.unconfirmedBalance ?? '0');
      const totalSats = Number(confirmed + unconfirmed);

      logger.info(`${LOG_TAG} Bitcoin parsed [${host}/${fmt}]: balance=${data.balance}, unconfirmed=${data.unconfirmedBalance}, totalSats=${totalSats}`);

      if (isNaN(totalSats)) {
        lastError = `parse error (NaN)\n  host: ${host}\n  URL: ${url}\n  curl: ${curlCmd}\n  raw balance: ${data.balance}, unconfirmed: ${data.unconfirmedBalance}`;
        continue;
      }

      const btc = totalSats / 1e8;

      if (btc === 0 && fmt !== xpubFormats[xpubFormats.length - 1]) {
        logger.info(`${LOG_TAG} BTC returned 0 for ${fmt} on ${host}, will retry with next format`);
        lastError = `got 0 BTC for ${fmt} on ${host}`;
        break;
      }

      btcAmount = btc;
      break;
    }
    if (btcAmount !== null) break;
  }

  if (btcAmount === null) {
    throw new Error(`Bitcoin fetch failed (${xpubFormats.length} formats x ${hostList.length} hosts)\n  last: ${lastError}`);
  }

  logger.info(`${LOG_TAG} BTC wallet balance: ${btcAmount} BTC`);

  const btcPrice = await fetchBtcPrice(apiConfig);
  const usdValue = btcAmount * btcPrice;

  logger.info(`${LOG_TAG} BTC value: ${btcAmount} BTC x $${btcPrice} = $${usdValue}`);

  return usdValue;
}

async function fetchSpotPrice(type: 'gold' | 'silver', apiConfig?: ApiConfig): Promise<number> {
  const baseUrl = apiConfig?.metalsApiUrl || DEFAULT_API_CONFIG.metalsApiUrl!;
  const ticker = type === 'gold' ? 'GC=F' : 'SI=F';
  const url = `${baseUrl}/${ticker}`;
  const curlCmd = `curl -s -A 'Mozilla/5.0' '${url}'`;
  logger.info(`${LOG_TAG} Spot price API call`, { ticker, url });
  logger.debug(`${LOG_TAG} Spot price curl: ${curlCmd}`);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
  } catch (err) {
    throw new Error(`Spot price network error\n  URL: ${url}\n  curl: ${curlCmd}\n  error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`Spot price HTTP ${res.status}\n  URL: ${url}\n  curl: ${curlCmd}\n  response: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
  };
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price === undefined || price === null) {
    throw new Error(`Spot price parse error\n  URL: ${url}\n  curl: ${curlCmd}\n  raw: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return price;
}

export async function createManualAccount(input: {
  userId: string;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
  initialValue?: number;
  currency?: string;
  apiConfig?: ApiConfig;
}, dek?: Uint8Array) {
  const db = getDb();
  const accountType = ACCOUNT_TYPE_MAP[input.type] || input.type;

  const initialValue = input.initialValue ?? 0;

  const REAL_ESTATE_TYPES = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family'
  ];
  const isRealEstate = REAL_ESTATE_TYPES.includes(accountType);

  const meta = input.metadata ? { ...input.metadata } : {};

  const rawValues = {
    userId: input.userId,
    connectionId: null,
    externalId: manualExternalId(),
    name: input.name,
    currency: input.currency ?? 'USD',
    balance: formatToCents(initialValue),
    balanceDate: new Date(),
    type: accountType,
    metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
    institution: null,
    isHidden: false,
    isExcludedFromNetWorth: false,
    displayOrder: 0,
  };

  const values = dek ? await encryptRow('accounts', rawValues, dek) : rawValues;

  const [account] = await db
    .insert(accounts)
    .values(values)
    .returning();

  if (initialValue !== 0) {
    const txnValues = {
      userId: input.userId,
      accountId: account.id,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: formatToCents(initialValue),
      description: `Initial ${input.name} value`,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(input.userId, dek),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  // Ensure compound categories exist
  await ensureCompoundCategories(input.userId, dek);
  await ensureEmployerContributions(input.userId, dek);

  // Generate synthetic historical snapshots if purchase info is present
  const hasPurchaseHistory = !!meta.purchaseDate && (!!meta.purchasePrice || accountType === 'metals');
  if (hasPurchaseHistory) {
    try {
      await generateAssetHistorySnapshots(account.id, input.userId, input.type, meta, input.apiConfig, dek);
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to generate history snapshots for ${account.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`${LOG_TAG} Account created`, { accountId: account.id, name: account.name, type: input.type, initialValue });

  if (initialValue !== 0) {
    invalidateUserSearchCache(input.userId);
  }

  return account;
}

export async function syncManualAccount(
  accountId: string,
  userId: string,
  apiConfig?: ApiConfig,
  dek?: Uint8Array
): Promise<{
  status: 'success' | 'error';
  newBalance: number;
  oldBalance: number;
  changed: boolean;
  errorMessage?: string;
}> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return { status: 'error', newBalance: 0, oldBalance: 0, changed: false, errorMessage: 'Account not found' };
  }

  const oldBalance = parseFloat(dek ? await decryptField(account.balance, dek) : account.balance.toString());
  let rawMeta: string | Record<string, unknown>;
  if (dek && account.metadata) {
    const decrypted = await decryptField(account.metadata, dek);
    rawMeta = decrypted || '{}';
  } else if (typeof account.metadata === 'string') {
    rawMeta = account.metadata || '{}';
  } else {
    // account.metadata is a jsonb object from the database (no encryption)
    rawMeta = account.metadata || {};
  }
  const meta = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta)) as Record<string, unknown>;
  let newValue: number;

  try {
    switch (account.type) {
      case 'realestate':
      case 'primaryhome':
      case 'secondaryhome':
      case 'rentalproperty':
      case 'commercial':
      case 'land':
      case 'otherrealestate':
      case 'single-family':
      case 'condo':
      case 'townhouse':
      case 'multi-family':
      case 'other': {
        const address = meta.address as string | undefined;
        if (!address) {
          throw new Error('No property address in metadata. Please edit the account to provide a property address for Redfin sync.');
        }
        newValue = await fetchRedfinValue({
          address,
          propertyType: meta.propertyType as string | undefined,
          bedrooms: meta.bedrooms !== undefined && meta.bedrooms !== null ? parseFloat(String(meta.bedrooms)) : undefined,
          bathrooms: meta.bathrooms !== undefined && meta.bathrooms !== null ? parseFloat(String(meta.bathrooms)) : undefined,
          squareFootage: meta.squareFootage !== undefined && meta.squareFootage !== null ? parseFloat(String(meta.squareFootage)) : undefined,
          valuationMethod: meta.valuationMethod as 'conservative' | 'normal' | 'optimistic' | undefined,
        }, apiConfig);
        break;
      }

      case 'crypto': {
        const xpub = meta.xpub as string;
        if (!xpub) throw new Error('No xpub in metadata');
        newValue = await fetchBitcoinBalance(xpub, apiConfig);
        break;
      }
      case 'metals': {
        const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
        const amountOz = parseFloat(String(meta.amountOz ?? '0'));
        if (amountOz <= 0) throw new Error('No amountOz in metadata');
        const spotPrice = await fetchSpotPrice(subType, apiConfig);
        newValue = amountOz * spotPrice;
        break;
      }
      default:
        return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: 'Account type does not support auto-sync' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    logger.error(`${LOG_TAG} Sync failed`, { accountId, type: account.type, error: msg });

    try {
      meta.syncError = msg;
      const updatedMeta = JSON.stringify(meta);
      const encryptedMeta = dek ? await encryptField(updatedMeta, dek) : updatedMeta;
      await db
        .update(accounts)
        .set({
          metadata: encryptedMeta,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));
    } catch (saveErr) {
      logger.error(`${LOG_TAG} Failed to save sync error to metadata`, { accountId, error: String(saveErr) });
    }

    return {
      status: 'error',
      newBalance: oldBalance,
      oldBalance,
      changed: false,
      errorMessage: msg,
    };
  }

  const delta = newValue - oldBalance;
  logger.info(`${LOG_TAG} Sync comparison for ${accountId} (${account.type}): oldBalance=${oldBalance}, newValue=${newValue}, delta=${delta}`);

  const accountUpdate: any = {
    balance: dek ? await encryptField(formatToCents(newValue), dek) : formatToCents(newValue),
    balanceDate: new Date(),
    updatedAt: new Date(),
  };

  if (meta.syncError !== undefined) {
    delete meta.syncError;
    const updatedMeta = JSON.stringify(meta);
    accountUpdate.metadata = dek ? await encryptField(updatedMeta, dek) : updatedMeta;
  }

  await db.update(accounts).set(accountUpdate).where(eq(accounts.id, accountId));

  if (Math.abs(delta) > 0.0001) {
    const assetTypeLabels: Record<string, string> = {
      realestate: 'Real Estate',
      primaryhome: 'Primary Home',
      secondaryhome: 'Secondary Home',
      rentalproperty: 'Rental Property',
      commercial: 'Commercial',
      land: 'Land',
      otherrealestate: 'Other Real Estate',
      crypto: 'Bitcoin',
      metals: 'Metals',
    };
    const txnValues = {
      userId,
      accountId,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: formatToCents(delta),
      description: `${assetTypeLabels[account.type] ?? account.name} value adjustment`,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(userId, dek),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  await ensureCompoundCategories(userId, dek);
  await ensureEmployerContributions(userId, dek);
  await createAccountSnapshotsForUser(userId, dek);
  await updateNetWorthSnapshot(userId, dek);

  // Regenerate synthetic history for real estate and mortgages to keep HPI/amortization curves aligned
  const REAL_ESTATE_TYPES = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family', 'other',
    'mortgage'
  ];
  if (REAL_ESTATE_TYPES.includes(account.type) || account.type === 'metals') {
    try {
      let rawMeta: string | Record<string, unknown>;
      if (dek && account.metadata) {
        const decrypted = await decryptField(account.metadata, dek);
        rawMeta = decrypted || '{}';
      } else if (typeof account.metadata === 'string') {
        rawMeta = account.metadata || '{}';
      } else {
        rawMeta = account.metadata || {};
      }
      const meta = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta)) as Record<string, unknown>;
      await generateAssetHistorySnapshots(accountId, userId, account.type, meta, apiConfig, dek);
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to regenerate history for ${accountId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const changed = Math.abs(delta) > 0.0001;
  logger.info(`${LOG_TAG} Account synced`, { accountId, type: account.type, oldBalance, newValue, changed });

  if (changed) {
    invalidateUserSearchCache(userId);
  }

  return {
    status: 'success',
    newBalance: newValue,
    oldBalance,
    changed,
  };
}

export async function adjustManualAccountValue(
  accountId: string,
  userId: string,
  newValue: number,
  note?: string,
  amountOz?: number,
  apiConfig?: ApiConfig,
  dek?: Uint8Array
): Promise<{
  status: 'success' | 'error';
  newBalance: number;
  oldBalance: number;
  changed: boolean;
  errorMessage?: string;
}> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return { status: 'error', newBalance: 0, oldBalance: 0, changed: false, errorMessage: 'Account not found' };
  }

  const oldBalance = parseFloat(dek ? await decryptField(account.balance, dek) : account.balance.toString());
  let finalNewValue = newValue;
  let rawMeta: string | Record<string, unknown>;
  if (dek && account.metadata) {
    const decrypted = await decryptField(account.metadata, dek);
    rawMeta = decrypted || '{}';
  } else if (typeof account.metadata === 'string') {
    rawMeta = account.metadata || '{}';
  } else {
    // account.metadata is a jsonb object from the database (no encryption)
    rawMeta = account.metadata || {};
  }
  const meta: Record<string, unknown> = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta));

  if (account.type === 'metals' && amountOz !== undefined) {
    try {
      const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
      const spotPrice = await fetchSpotPrice(subType, apiConfig);
      finalNewValue = amountOz * spotPrice;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Spot price fetch failed';
      logger.error(`${LOG_TAG} Adjust failed for metals account`, { accountId, error: msg });
      return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: msg };
    }

    const updatedMeta = { ...meta, amountOz };
    const encryptedMeta = dek ? await encryptField(JSON.stringify(updatedMeta), dek) : JSON.stringify(updatedMeta);
    const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
    await db.update(accounts).set({
      balance: encryptedBalance,
      balanceDate: new Date(),
      updatedAt: new Date(),
      metadata: encryptedMeta,
    }).where(eq(accounts.id, accountId));
  } else {
    const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
    await db.update(accounts).set({
      balance: encryptedBalance,
      balanceDate: new Date(),
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));
  }

  const delta = finalNewValue - oldBalance;

  if (Math.abs(delta) > 0.0001) {
    const txnValues = {
      userId,
      accountId,
      externalId: adjExternalId(),
      date: nowISO(),
      amount: formatToCents(delta),
      description: note ?? `${account.name} value adjustment`,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(userId, dek),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  await ensureCompoundCategories(userId, dek);
  await ensureEmployerContributions(userId, dek);
  await createAccountSnapshotsForUser(userId, dek);
  await updateNetWorthSnapshot(userId, dek);

  const changed = Math.abs(delta) > 0.0001;
  logger.info(`${LOG_TAG} Account value adjusted`, { accountId, type: account.type, oldBalance, newValue: finalNewValue, changed, note });

  if (changed) {
    invalidateUserSearchCache(userId);
  }

  return {
    status: 'success',
    newBalance: newValue,
    oldBalance,
    changed,
  };
}

export async function addAccountSnapshot(
  accountId: string,
  userId: string,
  date: string,
  value: number,
  note?: string,
  amountOz?: number,
  apiConfig?: ApiConfig,
  dek?: Uint8Array
): Promise<{
  status: 'success' | 'error';
  newBalance: number;
  oldBalance: number;
  changed: boolean;
  errorMessage?: string;
}> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return { status: 'error', newBalance: 0, oldBalance: 0, changed: false, errorMessage: 'Account not found' };
  }

  const oldBalance = parseFloat(dek ? await decryptField(account.balance, dek) : account.balance.toString());
  let finalNewValue = value;
  let rawMeta: string | Record<string, unknown>;
  if (dek && account.metadata) {
    const decrypted = await decryptField(account.metadata, dek);
    rawMeta = decrypted || '{}';
  } else if (typeof account.metadata === 'string') {
    rawMeta = account.metadata || '{}';
  } else {
    rawMeta = account.metadata || {};
  }
  const meta: Record<string, unknown> = JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta));

  if (account.type === 'metals' && amountOz !== undefined) {
    try {
      const subType = (meta.subType ?? 'gold') as 'gold' | 'silver';
      const spotPrice = await fetchSpotPrice(subType, apiConfig);
      finalNewValue = amountOz * spotPrice;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Spot price fetch failed';
      logger.error(`${LOG_TAG} Add snapshot failed for metals account`, { accountId, error: msg });
      return { status: 'error', newBalance: oldBalance, oldBalance, changed: false, errorMessage: msg };
    }

    const updatedMeta = { ...meta, amountOz };
    const encryptedMeta = dek ? await encryptField(JSON.stringify(updatedMeta), dek) : JSON.stringify(updatedMeta);
    const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
    
    // Update current account balance only if snapshot date is >= current balanceDate
    const currentBalanceDate = account.balanceDate ? new Date(account.balanceDate).toISOString().split('T')[0] : '';
    if (date >= currentBalanceDate) {
      await db.update(accounts).set({
        balance: encryptedBalance,
        balanceDate: new Date(date),
        updatedAt: new Date(),
        metadata: encryptedMeta,
      }).where(eq(accounts.id, accountId));
    } else {
      await db.update(accounts).set({
        updatedAt: new Date(),
        metadata: encryptedMeta,
      }).where(eq(accounts.id, accountId));
    }
  } else {
    const encryptedBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
    // Update current account balance only if snapshot date is >= current balanceDate
    const currentBalanceDate = account.balanceDate ? new Date(account.balanceDate).toISOString().split('T')[0] : '';
    if (date >= currentBalanceDate) {
      await db.update(accounts).set({
        balance: encryptedBalance,
        balanceDate: new Date(date),
        updatedAt: new Date(),
      }).where(eq(accounts.id, accountId));
    }
  }

  // Insert or update the snapshot in account_snapshots (isSynthetic = false, isImported = true)
  const encryptedSnapshotBalance = dek ? await encryptField(formatToCents(finalNewValue), dek) : formatToCents(finalNewValue);
  await db.insert(accountSnapshots).values({
    userId,
    accountId,
    snapshotDate: date,
    balance: encryptedSnapshotBalance,
    isSynthetic: false,
    isImported: true,
  }).onConflictDoUpdate({
    target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
    set: {
      balance: encryptedSnapshotBalance,
      isSynthetic: false,
      isImported: true,
    },
  });

  // If a note is provided, insert a zero-amount transaction
  if (note) {
    const formattedBalance = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(finalNewValue);
    const txnDescription = `Snapshot Balance: ${formattedBalance} (${note})`;
    const txnValues = {
      userId,
      accountId,
      externalId: adjExternalId(),
      date,
      amount: '0',
      description: txnDescription,
      payee: null,
      memo: null,
      pending: false,
      categoryId: await ensureSystemCategories(userId, dek),
    };
    const encryptedTxn = dek ? await encryptRow('transactions', txnValues, dek) : txnValues;
    await db.insert(transactions).values(encryptedTxn);
  }

  // Regenerate history for this account
  const MODEL_SNAPSHOT_TYPES = [
    'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
    'single-family', 'condo', 'townhouse', 'multi-family', 'other',
    'vehicle', 'metals', 'mortgage'
  ];

  if (MODEL_SNAPSHOT_TYPES.includes(account.type)) {
    try {
      const latestMeta = account.type === 'metals' && amountOz !== undefined ? { ...meta, amountOz } : meta;
      await generateAssetHistorySnapshots(accountId, userId, account.type, latestMeta, apiConfig, dek);
    } catch (err) {
      logger.error(`${LOG_TAG} Failed to generate asset history snapshots in addAccountSnapshot`, { accountId, err });
    }
  } else {
    try {
      const today = new Date().toISOString().split('T')[0];
      const fromDate = await getAccountEarliestCalculationDate(accountId, userId, account.metadata, dek);
      const finalFromDate = date < fromDate ? date : fromDate;
      await generateHistoricalAccountSnapshots(accountId, userId, finalFromDate, today, dek);
    } catch (err) {
      logger.error(`${LOG_TAG} Failed to generate historical snapshots in addAccountSnapshot`, { accountId, err });
    }
  }

  // Rebuild aggregated net worth snapshots
  await recalculateNetWorthSnapshots(userId, dek);

  invalidateUserSearchCache(userId);

  return {
    status: 'success',
    newBalance: finalNewValue,
    oldBalance,
    changed: true,
  };
}

export async function deleteManualAccount(
  accountId: string,
  userId: string,
  keepData?: boolean,
  dek?: Uint8Array
): Promise<void> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) return;

  if (keepData) {
    await db.update(accounts).set({
      connectionId: null,
      isHidden: true,
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));
    logger.info(`${LOG_TAG} Account hidden (data kept)`, { accountId, name: account.name, type: account.type });
  } else {
    await db.delete(accounts).where(eq(accounts.id, accountId));
    await createAccountSnapshotsForUser(userId, dek);
    await updateNetWorthSnapshot(userId, dek);
    logger.info(`${LOG_TAG} Account deleted`, { accountId, name: account.name, type: account.type });
  }

  invalidateUserSearchCache(userId);
}

async function createAccountSnapshotsForUser(userId: string, dek?: Uint8Array) {
  const db = getDb();
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  const today = nowISO();
  for (const acc of userAccounts) {
    if (acc.type === 'mortgage') {
      try {
        let rawMeta = acc.metadata;
        if (dek && rawMeta) {
          rawMeta = await decryptField(rawMeta, dek);
        }
        const meta = rawMeta ? JSON.parse(typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta)) : {};
        const status = meta.mortgageStatus;
        const endEventDateStr = status === 'paid_off' ? meta.payoffDate : (status === 'refinanced' ? meta.refinanceDate : undefined);
        if (endEventDateStr && today >= endEventDateStr) {
          continue;
        }
      } catch (e) {
        // Ignore json parse error
      }
    }
    const decryptedBalance = parseFloat(dek ? await decryptField(acc.balance, dek) : acc.balance) || 0;
    const formattedBalance = formatToCents(decryptedBalance);
    const encryptedBalance = dek ? await encryptField(formattedBalance, dek) : formattedBalance;
    
    await db.insert(accountSnapshots).values({
      userId,
      accountId: acc.id,
      snapshotDate: today,
      balance: encryptedBalance,
      isSynthetic: false,
    }).onConflictDoUpdate({
      target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
      set: { balance: encryptedBalance, isSynthetic: false },
    });
  }
}

async function updateNetWorthSnapshot(userId: string, dek?: Uint8Array) {
  const db = getDb();

  const [settings] = await db
    .select({ currency: userSettings.currency })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const baseCurrency = settings?.currency || 'USD';

  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown: Record<string, { count: number; value: number }> = {};

  for (const acc of userAccounts) {
    const balance = parseFloat(dek ? await decryptField(acc.balance, dek) : acc.balance.toString());
    const accountType = acc.type.toLowerCase();

    const convertedBal = convertCurrency(balance, acc.currency || 'USD', baseCurrency);

    if (isAssetAccount(accountType)) {
      totalAssets += convertedBal;
    } else if (isLiabilityAccount(accountType)) {
      totalLiabilities += Math.abs(convertedBal);
    }

    if (!breakdown[accountType]) {
      breakdown[accountType] = { count: 0, value: 0 };
    }
    breakdown[accountType].count++;
    breakdown[accountType].value += convertedBal;
  }

  totalAssets = roundToCents(totalAssets);
  totalLiabilities = roundToCents(totalLiabilities);
  const netWorth = roundToCents(totalAssets - totalLiabilities);

  for (const key of Object.keys(breakdown)) {
    breakdown[key].value = roundToCents(breakdown[key].value);
  }

  const today = nowISO();

  const nwValues: any = {
    userId,
    snapshotDate: today,
    totalAssets: String(totalAssets),
    totalLiabilities: String(totalLiabilities),
    netWorth: String(netWorth),
    breakdown,
  };
  const encryptedNw = dek ? await encryptRow('net_worth_snapshots', nwValues, dek) : nwValues;

  await db.insert(netWorthSnapshots).values(encryptedNw).onConflictDoUpdate({
    target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
    set: encryptedNw,
  });
}
