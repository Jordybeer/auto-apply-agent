'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Home, ListTodo, CheckSquare, Sparkles, Settings } from 'lucide-react';
import SettingsSheet from '@/components/SettingsSheet';

const TABS = [
  { href: '/',         label: 'Home',     Icon: Home        },
  { href: '/queue',    label: 'Queue',    Icon: ListTodo    },
  { href: '/applied',  label: 'Applied',  Icon: CheckSquare },
  { href: '/insights', label: 'Insights', Icon: Sparkles    },
] as const;

export default function NavBar() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, [pathname]);

  if (pathname === '/login' || authed !== true) return null;

  const settingsActive = settingsOpen;

  return (
    <>
      {/* Bottom tab bar */}
      <nav
        aria-label="Hoofdnavigatie"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--nav-bg)',
          borderTop: '1px solid var(--nav-border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'flex', width: '100%', maxWidth: 560, margin: '0 auto' }}>
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  padding: '10px 0 8px',
                  color: active ? 'var(--accent)' : 'var(--text2)',
                  transition: 'color 0.15s',
                  textDecoration: 'none',
                  minWidth: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.2 : 1.7}
                  style={{ flexShrink: 0 }}
                />
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: 0.2 }}>
                  {label}
                </span>
                {active && (
                  <span style={{
                    position: 'absolute',
                    top: 0,
                    width: 24,
                    height: 2,
                    borderRadius: 2,
                    background: 'var(--accent)',
                  }} />
                )}
              </Link>
            );
          })}

          {/* Settings tab — opens sheet */}
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Instellingen"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '10px 0 8px',
              color: settingsActive ? 'var(--accent)' : 'var(--text2)',
              transition: 'color 0.15s',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              minWidth: 0,
              WebkitTapHighlightColor: 'transparent',
              position: 'relative',
            } as React.CSSProperties}
          >
            <Settings size={20} strokeWidth={settingsActive ? 2.2 : 1.7} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: settingsActive ? 600 : 400, letterSpacing: 0.2 }}>
              Instellingen
            </span>
          </button>
        </div>
      </nav>

      {/* Settings sheet rendered outside nav so z-index stacking is clean */}
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
