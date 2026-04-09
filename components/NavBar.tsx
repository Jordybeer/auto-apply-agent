'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Home, ListTodo, Bookmark, CheckCheck, BarChart2, Settings, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const BASE_TABS = [
  { href: '/',           label: 'Home',           Icon: Home      },
  { href: '/?tab=queue', label: 'Wachtrij',       Icon: ListTodo  },
  { href: '/analyse',    label: 'Analyseer',      Icon: BarChart2 },
  { href: '/insights',   label: 'Inzichten',      Icon: CheckCheck},
  { href: '/settings',   label: 'Instellingen',   Icon: Settings  },
] as const;

const ADMIN_TAB = { href: '/admin', label: 'Admin', Icon: ShieldCheck } as const;

export default function NavBar() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const tabParam     = searchParams.get('tab');
  const [authed, setAuthed]   = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const supabaseRef = useRef(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  const checkAdmin = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status');
      if (res.ok) { const d = await res.json(); setIsAdmin(!!d.is_admin); }
    } catch {}
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setAuthed(true); checkAdmin(); }
      else setAuthed(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const ok = !!session?.user;
      setAuthed(ok);
      if (ok) checkAdmin();
    });
    return () => subscription.unsubscribe();
  }, [checkAdmin]);

  if (pathname === '/login' || authed !== true) return null;

  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

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
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex w-full max-w-[560px] mx-auto py-[6px] px-2 gap-0.5 h-[58px] items-center">
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === '/'           ? pathname === '/' && !tabParam
            : href === '/?tab=queue' ? pathname === '/' && !!tabParam
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-[3px] h-[46px] rounded-xl no-underline [-webkit-tap-highlight-color:transparent] transition-[color,background] duration-[180ms]"
              style={{
                background: active ? 'var(--surface2)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text3)',
              }}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span className="text-[9px] tracking-[0.2px]" style={{ fontWeight: active ? 700 : 500 }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
