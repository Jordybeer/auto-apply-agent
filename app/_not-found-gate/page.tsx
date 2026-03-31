import { notFound } from 'next/navigation';

/**
 * This page exists solely as a redirect target for the proxy when a
 * non-admin user tries to access /admin/*.
 *
 * proxy.ts cannot call notFound() directly (it runs as edge middleware),
 * so it redirects here and we call notFound() which correctly triggers
 * app/not-found.tsx with a real HTTP 404.
 *
 * The leading underscore keeps it out of navigation menus and makes the
 * intent clear — this is an internal gate, not a user-facing page.
 */
export default function NotFoundGate() {
  notFound();
}
