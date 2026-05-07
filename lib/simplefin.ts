export class SimpleFINError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SimpleFINError';
  }
}

export type SimpleFINTransaction = {
  id: string;
  posted: number;
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

const TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function claimAccessUrl(setupToken: string): Promise<string> {
  let claimUrl: string;
  try {
    claimUrl = Buffer.from(setupToken, 'base64').toString('utf8');
    new URL(claimUrl); // validate
  } catch {
    throw new SimpleFINError('Invalid setup token: cannot decode to a valid URL', 'invalid_token');
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } });
  } catch (err) {
    throw new SimpleFINError(`Network error during claim: ${String(err)}`, 'claim_failed');
  }
  if (!res.ok) {
    throw new SimpleFINError(`Claim failed with status ${res.status}`, 'claim_failed');
  }
  const accessUrl = await res.text();
  if (!accessUrl || !accessUrl.startsWith('http')) {
    throw new SimpleFINError('Claim response is not a valid access URL', 'claim_failed');
  }
  return accessUrl.trim();
}

export async function fetchAccounts(
  accessUrl: string,
  startDate: Date,
  endDate: Date,
): Promise<SimpleFINResponse> {
  const url = new URL(`${accessUrl}/accounts`);
  url.searchParams.set('start-date', String(Math.floor(startDate.getTime() / 1000)));
  url.searchParams.set('end-date', String(Math.floor(endDate.getTime() / 1000)));
  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString());
  } catch (err) {
    throw new SimpleFINError(`Network error fetching accounts: ${String(err)}`, 'fetch_failed');
  }
  if (!res.ok) {
    throw new SimpleFINError(`Accounts fetch failed with status ${res.status}`, 'fetch_failed');
  }
  return res.json() as Promise<SimpleFINResponse>;
}
