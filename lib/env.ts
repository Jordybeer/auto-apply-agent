/**
 * Centralised env var access with build-time validation.
 * NEXT_PUBLIC_* vars MUST be accessed via literal dot-notation so the
 * Next.js bundler can statically inline them into the client bundle.
 * Dynamic bracket access (process.env[name]) is NOT replaced by the bundler.
 */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (() => { throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL'); })();

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (() => { throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY'); })();
