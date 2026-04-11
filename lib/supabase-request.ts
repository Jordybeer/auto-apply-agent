import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const COOKIE_OPTS = {
  maxAge: 60 * 60 * 24 * 30,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...(value ? COOKIE_OPTS : {}) })
          );
        },
      },
    }
  );
}
