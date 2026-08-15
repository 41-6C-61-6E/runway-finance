import { describe, it, expect } from 'vitest';
import { isPrivateIPv4, isPrivateIPv6, isPrivateIP, validateEndpointUrl } from '@/lib/utils/ssrf';

describe('SSRF Guard', () => {
  describe('isPrivateIPv4', () => {
    it('detects standard private and loopback IPv4 addresses', () => {
      expect(isPrivateIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateIPv4('127.100.0.1')).toBe(true);
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateIPv4('192.168.1.1')).toBe(true);
      expect(isPrivateIPv4('169.254.169.254')).toBe(true);
      expect(isPrivateIPv4('0.0.0.0')).toBe(true);
      expect(isPrivateIPv4('100.64.0.1')).toBe(true); // CGNAT
    });

    it('allows public IPv4 addresses', () => {
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateIPv4('93.184.216.34')).toBe(false);
    });
  });

  describe('isPrivateIPv6', () => {
    it('detects IPv6 loopback, unspecified, and private ranges', () => {
      expect(isPrivateIPv6('::1')).toBe(true);
      expect(isPrivateIPv6('::')).toBe(true);
      expect(isPrivateIPv6('0:0:0:0:0:0:0:1')).toBe(true);
      expect(isPrivateIPv6('fc00::1')).toBe(true);
      expect(isPrivateIPv6('fd12:3456::1')).toBe(true);
      expect(isPrivateIPv6('fe80::1')).toBe(true);
      expect(isPrivateIPv6('ff02::1')).toBe(true); // Multicast
    });

    it('detects IPv4-mapped IPv6 private addresses', () => {
      expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIPv6('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateIPv6('::ffff:10.0.0.5')).toBe(true);
      expect(isPrivateIPv6('::ffff:192.168.0.1')).toBe(true);
    });

    it('allows public IPv6 addresses and public IPv4-mapped IPv6', () => {
      expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);
      expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
      expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
    });
  });

  describe('validateEndpointUrl', () => {
    it('rejects invalid schemes', async () => {
      const res = await validateEndpointUrl('ftp://example.com/data');
      expect(res.ok).toBe(false);
    });

    it('rejects localhost and private hostnames', async () => {
      expect((await validateEndpointUrl('http://localhost:3000')).ok).toBe(false);
      expect((await validateEndpointUrl('http://127.0.0.1:8000')).ok).toBe(false);
      expect((await validateEndpointUrl('http://host.docker.internal:8080')).ok).toBe(false);
    });

    it('rejects IP literals', async () => {
      expect((await validateEndpointUrl('http://169.254.169.254/latest/meta-data')).ok).toBe(false);
      expect((await validateEndpointUrl('http://[::1]:8080')).ok).toBe(false);
    });

    it('allows public valid domains', async () => {
      const res = await validateEndpointUrl('https://api.openai.com/v1');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.url.hostname).toBe('api.openai.com');
      }
    });
  });
});
