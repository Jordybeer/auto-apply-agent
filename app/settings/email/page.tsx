'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Loader2, CheckCircle2, Send } from 'lucide-react';

const CARD = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

export default function EmailSettingsPage() {
  const router = useRouter();

  const [fullName, setFullName]       = useState('');
  const [signature, setSignature]     = useState('');
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState<'ok' | 'error' | null>(null);
  const [testError, setTestError]     = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
  }, []);

  useEffect(() => {
    fetch('/api/settings/email')
      .then(r => {
        if (!r.ok) throw new Error(`Fout bij laden (${r.status})`);
        return r.json();
      })
      .then(d => {
        setFullName(d.full_name ?? '');
        setSignature(d.email_signature ?? '');
      })
      .catch(e => setLoadError(e.message ?? 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const r = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email_signature: signature }),
      });
      const d = await r.json();
      if (!r.ok) { setSaveError(d.error ?? 'Fout bij opslaan'); return; }
      setSaved(true);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError('Netwerk fout');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const r = await fetch('/api/settings/email/test', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setTestResult('error'); setTestError(d.error ?? 'Fout'); return; }
      setTestResult('ok');
    } catch {
      setTestResult('error');
      setTestError('Netwerk fout');
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="page-shell flex flex-col gap-5" style={{ position: 'relative', zIndex: 1 }}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="glass-btn flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
          style={{ cursor: 'pointer', border: '1px solid var(--border)' }}
          aria-label="Terug"
        >
          <ArrowLeft size={16} style={{ color: 'var(--text)' }} />
        </button>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
          E-mailinstellingen
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : loadError ? (
        <p className="text-sm px-1" style={{ color: 'var(--red)' }}>{loadError}</p>
      ) : (
        <>
          {/* Full name */}
          <motion.div {...CARD} className="glass-card flex flex-col gap-3 rounded-2xl px-4 py-4">
            <div className="flex items-center gap-2">
              <Mail size={15} style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Volledige naam</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text2)' }}>
              Verschijnt als afzendernaam in sollicitatiemails.
            </p>
            <input
              type="text"
              value={fullName}
              onChange={e => { setFullName(e.target.value); setTestResult(null); }}
              placeholder="Jan Peeters"
              maxLength={200}
              className="glass-input w-full rounded-xl px-3 py-2 text-sm"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </motion.div>

          {/* Signature */}
          <motion.div {...CARD} className="glass-card flex flex-col gap-3 rounded-2xl px-4 py-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>E-mailhandtekening</p>
            <p className="text-xs" style={{ color: 'var(--text2)' }}>
              Wordt automatisch onder elke sollicitatiemail toegevoegd.
            </p>
            <textarea
              value={signature}
              onChange={e => { setSignature(e.target.value); setTestResult(null); }}
              placeholder={'Met vriendelijke groeten,\nJan Peeters\n+32 499 00 00 00'}
              maxLength={1000}
              rows={5}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                outline: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.5',
              }}
            />
            <p className="text-xs text-right" style={{ color: 'var(--text3)' }}>
              {signature.length}/1000
            </p>
          </motion.div>

          {/* Save */}
          {saveError && (
            <p className="text-xs px-1" style={{ color: 'var(--red)' }}>{saveError}</p>
          )}
          <motion.button
            onClick={save}
            disabled={saving}
            whileTap={{ scale: 0.97 }}
            className="glass-btn flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"
            style={{
              background: saved ? 'var(--green-dim)' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : saved ? (
              <><CheckCircle2 size={16} /> Opgeslagen</>
            ) : (
              'Opslaan'
            )}
          </motion.button>

          {/* Test email */}
          <motion.div {...CARD} className="glass-card flex flex-col gap-3 rounded-2xl px-4 py-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Test e-mail</p>
            <p className="text-xs" style={{ color: 'var(--text2)' }}>
              Stuurt een testbericht naar je eigen e-mailadres om de configuratie te controleren.
            </p>
            {testResult === 'ok' && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--green)' }}>
                <CheckCircle2 size={13} /> Test verstuurd — controleer je inbox.
              </p>
            )}
            {testResult === 'error' && (
              <p className="text-xs" style={{ color: 'var(--red)' }}>{testError}</p>
            )}
            <motion.button
              onClick={sendTest}
              disabled={testing}
              whileTap={{ scale: 0.97 }}
              className="glass-btn flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ cursor: 'pointer', border: '1px solid var(--border)' }}
            >
              {testing ? <Loader2 size={15} className="animate-spin" /> : <><Send size={14} /> Stuur testmail</>}
            </motion.button>
          </motion.div>
        </>
      )}
    </main>
  );
}
