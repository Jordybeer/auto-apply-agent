'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'framer-motion';
import CityCombobox from '@/components/CityCombobox';
import ThemeToggle from '@/components/ThemeToggle';

const PAPERCLIP = String.fromCodePoint(0x1F4CE);
const PIN       = String.fromCodePoint(0x1F4CD);
const PAGE      = String.fromCodePoint(0x1F4C4);

const spring = { type: 'spring' as const, stiffness: 500, damping: 35 };

/** Thin wrapper that gives any button a spring tap feel */
function Tappable({ children, onClick, disabled, className, style }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={spring}
      className={className}
      style={style}
    >
      {children}
    </motion.button>
  );
}

function UsageBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct  = Math.min((value / max) * 100, 100);
  const warn = pct >= 80;
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: 'var(--surface2)' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ height: '100%', background: warn ? 'var(--red)' : color, borderRadius: 9999 }}
      />
    </div>
  );
}

function GroqSection({ initial }: { initial: string | null }) {
  const [key, setKey] = useState(initial);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const save = async () => {
    if (!input.trim()) return; setLoading(true);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groq_api_key: input.trim() }) });
    const d = await res.json(); setLoading(false);
    if (d.success) { setKey(`${input.slice(0, 6)}...${input.slice(-4)}`); setInput(''); flash('Opgeslagen'); }
  };
  const del = async () => {
    setLoading(true); await fetch('/api/settings?target=groq', { method: 'DELETE' });
    setLoading(false); setKey(null); flash('Verwijderd');
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Groq API Key</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>Voor AI-scoring &amp; motivatiebrieven. Gratis op{' '}
          <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline" style={{ color: '#7c3aed' }}>console.groq.com</a></p>
      </div>
      <AnimatePresence mode="wait">
        {key ? (
          <motion.div key="key" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'var(--surface2)' }}
          >
            <span className="font-mono text-xs" style={{ color: 'var(--text2)' }}>{key}</span>
            <Tappable onClick={del} disabled={loading} className="text-xs hover:opacity-80 disabled:opacity-40" style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Verwijder</Tappable>
          </motion.div>
        ) : (
          <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-xs italic" style={{ color: 'var(--text2)' }}
          >Geen key ingesteld</motion.p>
        )}
      </AnimatePresence>
      <div className="flex gap-2">
        <input type="password" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="Plak je Groq API key..." className="flex-1 text-sm px-3 py-2 rounded-xl outline-none font-mono"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <Tappable onClick={save} disabled={loading || !input.trim()} className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40" style={{ background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {loading ? '...' : 'Opslaan'}
        </Tappable>
      </div>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: msg === 'Verwijderd' ? 'var(--text2)' : 'var(--green)' }}>{msg}</motion.p>}
      </AnimatePresence>
    </motion.div>
  );
}

function AdzunaSection({ initial }: { initial: { id: string | null; key: string | null; today: number; month: number } }) {
  const [idVal, setIdVal] = useState(initial.id);
  const [keyVal, setKeyVal] = useState(initial.key);
  const [idInput, setIdInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const save = async () => {
    if (!idInput.trim() || !keyInput.trim()) return; setLoading(true);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adzuna_app_id: idInput.trim(), adzuna_app_key: keyInput.trim() }) });
    const d = await res.json(); setLoading(false);
    if (d.success) { setIdVal(`${idInput.slice(0, 4)}...${idInput.slice(-4)}`); setKeyVal(`${keyInput.slice(0, 4)}...${keyInput.slice(-4)}`); setIdInput(''); setKeyInput(''); flash('Opgeslagen'); }
  };
  const del = async () => {
    setLoading(true); await fetch('/api/settings?target=adzuna', { method: 'DELETE' });
    setLoading(false); setIdVal(null); setKeyVal(null); flash('Verwijderd');
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Adzuna API</p>
        <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>admin</span>
      </div>
      <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: 'var(--surface2)' }}>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between"><span className="text-xs" style={{ color: 'var(--text2)' }}>Vandaag</span><span className="text-xs font-mono" style={{ color: initial.today >= 200 ? 'var(--red)' : 'var(--text2)' }}>{initial.today} / 250</span></div>
          <UsageBar value={initial.today} max={250} color="#6366f1" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between"><span className="text-xs" style={{ color: 'var(--text2)' }}>Deze maand</span><span className="text-xs font-mono" style={{ color: initial.month >= 2000 ? 'var(--red)' : 'var(--text2)' }}>{initial.month} / 2500</span></div>
          <UsageBar value={initial.month} max={2500} color="#a78bfa" />
        </div>
      </div>
      <AnimatePresence mode="wait">
        {idVal && keyVal ? (
          <motion.div key="vals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>ID: {idVal}</span>
            <span className="font-mono text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>Key: {keyVal}</span>
            <Tappable onClick={del} disabled={loading} className="text-xs hover:opacity-80 disabled:opacity-40" style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>Verwijder</Tappable>
          </motion.div>
        ) : (
          <motion.p key="link" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: 'var(--text2)' }}>Gratis via{' '}<a href="https://developer.adzuna.com" target="_blank" rel="noreferrer" className="underline" style={{ color: '#6366f1' }}>developer.adzuna.com</a></motion.p>
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-2">
        <input type="text" value={idInput} onChange={e => setIdInput(e.target.value)} placeholder="App ID..."
          className="text-sm px-3 py-2 rounded-xl outline-none" style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <div className="flex gap-2">
          <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} placeholder="App Key..."
            className="flex-1 text-sm px-3 py-2 rounded-xl outline-none" style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <Tappable onClick={save} disabled={loading || !idInput.trim() || !keyInput.trim()} className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40" style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {loading ? '...' : 'Opslaan'}
          </Tappable>
        </div>
      </div>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: msg === 'Verwijderd' ? 'var(--text2)' : 'var(--green)' }}>{msg}</motion.p>}
      </AnimatePresence>
    </motion.div>
  );
}

function KeywordsSection({ initial }: { initial: string[] }) {
  const [keywords, setKeywords] = useState<string[]>(initial);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const persist = async (updated: string[]) => {
    setSaving(true);
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: updated }) });
    localStorage.setItem('ja_tags', JSON.stringify(updated)); setSaving(false);
  };
  const add = () => { const v = input.trim().toLowerCase(); if (!v || keywords.includes(v)) { setInput(''); return; } const next = [...keywords, v]; setKeywords(next); setInput(''); persist(next); };
  const remove = (kw: string) => { const next = keywords.filter(k => k !== kw); setKeywords(next); persist(next); };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Zoekwoorden</p>
      <div className="flex flex-wrap gap-2 min-h-[28px]">
        <AnimatePresence>
          {keywords.length > 0 ? keywords.map(kw => (
            <motion.span key={kw}
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={spring}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              {kw}
              <motion.button
                onClick={() => remove(kw)}
                whileTap={{ scale: 0.8 }}
                transition={spring}
                className="ml-1"
                style={{ color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
              >×</motion.button>
            </motion.span>
          )) : <p className="text-xs italic" style={{ color: 'var(--text2)' }}>Gebruikt standaard zoekwoorden</p>}
        </AnimatePresence>
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Voeg zoekwoord toe..." className="flex-1 text-sm px-3 py-2 rounded-xl outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <Tappable onClick={add} disabled={!input.trim() || saving} className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>+</Tappable>
      </div>
    </motion.div>
  );
}

function LocationSection({ initial }: { initial: { city: string; radius: number } }) {
  const [city, setCity] = useState(initial.city || 'Antwerpen');
  const [radius, setRadius] = useState(initial.radius || 30);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    setLoading(true);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, radius }) });
    const d = await res.json(); setLoading(false);
    if (d.success) { setMsg('Opgeslagen'); setTimeout(() => setMsg(''), 2500); }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{PIN} Locatie</p>
      <CityCombobox value={city} onChange={setCity} />
      <div className="flex items-center gap-2">
        <input type="number" value={radius} min={5} max={100} onChange={e => setRadius(Number(e.target.value))}
          className="w-16 text-sm px-3 py-2 rounded-xl outline-none text-center"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <span className="text-xs flex-1" style={{ color: 'var(--text2)' }}>km straal</span>
        <Tappable onClick={save} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ background: 'var(--btn-ghost)', border: '1px solid var(--border)', color: 'var(--btn-ghost-text)', cursor: 'pointer' }}>
          {loading ? '...' : 'Opslaan'}
        </Tappable>
      </div>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: 'var(--green)' }}>{msg}</motion.p>}
      </AnimatePresence>
    </motion.div>
  );
}

function AutoApplySection({ initial }: { initial: number | null }) {
  const [threshold, setThreshold] = useState<number>(initial ?? 0);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const enabled = threshold > 0;

  const save = async (val: number) => {
    setLoading(true);
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto_apply_threshold: val }) });
    const d = await res.json(); setLoading(false);
    if (d.success) { setMsg('Opgeslagen'); setTimeout(() => setMsg(''), 2000); }
  };

  const toggle = () => { const next = enabled ? 0 : 75; setThreshold(next); save(next); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: `1px solid ${enabled ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`, transition: 'border-color 0.2s' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>⚡ Auto-apply</p>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>Sla de modal over voor jobs boven de drempel.</p>
        </div>
        {/* Toggle */}
        <motion.button
          onClick={toggle}
          disabled={loading}
          whileTap={{ scale: 0.9 }}
          transition={spring}
          className="w-11 h-6 rounded-full relative flex-shrink-0 disabled:opacity-40"
          style={{ background: enabled ? 'var(--green)' : 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer' }}
          animate={{ background: enabled ? 'var(--green)' : 'var(--surface2)' } as any}
        >
          <motion.span
            layout
            transition={spring}
            className="absolute top-0.5 w-5 h-5 rounded-full"
            style={{ background: '#fff', left: enabled ? 'calc(100% - 1.375rem)' : '0.125rem' }}
          />
        </motion.button>
      </div>
      <AnimatePresence>
        {enabled && (
          <motion.div
            key="slider"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text2)' }}>Drempel: <span className="font-bold tabular-nums" style={{ color: 'var(--green)' }}>{threshold}%</span></span>
            </div>
            <input type="range" min={50} max={95} step={5} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              onMouseUp={e => save(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={e => save(Number((e.target as HTMLInputElement).value))}
              className="w-full accent-green-400" />
            <div className="flex justify-between text-xs" style={{ color: 'var(--text2)' }}><span>50%</span><span>95%</span></div>
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(110,231,183,0.08)', color: 'var(--green)', border: '1px solid rgba(110,231,183,0.2)' }}>
              Jobs met ≥{threshold}% match worden automatisch gesolliciteerd zonder modal.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: 'var(--green)' }}>{msg}</motion.p>}
      </AnimatePresence>
    </motion.div>
  );
}

function CvSection() {
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { fetch('/api/cv').then(r => r.json()).then(d => setCvUrl(d.url ?? null)); }, []);
  const upload = async (file: File) => {
    const ok = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!ok) { setMsg('Alleen PDF'); return; }
    setLoading(true); setMsg('');
    const form = new FormData(); form.append('cv', file);
    const res = await fetch('/api/cv', { method: 'POST', body: form });
    const d = await res.json(); setLoading(false);
    if (d.success) { setMsg('CV opgeslagen'); const r = await fetch('/api/cv'); const d2 = await r.json(); setCvUrl(d2.url ?? null); }
    else setMsg(d.error || 'Upload mislukt');
    setTimeout(() => setMsg(''), 3000);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{PAPERCLIP} CV</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>Alleen PDF, max 5MB.</p>
      </div>
      <AnimatePresence mode="wait">
        {cvUrl ? (
          <motion.div key="cv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'var(--surface2)' }}
          >
            <span className="text-xs" style={{ color: 'var(--green)' }}>CV opgeslagen</span>
            <div className="flex gap-3">
              <a href={cvUrl} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: 'var(--accent)' }}>Bekijk</a>
              <Tappable onClick={() => fileRef.current?.click()} disabled={loading} className="text-xs disabled:opacity-40" style={{ color: 'var(--yellow)', background: 'none', border: 'none', cursor: 'pointer' }}>{loading ? '...' : 'Vervang'}</Tappable>
            </div>
          </motion.div>
        ) : (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => fileRef.current?.click()}
            transition={spring}
            className="flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-xl">{PAGE}</span>
            <p className="text-xs" style={{ color: 'var(--text2)' }}>Klik om CV te uploaden (PDF)</p>
          </motion.div>
        )}
      </AnimatePresence>
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: msg.includes('mislukt') || msg === 'Alleen PDF' ? 'var(--red)' : 'var(--green)' }}>{msg}</motion.p>}
      </AnimatePresence>
    </motion.div>
  );
}

function DangerSection() {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const deleteAll = async () => {
    setLoading(true); await fetch('/api/settings?target=jobs', { method: 'DELETE' });
    setLoading(false); setDone(true); setConfirm(false); setTimeout(() => setDone(false), 3000);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid rgba(248,113,113,0.2)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>Gevaarzone</p>
      <p className="text-xs" style={{ color: 'var(--text2)' }}>Verwijdert alle vacatures en sollicitaties permanent.</p>
      <AnimatePresence>
        {done && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs" style={{ color: 'var(--green)' }}>Verwijderd.</motion.p>}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {!confirm ? (
          <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Tappable onClick={() => setConfirm(true)} className="w-full text-sm font-medium py-2 rounded-xl"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', cursor: 'pointer' }}>Verwijder alle vacatures</Tappable>
          </motion.div>
        ) : (
          <motion.div key="confirm" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring} className="flex gap-2">
            <Tappable onClick={() => setConfirm(false)} className="flex-1 text-sm py-2 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>Annuleer</Tappable>
            <Tappable onClick={deleteAll} disabled={loading} className="flex-1 text-sm py-2 rounded-xl font-medium disabled:opacity-40" style={{ background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer' }}>{loading ? '...' : 'Ja, verwijder'}</Tappable>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function SettingsMenu() {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  type Data = {
    is_admin: boolean; groq_api_key: string | null;
    adzuna_app_id: string | null; adzuna_app_key: string | null;
    adzuna_calls_today: number; adzuna_calls_month: number;
    keywords: string[]; city: string; radius: number;
    auto_apply_threshold: number | null;
    last_scrape_at: string | null; user: { email: string; avatar_url: string | null };
  };
  const [data, setData] = useState<Data | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => { setData(d); if (d.keywords?.length) localStorage.setItem('ja_tags', JSON.stringify(d.keywords)); });
  }, []);
  const logout = async () => { setLoggingOut(true); await supabase.auth.signOut(); window.location.href = '/login'; };

  if (!data) return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex items-center justify-center py-12"
    >
      <span style={{ color: 'var(--text2)' }}>Laden...</span>
    </motion.div>
  );

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
      className="flex flex-col gap-3"
    >
      {/* Profile + logout */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between gap-3 rounded-2xl p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {data.user?.avatar_url
            ? <img src={data.user.avatar_url} className="w-9 h-9 rounded-full ring-2 ring-white/10 flex-shrink-0" alt="" />
            : <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)' }}>{data.user?.email?.[0]?.toUpperCase() ?? '?'}</div>}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{data.user?.email}</p>
            <p className="text-xs" style={{ color: 'var(--text2)' }}>{data.last_scrape_at ? `Laatste scrape: ${new Date(data.last_scrape_at).toLocaleString('nl-BE')}` : 'Nog niet gescrapet'}</p>
          </div>
        </div>
        <Tappable onClick={logout} disabled={loggingOut} className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: 'var(--surface2)', color: 'var(--red)', border: '1px solid var(--border)', cursor: 'pointer' }}>
          {loggingOut ? '...' : 'Uitloggen'}
        </Tappable>
      </motion.div>

      {/* Theme toggle */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between rounded-2xl px-4 py-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Weergave</span>
        <ThemeToggle />
      </motion.div>

      {data.is_admin && <AdzunaSection initial={{ id: data.adzuna_app_id, key: data.adzuna_app_key, today: data.adzuna_calls_today ?? 0, month: data.adzuna_calls_month ?? 0 }} />}
      <GroqSection initial={data.groq_api_key} />
      <AutoApplySection initial={data.auto_apply_threshold ?? null} />
      <KeywordsSection initial={data.keywords ?? []} />
      <LocationSection initial={{ city: data.city, radius: data.radius }} />
      <CvSection />
      <DangerSection />
    </motion.div>
  );
}
