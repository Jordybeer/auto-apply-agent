'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Home, ListTodo, Sparkles, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Transition } from 'framer-motion';

const TABS = [
  { href: '/',          label: 'Home',         Icon: Home     },
  { href: '/queue',     label: 'Queue',        Icon: ListTodo },
  { href: '/insights',  label: 'Insights',     Icon: Sparkles },
  { href: '/settings',  label: 'Instellingen', Icon: Settings },
] as const;

const spring: Transition = { type: 'spring' as const, stiffness: 500, damping: 35 };

export default function NavBar() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const supabaseRef = useRef(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  useEffect(() => {
    const supabase = supabaseRef.current;
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

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
        // Tabs zelf: 56px hoog
        // safe-area-inset-bottom vult de home-indicator zone
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', width: '100%', maxWidth: 560, margin: '0 auto', position: 'relative', height: 56 }}>
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <motion.div
              key={href}
              style={{ flex: 1, position: 'relative' }}
              whileTap={{ scale: 0.88 }}
              transition={spring}
            >
              <Link
                href={href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  height: '100%',
                  color: active ? 'var(--accent)' : 'var(--text2)',
                  textDecoration: 'none',
                  minWidth: 0,
                  WebkitTapHighlightColor: 'transparent',
                  width: '100%',
                }}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pip"
                    transition={spring}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      translateX: '-50%',
                      width: 24,
                      height: 2,
                      borderRadius: 2,
                      background: 'var(--accent)',
                    }}
                  />
                )}
                <motion.div
                  animate={{ color: active ? 'var(--accent)' : 'var(--text2)' }}
                  transition={{ duration: 0.18 }}
                >
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.7} style={{ flexShrink: 0 }} />
                </motion.div>
                <motion.span
                  animate={{ color: active ? 'var(--accent)' : 'var(--text2)', fontWeight: active ? 600 : 400 }}
                  transition={{ duration: 0.18 }}
                  style={{ fontSize: 10, letterSpacing: 0.2 }}
                >
                  {label}
                </motion.span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.nav>
  );
}
