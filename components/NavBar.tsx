'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Home, ListTodo, BarChart2, CheckCheck, UserCircle, Settings, ShieldCheck, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { getQueueBadge } from '@/lib/queue-badge';

const LAST_SEEN_KEY = 'queueLastSeenAt';

const BASE_TABS = [
  { href: '/',          label: 'Home',        Icon: Home        },
  { href: '/queue',     label: 'Wachtrij',    Icon: ListTodo    },
  { href: '/analyse',   label: 'Analyseer',   Icon: BarChart2   },
  { href: '/insights',  label: 'Inzichten',   Icon: CheckCheck  },
  { href: '/profiel',   label: 'Profiel',     Icon: UserCircle  },
  { href: '/settings',  label: 'Instellingen', Icon: Settings   },
] as const;

const ADMIN_TAB    = { href: '/admin',   label: 'Admin',   Icon: ShieldCheck } as const;
const UPGRADE_TAB  = { href: '/upgrade', label: 'Premium', Icon: Zap         } as const;

export default function NavBar() {
  const pathname = usePathname();
  const [authed, setAuthed]       = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [newCount, setNewCount]     = useState(0);
  const supabaseRef = useRef(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  const isOnQueuePage = pathname.startsWith('/queue');

  const checkAdmin = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status');
      if (res.ok) { const d = await res.json(); setIsAdmin(!!d.is_admin); }
    } catch {}
  }, []);

  const checkSubscription = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription/status');
      if (res.ok) { const d = await res.json(); setIsPremium(!!d.is_premium); }
    } catch {}
  }, []);

  const checkQueue = useCallback(async () => {
    try {
      // Read stored lastSeenAt — seed it now if missing so first visit is clean
      let lastSeenAt = localStorage.getItem(LAST_SEEN_KEY);
      if (!lastSeenAt) {
        lastSeenAt = new Date().toISOString();
        localStorage.setItem(LAST_SEEN_KEY, lastSeenAt);
      }
      const url = `/api/notifications?lastSeenAt=${encodeURIComponent(lastSeenAt)}`;
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        setQueueCount(d.queueCount ?? 0);
        setNewCount(d.newCount ?? 0);
      }
    } catch {}
  }, []);

  // When user navigates to /queue: stamp lastSeenAt, clear new badge immediately
  useEffect(() => {
    if (isOnQueuePage) {
      setNewCount(0);
      try { localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString()); } catch {}
    }
  }, [isOnQueuePage]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setAuthed(true); checkAdmin(); checkSubscription(); checkQueue(); }
      else setAuthed(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const ok = !!session?.user;
      setAuthed(ok);
      if (ok) { checkAdmin(); checkSubscription(); checkQueue(); }
    });
    return () => subscription.unsubscribe();
  }, [checkAdmin, checkSubscription, checkQueue]);

  if (pathname === '/login') return null;
  if (authed !== true) return (
    <div
      className="fixed bottom-0 left-0 right-0"
      style={{
        height: 'var(--navbar-h)',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        zIndex: 'var(--z-nav)',
      }}
      aria-hidden="true"
    />
  );

  const tabs = [
    ...BASE_TABS,
    ...(!isPremium ? [UPGRADE_TAB] : []),
    ...(isAdmin    ? [ADMIN_TAB]   : []),
  ];

  const badge = getQueueBadge(newCount, queueCount, isOnQueuePage);

  return (
    <motion.nav
      aria-label="Hoofdnavigatie"
      className="glass-nav"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.05 }}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 'var(--z-nav)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex w-full max-w-[560px] mx-auto py-[4px] px-2 gap-0.5 h-[58px] items-center">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const isQueue = href === '/queue';
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex-1 relative flex flex-col items-center justify-center gap-[3px] h-[46px] rounded-xl no-underline [-webkit-tap-highlight-color:transparent]"
              style={{ color: active ? 'var(--accent)' : 'var(--text3)', isolation: 'isolate' }}
            >
              {active && (
                <motion.span
                  layoutId="navbar-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'var(--surface2)', zIndex: 0, pointerEvents: 'none' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative flex flex-col items-center gap-[3px]" style={{ zIndex: 1 }}>
                {isQueue && badge.kind !== 'none' && (
                  <motion.span
                    key={`${badge.kind}-${badge.count}`}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 18, stiffness: 320 }}
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] leading-4 flex items-center justify-center font-semibold"
                    style={{
                      zIndex: 2,
                      background: badge.kind === 'green' ? 'var(--green, #22c55e)' : '#ef4444',
                    }}
                  >
                    {badge.count > 9 ? '9+' : badge.count}
                  </motion.span>
                )}
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[10px] tracking-[0.15px]" style={{ fontWeight: active ? 700 : 500 }}>
                  {label}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
