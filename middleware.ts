import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login'];

const BYPASS_PREFIXES = [
  '/_next',
  '/api',
  '/favicon.ico',
  '/apple-icon.png',
  '/auth/callback',
];

const COOKIE_OPTS = {
  maxAge: 60 * 60 * 24 * 30,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

function redirectWithCookies(url: URL | string, collector: NextResponse): NextResponse {
  const r = NextResponse.redirect(url);
  collector.cookies.getAll().forEach(({ name, value, ...rest }) => r.cookies.set(name, value, rest));
  return r;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, {
              ...options,
              ...(value ? COOKIE_OPTS : {}),
            });
          });
        },
      },
    },
  );

  // getSession() triggers token refresh and writes new tokens back via setAll.
  // getUser() then validates the (possibly refreshed) session server-side.
  await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!isPublic) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return redirectWithCookies(loginUrl, response);
    }
    return response;
  }

  const isAdmin = user.app_metadata?.role === 'admin';

  if (pathname.startsWith('/admin') && !isAdmin) {
    return redirectWithCookies(new URL('/_not-found-gate', request.url), response);
  }

  const { data: settings, error: settingsErr } = await supabase
    .from('user_settings')
    .select('is_onboarded, is_active')
    .eq('user_id', user.id)
    .single();

  if (settingsErr && settingsErr.code !== 'PGRST116') {
    return response;
  }

  if (settings?.is_active === false) {
    await supabase.auth.signOut();
    return redirectWithCookies(new URL('/login?reason=disabled', request.url), response);
  }

  const onboarded = settings?.is_onboarded === true;
  const isOnboardingPage = pathname.startsWith('/onboarding');

  if (!onboarded && !isOnboardingPage) {
    return redirectWithCookies(new URL('/onboarding', request.url), response);
  }

  if (onboarded && isOnboardingPage) {
    return redirectWithCookies(new URL('/', request.url), response);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
