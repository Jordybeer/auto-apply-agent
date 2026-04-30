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
  const provider = searchParams.get('provider');
  const native = searchParams.get('native') === '1';

  if (provider !== 'google' && provider !== 'github') {
    return NextResponse.redirect(`${origin}/login`);
  }

  const collector = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            collector.cookies.set(name, value, {
              ...options,
              ...(value ? COOKIE_OPTS : {}),
            });
          });
        },
      },
    }
  );

  const redirectTo = `${origin}/auth/callback${native ? '?native=1' : ''}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(`${origin}/login?err=oauth-init`);
  }

  const response = NextResponse.redirect(data.url);
  collector.cookies.getAll().forEach(({ name, value, ...rest }) => {
    response.cookies.set(name, value, rest);
  });
  return response;
}
