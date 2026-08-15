export class SimpleFINError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SimpleFINError';
  }
}

export type SimpleFINTransaction = {
  id: string;
  posted: number;
  transacted_at?: number;
  amount: string;
  description: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
};

export type SimpleFINAccount = {
  id: string;
  name: string;
  currency: string;
  balance: string;
  'balance-date': number;
  org: { name: string };
  transactions?: SimpleFINTransaction[];
};

export type SimpleFINResponse = { accounts: SimpleFINAccount[] };

const TIMEOUT_MS = 120_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

import { validateEndpointUrl, fetchSecure } from './utils/ssrf';

export async function claimAccessUrl(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken, 'base64').toString('utf8');
  } catch {
    throw new SimpleFINError('Invalid setup token: cannot decode to a valid URL', 'invalid_token');
  }

  const validated = await validateEndpointUrl(claimUrl, { requireHttps: true });
  if (!validated.ok) {
    throw new SimpleFINError(`Invalid or disallowed setup token URL: ${validated.error}`, 'invalid_token');
  }

  let res: Response;
  try {
    res = await fetchSecure(claimUrl, {
      method: 'POST',
      headers: { 'Content-Length': '0' },
      timeoutMs: TIMEOUT_MS,
      requireHttps: true,
    });
  } catch (err) {
    throw new SimpleFINError(`Network error during claim: ${String(err)}`, 'claim_failed');
  }
  if (!res.ok) {
    throw new SimpleFINError(`Claim failed with status ${res.status}`, 'claim_failed');
  }
  const accessUrl = (await res.text()).trim();
  if (!accessUrl || !accessUrl.startsWith('http')) {
    throw new SimpleFINError('Claim response is not a valid access URL', 'claim_failed');
  }

  const validatedAccess = await validateEndpointUrl(accessUrl, { requireHttps: true });
  if (!validatedAccess.ok) {
    throw new SimpleFINError(`Disallowed access URL returned by claim server: ${validatedAccess.error}`, 'claim_failed');
  }

  return accessUrl;
}

export async function fetchAccounts(
  accessUrl: string,
  startDate: Date,
  endDate: Date,
): Promise<SimpleFINResponse> {
  const parsed = new URL(accessUrl);
  const credentials = parsed.username || parsed.password ? `${parsed.username}:${parsed.password}` : null;

  // Remove credentials from the endpoint URL before constructing the request URL
  parsed.username = '';
  parsed.password = '';

  const basePath = parsed.pathname.replace(/\/$/, '');
  const accountsPath = `${basePath}/accounts`;
  const url = new URL(`${parsed.origin}${accountsPath}`);
  url.searchParams.set('start-date', String(Math.floor(startDate.getTime() / 1000)));
  url.searchParams.set('end-date', String(Math.floor(endDate.getTime() / 1000)));
  url.searchParams.set('pending', '1');

  const fetchUrl = url.toString();
  const validated = await validateEndpointUrl(fetchUrl, { requireHttps: true });
  if (!validated.ok) {
    throw new SimpleFINError(`Disallowed SimpleFIN endpoint: ${validated.error}`, 'fetch_failed');
  }

  const headers: Record<string, string> = {};
  if (credentials) {
    headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  let res: Response;
  try {
    res = await fetchSecure(fetchUrl, {
      headers,
      timeoutMs: TIMEOUT_MS,
      requireHttps: true,
    });
  } catch (err) {
    throw new SimpleFINError(`Network error fetching accounts: ${String(err)}`, 'fetch_failed');
  }
  if (!res.ok) {
    throw new SimpleFINError(`Accounts fetch failed with status ${res.status}`, 'fetch_failed');
  }
  return res.json() as Promise<SimpleFINResponse>;
}
