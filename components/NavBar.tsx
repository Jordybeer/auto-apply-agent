'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Home, ListTodo, Bookmark, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Transition } from 'framer-motion';

const TABS = [
  { href: '/',             label: 'Home',           Icon: Home,       countKey: null        },
  { href: '/queue',        label: 'Wachtrij',       Icon: ListTodo,   countKey: 'queue'     },
  { href: '/saved',        label: 'Bewaard',        Icon: Bookmark,   countKey: 'saved'     },
  { href: '/applied',      label: 'Gesolliciteerd', Icon: CheckCheck, countKey: 'applied'   },
] as const;

type CountKey = 'queue' | 'saved' | 'applied';
type Counts = Record<CountKey, number>;

const spring: Transition = { type: 'spring' as const, stiffness: 500, damping: 35 };
const MotionLink = motion(Link);

// Shared count cache so NavBar and home page don't double-fetch
let cachedCounts: Counts | null = null;
let cacheTs = 0;
const CACHE_TTL = 30_000; // 30s

export default function NavBar() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Counts>({ queue: 0, saved: 0, applied: 0 });
  const supabaseRef = useRef(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  const fetchCounts = useCallback(async (force = false) => {
    if (!force && cachedCounts && Date.now() - cacheTs < CACHE_TTL) {
      setCounts(cachedCounts);
      return;
    }
    try {
      const [q, s, a] = await Promise.all([
        fetch('/api/queue').then(r => r.json()),
        fetch('/api/saved').then(r => r.json()),
        fetch('/api/applied').then(r => r.json()),
      ]);
      const next: Counts = {
        queue:   q.applications?.length ?? 0,
        saved:   s.applications?.length ?? 0,
        applied: a.applications?.length ?? 0,
      };
      cachedCounts = next;
      cacheTs = Date.now();
      setCounts(next);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setAuthed(true); fetchCounts(); }
      else setAuthed(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const ok = !!session?.user;
      setAuthed(ok);
      if (ok) fetchCounts(true);
    });
    return () => subscription.unsubscribe();
  }, [fetchCounts]);

  // Re-fetch when navigating back to any tab
  useEffect(() => {
    if (authed) fetchCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (pathname === '/login' || authed !== true) return null;

  return (
    <motion.nav
      aria-label="Hoofdnavigatie"
      className="glass-nav"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring' as const, stiffness: 380, damping: 30, delay: 0.05 }}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Pill row */}
      <div style={{
        display: 'flex',
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: '8px 12px',
        gap: 6,
        height: 56,
        alignItems: 'center',
      }}>
        {TABS.map(({ href, label, Icon, countKey }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const count = countKey ? counts[countKey] : 0;

          return (
            <MotionLink
              key={href}
              href={href}
              whileTap={{ scale: 0.91 }}
              transition={spring}
              style={{
                flex: active ? 2.2 : 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: active ? 6 : 0,
                height: 38,
                borderRadius: 9999,
                background: active ? 'var(--accent)' : 'var(--surface2)',
                color: active ? '#fff' : 'var(--text2)',
                textDecoration: 'none',
                overflow: 'hidden',
                border: active ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--border)',
                boxShadow: active ? '0 4px 14px var(--accent-glow)' : 'none',
                transition: 'flex 0.28s cubic-bezier(0.16,1,0.3,1), background 0.18s, box-shadow 0.18s',
                WebkitTapHighlightColor: 'transparent',
                minWidth: 38,
              }}
            >
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} style={{ flexShrink: 0 }} />

              <AnimatePresence initial={false}>
                {active && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: 0.1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Counter badge */}
              <AnimatePresence>
                {!active && count > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 7,
                      minWidth: 14,
                      height: 14,
                      borderRadius: 9999,
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 8,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 3px',
                      lineHeight: 1,
                      pointerEvents: 'none',
                    }}
                  >
                    {count > 99 ? '99+' : count}
                  </motion.span>
                )}
              </AnimatePresence>
            </MotionLink>
          );
        })}
      </div>
    </motion.nav>
  );
}
