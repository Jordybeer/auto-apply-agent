'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Mail, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/env';

const SESSION_KEY = 'ja_gmail_banner_dismissed';

/**
 * Module-level flag so the banner stays dismissed across React re-mounts
 * within the same page session, even if sessionStorage is blocked
 * (privacy mode, Vercel preview sandboxing, etc.).
 */
let _dismissed = false;

export default function GmailBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    // In-memory flag wins; sessionStorage is a best-effort persistence layer.
    if (_dismissed) return true;
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  });
  const checked = useRef(false);

  useEffect(() => {
    if (dismissed) return;
    if (checked.current) return;
    checked.current = true;

    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  }, [dismissed]);

  const dismiss = () => {
    _dismissed = true;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
    setDismissed(true);
  };

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
            paddingTop: 'env(safe-area-inset-top, 0px)',
            background: 'var(--accent-dim)',
            backdropFilter:       'saturate(180%) blur(24px)',
            WebkitBackdropFilter: 'saturate(180%) blur(24px)',
            borderBottom: '1px solid rgba(129,140,248,0.22)',
          }}
        >
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
              onClick={dismiss}
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
