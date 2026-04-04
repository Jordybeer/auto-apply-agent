'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Mail, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function GmailBanner() {
  const [show, setShow]           = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Prevent re-firing the Supabase check on every navigation re-mount
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (user.app_metadata?.provider !== 'google') return;

      const { data } = await supabase
        .from('user_settings')
        .select('gmail_refresh_token')
        .eq('user_id', user.id)
        .single();

      if (!data?.gmail_refresh_token) setShow(true);
    }

    check();
  }, []);

  return (
    <AnimatePresence>
      {show && !dismissed && (
        <motion.div
          key="gmail-banner"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position:   'fixed',
            top:        0,
            left:       0,
            right:      0,
            zIndex:     200,
            // Invisible spacer for Dynamic Island / status bar
            paddingTop: 'env(safe-area-inset-top, 0px)',
            background: 'var(--accent-dim)',
            backdropFilter:       'saturate(180%) blur(24px)',
            WebkitBackdropFilter: 'saturate(180%) blur(24px)',
            borderBottom: '1px solid rgba(129,140,248,0.22)',
          }}
        >
          {/* Actual content row — padded separately from the safe-area spacer */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            gap:            8,
            padding:        '9px 16px 9px max(16px, env(safe-area-inset-left, 0px))',
            fontSize:       13,
            fontWeight:     500,
            color:          'var(--accent-bright)',
          }}>
            <Mail size={14} strokeWidth={2.25} style={{ flexShrink: 0 }} />

            <span style={{ flex: 1, lineHeight: 1.4 }}>
              Log opnieuw in om e-mails te versturen via Gmail.{' '}
              <a
                href="/login"
                style={{
                  color:          'var(--accent-bright)',
                  textDecoration: 'underline',
                  fontWeight:     650,
                }}
              >
                Nu inloggen
              </a>
            </span>

            <button
              onClick={() => setDismissed(true)}
              aria-label="Sluiten"
              style={{
                flexShrink:     0,
                width:          24,
                height:         24,
                borderRadius:   '50%',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                background:     'rgba(129,140,248,0.14)',
                border:         '1px solid rgba(129,140,248,0.20)',
                color:          'var(--accent-bright)',
                cursor:         'pointer',
              }}
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
