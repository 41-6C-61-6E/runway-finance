import { lookup } from 'dns/promises';
import { isIP } from 'net';

function ipToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return NaN;
  return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
}

function isPrivateIP(ip: string): boolean {
  const num = ipToInt(ip);
  if (isNaN(num)) return false;

  if ((num & 0xFF000000) === 0x7F000000) return true;
  if ((num & 0xFF000000) === 0x0A000000) return true;
  if ((num & 0xFFF00000) === 0xAC100000) return true;
  if ((num & 0xFFFF0000) === 0xC0A80000) return true;
  if ((num & 0xFFFF0000) === 0xA9FE0000) return true;
  if ((num & 0xFF000000) === 0x00000000) return true;
  if ((num & 0xFFC00000) === 0x64400000) return true;
  if ((num & 0xFFFE0000) === 0xC6120000) return true;

  return false;
}

const PRIVATE_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '[::1]',
  '127.1',
  'lvh.me',
  'local',
]);

export async function validateEndpointUrl(
  urlString: string
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, error: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https URLs are allowed' };
  }

  const hostname = url.hostname.toLowerCase();

  if (PRIVATE_HOSTNAMES.has(hostname)) {
    return { ok: false, error: 'Requests to localhost are not allowed' };
  }

  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return { ok: false, error: 'Requests to private IP ranges are not allowed' };
    }
    return { ok: true, url };
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isIP(addr.address) && isPrivateIP(addr.address)) {
        return { ok: false, error: 'Requests to private IP ranges are not allowed' };
      }
    }
  } catch {
    /* DNS resolution failed — let it fail naturally at fetch time */
  }

  return { ok: true, url };
}
