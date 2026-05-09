'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';

const TEST_EMAILS = (process.env.NEXT_PUBLIC_TEST_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
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
        const isTester = TEST_EMAILS.includes(user.email ?? '');
        ph.identify(user.id, { email: user.email, is_tester: isTester });
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
