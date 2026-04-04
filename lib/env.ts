/**
 * Centralised env var access with build-time validation.
 * NEXT_PUBLIC_* vars MUST be accessed via literal dot-notation so the
 * Next.js bundler can statically inline them into the client bundle.
 * Dynamic bracket access (process.env[name]) is NOT replaced by the bundler.
 */

// ── Public (client-safe) ─────────────────────────────────────────────────────
// These are inlined at build time by Next.js. Safe to import from client components.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (() => { throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL'); })();

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (() => { throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY'); })();

// ── Server-only ──────────────────────────────────────────────────────────────
// Use requireServerEnv() inside API route handlers or server-only lib files.
// Never call this at module scope in a file that may be imported by a client component.

/**
 * Returns the value of a server-side environment variable.
 * Throws a clear Error at runtime if the variable is missing or empty,
 * so misconfigured deployments fail fast with an actionable message.
 *
 * @example
 * const groqKey = requireServerEnv('GROQ_API_KEY');
 */
export function requireServerEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required server environment variable: ${name}`);
  return val;
}
