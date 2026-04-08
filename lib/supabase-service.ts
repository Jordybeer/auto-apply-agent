/**
 * Creates a Supabase client using the service-role key.
 * SERVER ONLY — never import from client components.
 * Used for admin operations like writing system logs.
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';

export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}
