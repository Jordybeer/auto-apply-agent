'use client';

import { useEffect, useState, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, PenLine } from 'lucide-react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/env';

const EASE = [0.16, 1, 0.3, 1] as const;

export default function SettingsMenu() {
  const supabase = useMemo(
    () => createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY),
    []
  );

  const [signature, setSignature]   = useState('');
  const [saved, setSaved]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [open, setOpen]             = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: settings } = await supabase
        .from('user_settings')
        .select('email_signature')
        .eq('user_id', data.user.id)
        .single();
      setSignature(settings?.email_signature ?? '');
      setLoading(false);
    });
  }, [supabase]);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('user_settings')
      .upsert(
        { user_id: user.id, email_signature: signature || null },
        { onConflict: 'user_id', ignoreDuplicates: false },
      );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Signature card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        {/* Header row */}
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between gap-3 p-4"
          style={{ cursor: 'pointer' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
            >
              <PenLine size={16} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>E-mailhandtekening</p>
              <p className="text-xs" style={{ color: 'var(--text2)' }}>
                {signature ? `${signature.slice(0, 40)}${signature.length > 40 ? '…' : ''}` : 'Nog niet ingesteld'}
              </p>
            </div>
          </div>
          <motion.div
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ color: 'var(--text3)' }}
          >
            <ChevronRight size={16} />
          </motion.div>
        </button>

        {/* Expandable editor */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="sig-editor"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div
                className="flex flex-col gap-3 px-4 pb-4"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <p className="text-xs pt-3" style={{ color: 'var(--text2)' }}>
                  Wordt toegevoegd na een witregel onder je sollicitatiebrief.
                </p>
                <textarea
                  value={signature}
                  onChange={e => setSignature(e.target.value)}
                  disabled={loading}
                  placeholder={'Met vriendelijke groeten,\nJan Peeters\njob@email.com'}
                  rows={4}
                  className="w-full rounded-xl p-3 text-sm resize-none"
                  style={{
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
                <motion.button
                  onClick={save}
                  disabled={saving || loading}
                  whileTap={{ scale: 0.95 }}
                  className="self-end flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-40"
                  style={{
                    background: saved ? 'var(--green-muted, #d1fae5)' : 'var(--accent)',
                    color: saved ? 'var(--green, #065f46)' : '#fff',
                    transition: 'background 0.2s, color 0.2s',
                    cursor: 'pointer',
                  }}
                >
                  {saved ? <><Check size={14} /> Opgeslagen</> : saving ? 'Opslaan…' : 'Opslaan'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
