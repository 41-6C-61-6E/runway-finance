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

  // Validate hostname structure to prevent parsing tricks (e.g. userinfo containing @, control characters, etc.)
  // We only allow alphanumeric, dots, hyphens, and standard brackets for IPv6.
  const HOSTNAME_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
  const isIPv6Bracket = hostname.startsWith('[') && hostname.endsWith(']');
  const cleanHostname = isIPv6Bracket ? hostname.slice(1, -1) : hostname;
  
  // For standard domains/IPv4 we check HOSTNAME_REGEX.
  // For IPv6, we validate it contains only hex characters, colons, and optionally a percent sign / dots.
  const IPV6_REGEX = /^[0-9a-fA-F:.%]+$/;
  
  if (isIPv6Bracket) {
    if (!IPV6_REGEX.test(cleanHostname)) {
      return { ok: false, error: 'Invalid hostname format' };
    }
  } else {
    if (!HOSTNAME_REGEX.test(hostname)) {
      return { ok: false, error: 'Invalid hostname format' };
    }
  }

  // Also validate port is numeric if present
  if (url.port) {
    const PORT_REGEX = /^[0-9]+$/;
    if (!PORT_REGEX.test(url.port)) {
      return { ok: false, error: 'Invalid port format' };
    }
  }

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
