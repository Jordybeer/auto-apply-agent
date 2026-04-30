import { createServerClient } from '@supabase/ssr';
import { NextResponse, NextRequest } from 'next/server';
import type { Session } from '@supabase/supabase-js';

const COOKIE_OPTS = {
  maxAge: 60 * 60 * 24 * 30,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  let redirectPath = '/';
  let session: Session | null = null;

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

    ({ data: { session } } = await supabase.auth.exchangeCodeForSession(code));

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

  const native = searchParams.get('native') === '1';

  let destination: string;
  if (native) {
    const params = session
      ? new URLSearchParams({ at: session.access_token, rt: session.refresh_token }).toString()
      : '';
    destination = params ? `jobtide://session-ready?${params}` : 'jobtide://session-ready';
  } else {
    destination = `${origin}${redirectPath}`;
  }
  const response = NextResponse.redirect(destination);

  collector.cookies.getAll().forEach(({ name, value, ...rest }) => {
    response.cookies.set(name, value, rest);
  });

  return response;
}
