import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/env';

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
