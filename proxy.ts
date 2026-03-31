import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Routes accessible without being authenticated.
 * Everything else redirects to /login.
 */
const PUBLIC_ROUTES = ['/', '/login', '/settings'];

/**
 * Paths that bypass auth entirely
 * (Next.js internals, API routes, static assets).
 */
const BYPASS_PREFIXES = ['/_next', '/api', '/favicon.ico', '/apple-icon.png'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always pass through Next.js internals and API routes
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
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ── Unauthenticated ──────────────────────────────────────────────────────
  if (!user) {
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!isPublic) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // ── Authenticated ────────────────────────────────────────────────────────

  // Admin check: role stored in user_metadata or app_metadata
  const isAdmin =
    user.user_metadata?.role === 'admin' ||
    user.app_metadata?.role === 'admin';

  // Non-admin users hitting /admin/* get redirected to a route that calls
  // Next.js notFound() — this correctly renders app/not-found.tsx with a 404.
  // We cannot use NextResponse.rewrite('/not-found') because not-found.tsx is
  // a special Next.js file, not a real routable URL.
  if (pathname.startsWith('/admin') && !isAdmin) {
    return NextResponse.redirect(new URL('/_not-found-gate', request.url));
  }

  // Onboarding gate: redirect un-onboarded users before they hit any app page
  const { data: settings } = await supabase
    .from('user_settings')
    .select('is_onboarded')
    .eq('user_id', user.id)
    .single();

  const onboarded = settings?.is_onboarded === true;
  const isOnboardingPage = pathname.startsWith('/onboarding');

  if (!onboarded && !isOnboardingPage) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  if (onboarded && isOnboardingPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
