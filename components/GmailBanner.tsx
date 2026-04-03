'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Mail, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function GmailBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Only relevant for Google users
      const provider = user.app_metadata?.provider;
      if (provider !== 'google') return;

      const { data } = await supabase
        .from('user_settings')
        .select('gmail_refresh_token')
        .eq('user_id', user.id)
        .single();

      if (!data?.gmail_refresh_token) setShow(true);
    }

    check();
  }, []);

  if (!show || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="gmail-banner"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <Mail size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span>
          Log opnieuw in om e-mails te kunnen versturen via Gmail.{' '}
          <a
            href="/login"
            style={{ color: '#fff', textDecoration: 'underline', fontWeight: 600 }}
          >
            Nu opnieuw inloggen
          </a>
        </span>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Sluiten"
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={16} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
