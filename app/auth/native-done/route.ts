import { createServerClient } from '@supabase/ssr';
import { NextResponse, NextRequest } from 'next/server';

const COOKIE_OPTS = {
  maxAge: 60 * 60 * 24 * 30,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const at = searchParams.get('at');
  const rt = searchParams.get('rt');

  if (!at || !rt) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const collector = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            collector.cookies.set(name, value, { ...options, ...(value ? COOKIE_OPTS : {}) });
          });
        },
      },
    }
  );

  await supabase.auth.setSession({ access_token: at, refresh_token: rt });

  const response = NextResponse.redirect(`${origin}/`);
  collector.cookies.getAll().forEach(({ name, value, ...rest }) => {
    response.cookies.set(name, value, rest);
  });
  return response;
}
