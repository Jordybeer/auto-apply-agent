import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Routes accessible without authentication.
 * Everything else redirects to /login.
 */
const PUBLIC_ROUTES = ['/', '/login', '/settings'];

/**
 * Paths that bypass the middleware entirely
 * (Next.js internals, static assets, API routes).
 */
const BYPASS_PREFIXES = ['/_next', '/api', '/favicon.ico', '/apple-icon.png'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow Next.js internals and API routes through
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Build a Supabase client that can read the session from cookies
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Unauthenticated: only public routes allowed ---
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

  // --- Authenticated: check admin role for protected admin paths ---
  // Admin users (role stored in user_metadata) can access all routes.
  // Non-admin users are limited to PUBLIC_ROUTES + any route not under /admin.
  const isAdmin =
    user.user_metadata?.role === 'admin' ||
    user.app_metadata?.role === 'admin';

  const isAdminRoute = pathname.startsWith('/admin');

  if (isAdminRoute && !isAdmin) {
    // Authenticated but not admin → show 404 instead of redirect
    // to avoid leaking that the route exists
    const notFoundUrl = request.nextUrl.clone();
    notFoundUrl.pathname = '/not-found';
    return NextResponse.rewrite(notFoundUrl);
  }

  return response;
}

export const config = {
  /*
   * Match all request paths except:
   * - _next/static  (static files)
   * - _next/image   (image optimisation)
   * - favicon.ico
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
