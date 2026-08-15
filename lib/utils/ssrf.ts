import { lookup } from 'dns/promises';
import { isIP } from 'net';

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return NaN;
  let num = 0;
  for (const part of parts) {
    const octet = parseInt(part, 10);
    if (isNaN(octet) || octet < 0 || octet > 255 || String(octet) !== part) {
      return NaN;
    }
    num = (num << 8) + octet;
  }
  return num >>> 0;
}

export function isPrivateIPv4(ip: string): boolean {
  const num = ipv4ToInt(ip);
  if (isNaN(num)) return true; // If not valid IPv4, consider unsafe

  // 0.0.0.0/8 (Broadcast/Current network)
  if (((num & 0xFF000000) >>> 0) === 0x00000000) return true;
  // 10.0.0.0/8 (Private network)
  if (((num & 0xFF000000) >>> 0) === 0x0A000000) return true;
  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (((num & 0xFFC00000) >>> 0) === 0x64400000) return true;
  // 127.0.0.0/8 (Loopback)
  if (((num & 0xFF000000) >>> 0) === 0x7F000000) return true;
  // 169.254.0.0/16 (Link Local / Cloud Metadata 169.254.169.254)
  if (((num & 0xFFFF0000) >>> 0) === 0xA9FE0000) return true;
  // 172.16.0.0/12 (Private network)
  if (((num & 0xFFF00000) >>> 0) === 0xAC100000) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (((num & 0xFFFFFF00) >>> 0) === 0xC0000000) return true;
  // 192.0.2.0/24 (TEST-NET-1 Documentation)
  if (((num & 0xFFFFFF00) >>> 0) === 0xC0000200) return true;
  // 192.168.0.0/16 (Private network)
  if (((num & 0xFFFF0000) >>> 0) === 0xC0A80000) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (((num & 0xFFFE0000) >>> 0) === 0xC6120000) return true;
  // 198.51.100.0/24 (TEST-NET-2 Documentation)
  if (((num & 0xFFFFFF00) >>> 0) === 0xC6336400) return true;
  // 203.0.113.0/24 (TEST-NET-3 Documentation)
  if (((num & 0xFFFFFF00) >>> 0) === 0xCB007100) return true;
  // 224.0.0.0/4 (Multicast)
  if (((num & 0xF0000000) >>> 0) === 0xE0000000) return true;
  // 240.0.0.0/4 (Reserved / Future Use)
  if (((num & 0xF0000000) >>> 0) === 0xF0000000) return true;
  // 255.255.255.255/32 (Limited Broadcast)
  if (num === 0xFFFFFFFF) return true;

  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1, ::ffff:169.254.169.254, ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const rest = normalized.slice(7);
    if (rest.includes('.')) {
      return isPrivateIPv4(rest);
    }
    // Handle hex format ::ffff:a00:1
    const hexParts = rest.split(':');
    if (hexParts.length === 2) {
      const p1 = parseInt(hexParts[0], 16);
      const p2 = parseInt(hexParts[1], 16);
      if (!isNaN(p1) && !isNaN(p2)) {
        const v4 = `${(p1 >> 8) & 0xff}.${p1 & 0xff}.${(p2 >> 8) & 0xff}.${p2 & 0xff}`;
        return isPrivateIPv4(v4);
      }
    }
    return true;
  }

  // IPv4-compatible IPv6 (::192.168.1.1)
  if (normalized.startsWith('::') && normalized.includes('.')) {
    const rest = normalized.slice(2);
    return isPrivateIPv4(rest);
  }

  // Unspecified address
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

  // Loopback (::1)
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // Unique Local Address (fc00::/7 -> starts with fc or fd)
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true;

  // Link-local unicast (fe80::/10 -> starts with fe8, fe9, fea, feb)
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true;

  // Site-local (deprecated fec0::/10 -> starts with fec, fed, fee, fef)
  if (/^fe[c-f][0-9a-f]:/i.test(normalized)) return true;

  // Multicast (ff00::/8)
  if (/^ff[0-9a-f]{2}:/i.test(normalized)) return true;

  // Discard prefix (0100::/64)
  if (/^0100:/i.test(normalized)) return true;

  // Documentation (2001:db8::/32)
  if (/^2001:0?db8:/i.test(normalized)) return true;

  return false;
}

export function isPrivateIP(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // Not a recognized IP, treat as unsafe
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
  'host.docker.internal',
  'gateway.docker.internal',
]);

export type ValidateEndpointResult =
  | { ok: true; url: URL; error?: never }
  | { ok: false; error: string; url?: never };

export async function validateEndpointUrl(
  urlString: string,
  options?: { requireHttps?: boolean }
): Promise<ValidateEndpointResult> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, error: 'Invalid URL format' };
  }

  if (options?.requireHttps && url.protocol !== 'https:') {
    return { ok: false, error: 'Only https URLs are allowed' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https URLs are allowed' };
  }

  const hostname = url.hostname.toLowerCase();

  // Validate hostname structure to prevent parsing tricks (e.g. userinfo containing @, control characters, etc.)
  const HOSTNAME_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
  const isIPv6Bracket = hostname.startsWith('[') && hostname.endsWith(']');
  const cleanHostname = isIPv6Bracket ? hostname.slice(1, -1) : hostname;

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

  if (url.port) {
    const PORT_REGEX = /^[0-9]+$/;
    if (!PORT_REGEX.test(url.port)) {
      return { ok: false, error: 'Invalid port format' };
    }
  }

  if (PRIVATE_HOSTNAMES.has(hostname) || PRIVATE_HOSTNAMES.has(cleanHostname)) {
    return { ok: false, error: 'Requests to localhost and internal hostnames are not allowed' };
  }

  if (isIP(cleanHostname)) {
    return { ok: false, error: 'Direct IP literals are not allowed' };
  }

  try {
    const addresses = await lookup(cleanHostname, { all: true, verbatim: true });
    if (!addresses || addresses.length === 0) {
      return { ok: false, error: 'DNS resolution returned no addresses' };
    }

    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        return { ok: false, error: 'Requests to private IP ranges are not allowed' };
      }
    }
  } catch (err) {
    return { ok: false, error: `DNS resolution failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  return { ok: true, url };
}

export interface FetchSecureOptions extends RequestInit {
  maxRedirects?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  requireHttps?: boolean;
}

/**
 * Executes a fetch request with SSRF validation on the initial URL and on every redirect hop.
 */
export async function fetchSecure(
  targetUrl: string | URL,
  options: FetchSecureOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const requireHttps = options.requireHttps ?? false;

  let currentUrl = typeof targetUrl === 'string' ? targetUrl : targetUrl.toString();
  let redirectsCount = 0;

  while (true) {
    const validated = await validateEndpointUrl(currentUrl, { requireHttps });
    if (!validated.ok) {
      throw new Error(`SSRF blocked request to ${currentUrl}: ${validated.error}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(validated.url.toString(), {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
      });

      // Handle redirects securely by re-validating the redirect target
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirectsCount++;
        if (redirectsCount > maxRedirects) {
          throw new Error(`Too many redirects (limit: ${maxRedirects})`);
        }

        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect response missing Location header');
        }

        const nextUrl = new URL(location, validated.url.origin).toString();
        currentUrl = nextUrl;
        continue;
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}
