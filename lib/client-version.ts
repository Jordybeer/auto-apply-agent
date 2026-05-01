/**
 * Parses the X-JobTide-Client header sent by native iOS / web clients.
 * Format: "<platform>/<marketing>+<build>" e.g. "ios/0.1.0+1" or "web/0.1.2".
 * Falls back to "web/unknown" so server logs always have a client field.
 */
export interface ClientInfo {
  platform: 'ios' | 'web' | 'unknown';
  version: string;
  build?: string;
  raw: string;
}

export function parseClientHeader(raw: string | null | undefined): ClientInfo {
  if (!raw) return { platform: 'web', version: 'unknown', raw: '' };
  const m = raw.match(/^(ios|web)\/([^+\s]+)(?:\+([^\s]+))?$/i);
  if (!m) return { platform: 'unknown', version: raw, raw };
  return {
    platform: m[1].toLowerCase() as 'ios' | 'web',
    version: m[2],
    build: m[3],
    raw,
  };
}

export function clientFromHeaders(headers: Headers): ClientInfo {
  return parseClientHeader(headers.get('x-jobtide-client'));
}
