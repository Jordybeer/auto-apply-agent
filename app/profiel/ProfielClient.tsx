'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  User,
  MapPin,
  Tag,
  FileText,
  Save,
  CheckCircle2,
  AlertTriangle,
  Plus,
  X,
} from 'lucide-react';

interface ProfielData {
  full_name: string;
  city: string;
  keywords: string[];
  cv_text: string;
}

function MissingBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, color: 'var(--yellow)',
      background: 'rgba(245,158,11,0.12)', borderRadius: 99,
      padding: '2px 8px', marginLeft: 8,
    }}>
      <AlertTriangle size={10} /> ontbreekt
    </span>
  );
}

export default function ProfielClient() {
  const router = useRouter();
  const [data, setData]       = useState<ProfielData>({ full_name: '', city: '', keywords: [], cv_text: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [newKw, setNewKw]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/profiel');
      if (!res.ok) throw new Error('Ophalen mislukt');
      const json = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fout bij ophalen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profiel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Opslaan mislukt');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  }

  function addKeyword() {
    const kw = newKw.trim();
    if (!kw || data.keywords.includes(kw)) return;
    setData(d => ({ ...d, keywords: [...d.keywords, kw] }));
    setNewKw('');
  }

  function removeKeyword(kw: string) {
    setData(d => ({ ...d, keywords: d.keywords.filter(k => k !== kw) }));
  }

  const hasName     = !!data.full_name.trim();
  const hasCity     = !!data.city.trim();
  const hasKeywords = data.keywords.length > 0;
  const hasCv       = !!data.cv_text.trim();
  const isComplete  = hasName && hasCity && hasKeywords && hasCv;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--text)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 6,
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    borderRadius: 16,
    padding: '20px',
    marginBottom: 12,
    border: '1px solid var(--border)',
  };

  return (
    <main className="page-shell">
      <div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ marginBottom: 24 }}
        >
          <button
            onClick={() => router.back()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: 'var(--text2)', background: 'none',
              border: 'none', cursor: 'pointer', marginBottom: 14, padding: 0,
            }}
          >
            <ArrowLeft size={15} /> Terug
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <User size={18} style={{ color: 'var(--accent)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Mijn analyseprofiel
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
            Deze informatie gebruikt de analyse om te beoordelen hoe goed een vacature bij jou past.
          </p>
        </motion.div>

        {/* Volledigheids-indicator */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              ...cardStyle,
              background: isComplete ? 'rgba(34,197,94,0.07)' : 'rgba(245,158,11,0.07)',
              border: `1px solid ${isComplete ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            {isComplete
              ? <CheckCircle2 size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
              : <AlertTriangle size={16} style={{ color: 'var(--yellow)', flexShrink: 0 }} />}
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
              {isComplete
                ? 'Profiel is volledig — de analyse heeft alle info nodig.'
                : 'Profiel is onvolledig. Vul de ontbrekende velden in voor nauwkeurigere analyses.'}
            </p>
          </motion.div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)', fontSize: 14 }}>
            Laden&hellip;
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

            {/* Naam */}
            <div style={cardStyle}>
              <label style={labelStyle}>
                <User size={14} style={{ color: 'var(--accent)', marginRight: 6 }} />
                Naam
                {!hasName && <MissingBadge />}
              </label>
              <input
                type="text"
                placeholder="Jouw naam"
                value={data.full_name}
                onChange={e => setData(d => ({ ...d, full_name: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* Stad */}
            <div style={cardStyle}>
              <label style={labelStyle}>
                <MapPin size={14} style={{ color: 'var(--accent)', marginRight: 6 }} />
                Stad / locatie
                {!hasCity && <MissingBadge />}
              </label>
              <input
                type="text"
                placeholder="bv. Antwerpen"
                value={data.city}
                onChange={e => setData(d => ({ ...d, city: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* Zoekwoorden */}
            <div style={cardStyle}>
              <label style={labelStyle}>
                <Tag size={14} style={{ color: 'var(--accent)', marginRight: 6 }} />
                Zoekwoorden / functietitels
                {!hasKeywords && <MissingBadge />}
              </label>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 10px' }}>
                De functies of vaardigheden waarop de analyse jou beoordeelt.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {data.keywords.map(kw => (
                  <span key={kw} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: 99, padding: '4px 10px', fontSize: 12, fontWeight: 600,
                  }}>
                    {kw}
                    <button
                      onClick={() => removeKeyword(kw)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 0 }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Voeg zoekwoord toe"
                  value={newKw}
                  onChange={e => setNewKw(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={addKeyword}
                  disabled={!newKw.trim()}
                  style={{
                    background: newKw.trim() ? 'var(--accent)' : 'var(--surface2)',
                    color: newKw.trim() ? '#fff' : 'var(--text2)',
                    border: 'none', borderRadius: 10, padding: '0 14px',
                    fontSize: 14, fontWeight: 600, cursor: newKw.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', gap: 4, height: 40, flexShrink: 0,
                  }}
                >
                  <Plus size={14} /> Voeg toe
                </button>
              </div>
            </div>

            {/* CV tekst */}
            <div style={cardStyle}>
              <label style={labelStyle}>
                <FileText size={14} style={{ color: 'var(--accent)', marginRight: 6 }} />
                CV / profieltekst
                {!hasCv && <MissingBadge />}
              </label>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 10px' }}>
                Plak je CV of een beschrijving van je ervaring en vaardigheden. De AI leest dit om jou te matchen met vacatures.
              </p>
              <textarea
                placeholder="Plak hier je CV-tekst, werkervaring of een korte profielbeschrijving&hellip;"
                value={data.cv_text}
                onChange={e => setData(d => ({ ...d, cv_text: e.target.value }))}
                rows={12}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  minHeight: 200,
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
                {data.cv_text.length} tekens
                {data.cv_text.length > 3000 && (
                  <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>
                    (analyse gebruikt de eerste 3000 tekens)
                  </span>
                )}
              </p>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Save button */}
            <motion.button
              onClick={save}
              disabled={saving}
              whileTap={{ scale: 0.95 }}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: saved ? 'var(--green)' : 'var(--accent)',
                color: '#fff',
                border: 'none', borderRadius: 12,
                padding: '13px 20px',
                fontSize: 15, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.25s',
              }}
            >
              {saved
                ? <><CheckCircle2 size={16} /> Opgeslagen!</>
                : saving
                  ? 'Opslaan&hellip;'
                  : <><Save size={15} /> Profiel opslaan</>
              }
            </motion.button>

          </motion.div>
        )}
      </div>
    </main>
  );
}
