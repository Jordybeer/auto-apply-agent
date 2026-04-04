import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: sessionData } = await supabase.auth.exchangeCodeForSession(code);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Persist the Gmail refresh_token whenever Google provides one.
      // Google only sends refresh_token when access_type=offline + prompt=consent
      // are set on the OAuth call — which our login page does.
      // We upsert so both first-login and re-consent flows are handled.
      const refreshToken = sessionData?.session?.provider_refresh_token;
      if (refreshToken) {
        await supabase
          .from('user_settings')
          .upsert(
            { user_id: user.id, gmail_refresh_token: refreshToken },
            { onConflict: 'user_id', ignoreDuplicates: false },
          );
      } else {
        // Google did not provide a refresh token (already consented previously).
        // Check whether we already have one stored; if not, the user must re-login
        // via the login page so Google issues a new one with prompt=consent.
        const { data: existing } = await supabase
          .from('user_settings')
          .select('gmail_refresh_token')
          .eq('user_id', user.id)
          .single();

        if (!existing?.gmail_refresh_token) {
          // Force a new Google consent next time by redirecting to /login
          // (the login page always sets prompt=consent).
          console.warn('No Gmail refresh token available — redirecting to login for re-consent.');
          return NextResponse.redirect(`${origin}/login?reason=gmail_reauth`);
        }
      }

      const { data: settings } = await supabase
        .from('user_settings')
        .select('scrape_api_key')
        .eq('user_id', user.id)
        .single();

      if (!settings?.scrape_api_key) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
