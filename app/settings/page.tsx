'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import SettingsMenu from '@/components/SettingsMenu';
import { WALKTHROUGH_KEY } from '@/components/OnboardingWalkthrough';

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

      <SenderModeBadge />

      <WalkthroughButton />

      <div data-walkthrough="instellingen-menu">
        <SettingsMenu />
      </div>
    </main>
  );
}

function WalkthroughButton() {
  const start = () => {
    localStorage.removeItem(WALKTHROUGH_KEY);
    window.dispatchEvent(new Event('walkthrough:open'));
  };
  return (
    <motion.button
      onClick={start}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3 w-full text-left"
      style={{ border: '1px solid var(--accent-dim)', cursor: 'pointer' }}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
        <HelpCircle size={16} style={{ color: 'var(--accent)' }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)', margin: 0 }}>Rondleiding hervatten</p>
        <p className="text-xs" style={{ color: 'var(--text2)', margin: 0 }}>Uitleg over alle functies van de app</p>
      </div>
    </motion.button>
  );
}

function SenderModeBadge() {
  const mode       = process.env.NEXT_PUBLIC_MAIL_MODE ?? 'direct';
  const isSelf     = mode === 'self';
  const selfAddr   = process.env.NEXT_PUBLIC_MAIL_SELF_ADDRESS ?? 'info@jordy.beer';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>
          Verzendmodus
        </p>
        <p className="text-sm" style={{ color: 'var(--text)' }}>
          {isSelf
            ? <>Mails gaan naar <span style={{ color: 'var(--accent)' }}>{selfAddr}</span> voor review</>  
            : 'Direct naar werkgever'}
        </p>
      </div>
      <span
        className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{
          background: isSelf ? 'rgba(251,191,36,0.13)' : 'rgba(74,222,128,0.13)',
          color:      isSelf ? 'var(--yellow)'         : 'var(--green)',
          border:     `1px solid ${isSelf ? 'rgba(251,191,36,0.35)' : 'rgba(74,222,128,0.35)'}`,
        }}
      >
        {isSelf ? 'REVIEW' : 'DIRECT'}
      </span>
    </motion.div>
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
