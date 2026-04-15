'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

/**
 * Returns `true` once a Supabase session is confirmed client-side.
 * Stays `false` on /login and during the initial SSR hydration window.
 */
export function useAuth(): boolean {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return authed;
}
