'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';

if (typeof window !== 'undefined') {
  posthog.init('phc_wQhj7QbGwKoPQJxhSPLvXsuAtWF47bpFAUxBXbNdqGD5', {
    api_host: 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();
  const identifiedRef = useRef(false);

  useEffect(() => {
    if (identifiedRef.current) return;
    const identify = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        ph.identify(user.id, { email: user.email });
        identifiedRef.current = true;
      }
    };
    identify();
  }, [ph]);

  useEffect(() => {
    if (!pathname) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    ph.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PageViewTracker />
      {children}
    </PHProvider>
  );
}
