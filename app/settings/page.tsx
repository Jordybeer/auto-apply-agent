'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion } from 'framer-motion';
import SettingsMenu from '@/components/SettingsMenu';

export default function SettingsPage() {
  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  );

  const [email, setEmail]     = useState<string | null>(null);
  const [avatar, setAvatar]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? null);
        setAvatar(data.user.user_metadata?.avatar_url ?? null);
      }
      setLoading(false);
    });
  }, [supabase]);

  return (
    <main className="page-shell flex flex-col gap-5" style={{ position: 'relative', zIndex: 1 }}>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
        Instellingen
      </h1>

      {!loading && email && (
        <UserCard email={email} avatar={avatar} supabase={supabase} />
      )}

      <SettingsMenu />
    </main>
  );
}

function UserCard({
  email, avatar, supabase,
}: {
  email: string;
  avatar: string | null;
  supabase: ReturnType<typeof createBrowserClient>;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        {avatar
          ? <img src={avatar} className="w-10 h-10 rounded-full flex-shrink-0" style={{ border: '2px solid var(--border-bright)' }} alt="" />
          : (
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-base font-bold glass"
              style={{ border: '2px solid var(--border-bright)', color: 'var(--accent)' }}
            >
              {email[0].toUpperCase()}
            </div>
          )
        }
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{email}</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>Ingelogd</p>
        </div>
      </div>

      <motion.button
        onClick={logout}
        disabled={loggingOut}
        whileTap={{ scale: 0.93 }}
        className="glass-btn flex-shrink-0 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
        style={{ cursor: 'pointer', color: 'var(--red)' }}
      >
        {loggingOut ? '...' : 'Uitloggen'}
      </motion.button>
    </motion.div>
  );
}
