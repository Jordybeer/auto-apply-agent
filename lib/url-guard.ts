/**
 * SSRF protection: rejects URLs that resolve to private/internal network ranges.
 *
 * Call `assertSafeUrl(url)` before any server-side fetch of a user-supplied URL.
 * Throws a descriptive error when the URL is disallowed; returns void otherwise.
 */

const PRIVATE_IP_PATTERNS: RegExp[] = [
  // Loopback
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
  // RFC-1918 private ranges
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  // Link-local (AWS metadata at 169.254.169.254, etc.)
  /^169\.254\.\d+\.\d+$/,
  /^fe80:/i,
  // IPv6 unique-local
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  // Multicast
  /^22[4-9]\.|^2[3-5]\d\./,
  /^ff[0-9a-f]{2}:/i,
  // Wildcard
  /^0\.\d+\.\d+\.\d+$/,
];

export function isPrivateOrDisallowedUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return true; // Can't parse → treat as disallowed
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return true;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Strip IPv6 brackets if present
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  return PRIVATE_IP_PATTERNS.some((re) => re.test(bare));
}

/**
 * Throws a 400-style error if the URL targets a private/internal address.
 * Use this in API routes before passing a user URL to scraping functions.
 */
export function assertSafeUrl(urlString: string): void {
  if (isPrivateOrDisallowedUrl(urlString)) {
    throw new Error(`Disallowed URL: ${urlString}`);
  }
}
