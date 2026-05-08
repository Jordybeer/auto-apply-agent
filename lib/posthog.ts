import posthog from 'posthog-js';

/**
 * Track a custom PostHog event.
 * Safe to call anywhere on the client side.
 *
 * Usage:
 *   import { trackEvent } from '@/lib/posthog';
 *   trackEvent('job_queued', { jobId, title });
 */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  posthog.capture(event, properties);
}
