import { fetchSecure } from "@/lib/utils/ssrf";
import { logger } from "@/lib/logger";
import { API_KEY_DEFAULTS } from "@/config/defaults";
import type { ApiConfig } from "@/lib/services/asset-estimator";

const LOG_TAG = "[manual-accounts]";
const DEFAULT_API_CONFIG: ApiConfig = { ...API_KEY_DEFAULTS };

export function normalizeRedfinApiUrl(url?: string): string {
  const fallback = DEFAULT_API_CONFIG.redfinApiUrl || "https://www.redfin.com/stingray";
  if (!url || typeof url !== "string" || !url.trim()) {
    return fallback;
  }
  let trimmed = url.trim().replace(/\/+$/, "");
  trimmed = trimmed.replace(/\/what-is-my-home-worth\/?$/, "");
  if (!trimmed.endsWith("/stingray")) {
    trimmed = `${trimmed}/stingray`;
  }
  return trimmed;
}

function cleanRedfinJson(text: string): any {
  const cleanText = text.replace(/^\{\}&&/, '');
  return JSON.parse(cleanText);
}

export interface RedfinEstimates {
  normal: number;
  conservative: number;
  optimistic: number;
  /** Redfin property ID the valuation was fetched for. */
  propertyId?: string;
}

/**
 * Extract a Redfin property ID from free-form input: a pasted Redfin
 * property link (.../home/<id>), a bare numeric ID, or undefined.
 * Kept so existing users with a link/ID stored in their address field
 * keep working without any changes.
 */
export function extractRedfinPropertyId(input?: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const urlMatch = trimmed.match(/\/home\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return undefined;
}

/** Where to find the Redfin property ID for a listing. */
const REDFIN_ID_HELP = 'Enter the Redfin Property ID (the number after /home/ in the property\'s Redfin URL, e.g. 446533).';

export async function fetchRedfinValuationDetails(
  params: {
    /** Redfin property ID, or a pasted Redfin property link containing one. */
    propertyId?: string;
    /** Legacy alias: an address field that may hold a pasted link/bare ID. */
    address?: string;
  },
  apiConfig?: ApiConfig
): Promise<RedfinEstimates> {
  const baseUrl = normalizeRedfinApiUrl(apiConfig?.redfinApiUrl);
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const propertyId =
    extractRedfinPropertyId(params.propertyId) ??
    extractRedfinPropertyId(params.address);

  if (!propertyId) {
    throw new Error(`No Redfin property ID provided. ${REDFIN_ID_HELP}`);
  }

  logger.info(`${LOG_TAG} Redfin AVM call`, { propertyId, url: `${baseUrl}/api/home/details/avm?propertyId=${propertyId}&accessLevel=1` });

  let normalPrice: number | undefined;
  let lowPrice: number | undefined;
  let highPrice: number | undefined;

  try {
    const avmUrl = `${baseUrl}/api/home/details/avm?propertyId=${propertyId}&accessLevel=1`;
    const avmRes = await fetchSecure(avmUrl, {
      requireHttps: true,
      timeoutMs: 10000,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.redfin.com/',
      },
    });
    if (avmRes.status === 403 || avmRes.status === 429 || avmRes.status === 503) {
      throw new Error(`Redfin rate limit reached for property ${propertyId}. Please wait a few minutes before trying again, or enter the value manually.`);
    }
    if (!avmRes.ok) {
      throw new Error(`Redfin estimate unavailable for property ${propertyId} (HTTP ${avmRes.status}). Please check the Property ID, ${REDFIN_ID_HELP.charAt(0).toLowerCase() + REDFIN_ID_HELP.slice(1)}`);
    }
    const text = await avmRes.text();
    const trimmed = text.trim().toLowerCase();
    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('challenge') || trimmed.includes('captcha')) {
      throw new Error(`Redfin rate limit reached for property ${propertyId}. Please wait a few minutes before trying again, or enter the value manually.`);
    }
    const json = cleanRedfinJson(text);
    const p = json.payload || {};
    normalPrice = p.predictedValue ?? p.value ?? p.price;
    lowPrice = p.priceRangeLow ?? p.predictedValueMin ?? p.priceRangeMin;
    highPrice = p.priceRangeHigh ?? p.predictedValueMax ?? p.priceRangeMax;
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith('Redfin rate limit') || err.message.startsWith('Redfin estimate unavailable'))) {
      throw err;
    }
    logger.warn(`${LOG_TAG} AVM query error`, { propertyId, error: String(err) });
    throw new Error(`Redfin estimate unavailable for property ${propertyId}. Please check the Property ID or enter the value manually.`);
  }

  if (normalPrice === undefined || normalPrice === null || isNaN(normalPrice)) {
    throw new Error(`Redfin returned no estimate for property ${propertyId}. Please check the Property ID or enter the value manually.`);
  }

  const conservative = (lowPrice !== undefined && lowPrice !== null) ? Math.round((lowPrice + normalPrice) / 2) : Math.round(normalPrice * 0.95);
  const optimistic = (highPrice !== undefined && highPrice !== null) ? Math.round((highPrice + normalPrice) / 2) : Math.round(normalPrice * 1.05);

  return { normal: normalPrice, conservative, optimistic, propertyId };
}

export async function fetchRedfinValue(
  params: {
    /** Redfin property ID, or a pasted Redfin property link containing one. */
    propertyId?: string;
    /** Legacy alias: an address field that may hold a pasted link/bare ID. */
    address?: string;
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
  let res: Response;
  try {
    // H-5: user-configured endpoint → fetchSecure validates the initial URL
    // AND every redirect hop (plain fetch would follow a 302 privately).
    res = await fetchSecure(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    // L-4 (2026-08-27 security review): keep the full URL/curl/response in the
    // server log only; the client-facing message must not expose the endpoint
    // (which can carry API-key query params) or the upstream body.
    logger.error(`${LOG_TAG} BTC price network error`, { url, curl: curlCmd, error: err instanceof Error ? err.message : String(err) });
    throw new Error('Failed to fetch BTC price: network error');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    logger.error(`${LOG_TAG} BTC price HTTP error`, { url, status: res.status, response: body.slice(0, 300) });
    throw new Error(`Failed to fetch BTC price: upstream returned HTTP ${res.status}`);
  }
  const data = await res.json() as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
  };
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price === undefined || price === null) {
    logger.error(`${LOG_TAG} BTC price parse error`, { url, raw: JSON.stringify(data).slice(0, 500) });
    throw new Error('Failed to fetch BTC price: malformed upstream response');
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
        // H-5: user-configured endpoint → fetchSecure validates URL + hops.
        res = await fetchSecure(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        lastError = 'network error on one host';
        // L-4: host/URL/curl/response stay server-side only.
        logger.warn(`${LOG_TAG} Bitcoin host ${host} failed for ${fmt}`, { url, curl: curlCmd, error: err instanceof Error ? err.message : String(err) });
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '(unreadable)');
        lastError = `upstream HTTP ${res.status}`;
        logger.warn(`${LOG_TAG} Bitcoin host ${host} returned ${res.status} for ${fmt}, trying next host`, { url, response: body.slice(0, 300) });
        continue;
      }

      const rawJson = await res.text();
      logger.info(`${LOG_TAG} Bitcoin raw response [${host}/${fmt}]: ${rawJson.slice(0, 500)}`);

      let data: { balance?: string; unconfirmedBalance?: string };
      try {
        data = JSON.parse(rawJson);
      } catch {
        lastError = 'upstream returned invalid JSON';
        logger.warn(`${LOG_TAG} Bitcoin parse error`, { url, raw: rawJson.slice(0, 300) });
        continue;
      }

      const confirmed = BigInt(data.balance ?? '0');
      const unconfirmed = BigInt(data.unconfirmedBalance ?? '0');
      const totalSats = Number(confirmed + unconfirmed);

      logger.debug(`${LOG_TAG} Bitcoin parsed [${host}/${fmt}]`);

      if (isNaN(totalSats)) {
        lastError = 'upstream returned an invalid balance';
        logger.warn(`${LOG_TAG} Bitcoin parse error (NaN)`, { url });
        continue;
      }

      const btc = totalSats / 1e8;

      if (btc === 0 && fmt !== xpubFormats[xpubFormats.length - 1]) {
        logger.debug(`${LOG_TAG} BTC returned 0 for ${fmt} on ${host}, will retry with next format`);
        lastError = 'upstream reported 0 BTC';
        break;
      }

      btcAmount = btc;
      break;
    }
    if (btcAmount !== null) break;
  }

  if (btcAmount === null) {
    logger.error(`${LOG_TAG} Bitcoin fetch failed after all hosts/formats`, { lastError });
    throw new Error(`Bitcoin fetch failed (${xpubFormats.length} formats x ${hostList.length} hosts)\n  last: ${lastError}`);
  }

  logger.debug(`${LOG_TAG} BTC wallet balance fetched successfully`);

  const btcPrice = await fetchBtcPrice(apiConfig);
  const usdValue = btcAmount * btcPrice;

  logger.debug(`${LOG_TAG} BTC value computed successfully`);

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
    // H-5: user-configured endpoint → fetchSecure validates URL + redirect hops.
    res = await fetchSecure(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
  } catch (err) {
    // L-4: keep URL/curl in server log only; client-facing message stays generic.
    logger.error(`${LOG_TAG} Spot price network error`, { url, curl: curlCmd, error: err instanceof Error ? err.message : String(err) });
    throw new Error('Failed to fetch spot price: network error');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    logger.error(`${LOG_TAG} Spot price HTTP error`, { url, status: res.status, response: body.slice(0, 300) });
    throw new Error(`Failed to fetch spot price: upstream returned HTTP ${res.status}`);
  }
  const data = await res.json() as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
  };
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (price === undefined || price === null) {
    logger.error(`${LOG_TAG} Spot price parse error`, { url, raw: JSON.stringify(data).slice(0, 500) });
    throw new Error('Failed to fetch spot price: malformed upstream response');
  }
  return price;
}


export { cleanRedfinJson, fetchBtcPrice, fetchBitcoinBalance, fetchSpotPrice };
