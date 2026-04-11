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
  const code = searchParams.get('code');

  // Default redirect; may be overridden below
  let redirectPath = '/';

  // Use a temporary NextResponse to collect Set-Cookie headers, then copy
  // them onto the final redirect. Cookies set via `await cookies()` are NOT
  // reliably forwarded to a separately-constructed NextResponse.redirect(),
  // which was causing the session to be lost on every refresh.
  const collector = NextResponse.next({ request });

  if (code) {
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

    await supabase.auth.exchangeCodeForSession(code);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!settings) {
        redirectPath = '/onboarding';
      }
    }
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  // Forward every session cookie onto the redirect response so the browser
  // stores them before following the redirect.
  collector.cookies.getAll().forEach(({ name, value, ...rest }) => {
    response.cookies.set(name, value, rest);
  });

  return response;
}
