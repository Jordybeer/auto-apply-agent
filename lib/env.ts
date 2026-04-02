/**
 * Centralised env var access with build-time validation.
 * Import these constants instead of using process.env directly with ! assertions.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const SUPABASE_URL      = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
