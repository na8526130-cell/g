import net from 'node:net';
import path from 'node:path';

/**
 * Checks whether an IPv4 or IPv6 address literal belongs to loopback, private,
 * link-local, unspecified, or metadata ranges to prevent SSRF.
 */
function isPrivateOrBlockedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a >= 224) return true; // multicast/reserved
    return false;
  }

  if (net.isIPv6(clean)) {
    if (clean === '::' || clean === '::1') return true;
    if (clean.startsWith('::ffff:')) {
      return isPrivateOrBlockedIp(clean.slice('::ffff:'.length));
    }
    if (/^(fc|fd)[0-9a-f]{2}:/i.test(clean)) return true; // unique local
    if (/^fe[89ab][0-9a-f]:/i.test(clean)) return true; // link-local
    if (/^ff[0-9a-f]{2}:/i.test(clean)) return true; // multicast
    return false;
  }

  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

export function assertSafeHttpUrl(rawUrl: string, allowedHostSuffixes?: string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS URLs are permitted');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Credentials in URL are not permitted');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Blocked destination host');
  }

  if (net.isIP(host.replace(/^\[|\]$/g, '')) && isPrivateOrBlockedIp(host)) {
    throw new Error('Blocked private IP address');
  }

  if (allowedHostSuffixes && allowedHostSuffixes.length > 0) {
    const matched = allowedHostSuffixes.some((suffix) => {
      const norm = suffix.toLowerCase().replace(/^\./, '');
      return host === norm || host.endsWith(`.${norm}`);
    });
    if (!matched) {
      throw new Error(`Host "${host}" is outside allowlist`);
    }
  }

  return parsed;
}

/**
 * Normalizes a relative sub-path inside an embedded tool namespace and rejects
 * path traversal or control characters.
 */
export function sanitizeToolRelPath(rawPath: string): string {
  const withoutQuery = String(rawPath || '').split('?')[0].split('#')[0];
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }

  if (decoded.includes('\0') || decoded.includes('\\')) {
    throw new Error('Invalid path characters');
  }

  const trimmed = decoded.replace(/^\/+/, '');
  const normalized = path.posix.normalize(trimmed);

  if (normalized === '.' || normalized === '') {
    return '';
  }

  if (normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error('Path traversal is not permitted');
  }

  return normalized;
}
