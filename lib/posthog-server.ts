/**
 * Lightweight server-side PostHog capture.
 * Does NOT import posthog-js (browser only).
 * Fire-and-forget — errors are silently swallowed so they never break a route.
 */
export function captureServer(
  userId: string,
  event: string,
  properties: Record<string, unknown> = {},
) {
  const key = process.env.POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  if (!key) return;

  const payload = {
    api_key: key,
    batch: [
      {
        event,
        distinct_id: userId,
        properties: {
          $lib: 'posthog-node',
          ...properties,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  fetch(`${host}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
