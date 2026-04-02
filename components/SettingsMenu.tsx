'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { motion, AnimatePresence } from 'framer-motion';
import CityCombobox from '@/components/CityCombobox';
import ThemeToggle from '@/components/ThemeToggle';

const PAPERCLIP = String.fromCodePoint(0x1F4CE);
const PIN       = String.fromCodePoint(0x1F4CD);
const PAGE      = String.fromCodePoint(0x1F4C4);

const spring = { type: 'spring' as const, stiffness: 500, damping: 35 };

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

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card flex flex-col gap-3 rounded-2xl p-4"
    >
      {children}
    </motion.div>
  );
}

const inputClass = 'glass-input flex-1 text-sm px-3 py-2 rounded-xl outline-none';

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
    <SectionCard>
      <div>
        <p className="text-sm font-semibold text-primary">Groq API Key</p>
        <p className="text-xs text-secondary">Voor AI-scoring &amp; motivatiebrieven. Gratis op{' '}
          <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline text-accent">console.groq.com</a></p>
      </div>
      <AnimatePresence mode="wait">
        {key ? (
          <motion.div key="key" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass-inset flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
          >
            <span className="font-mono text-xs text-secondary">{key}</span>
            <Tappable onClick={del} disabled={loading}
              className="text-xs text-red hover:opacity-80 disabled:opacity-40"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Verwijder</Tappable>
          </motion.div>
        ) : (
          <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-xs italic text-secondary"
          >Geen key ingesteld</motion.p>
        )}
      </AnimatePresence>
      <div className="flex gap-2">
        <input type="password" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="Plak je Groq API key..." className={`${inputClass} font-mono`} />
        <Tappable onClick={save} disabled={loading || !input.trim()}
          className="glass-btn-accent px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ border: 'none', cursor: 'pointer' }}>
          {loading ? '...' : 'Opslaan'}
        </Tappable>
      </div>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`text-xs ${msg === 'Verwijderd' ? 'text-secondary' : 'text-green'}`}>{msg}</motion.p>}
      </AnimatePresence>
    </SectionCard>
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
    <SectionCard>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-primary">Adzuna API</p>
        <span className="badge-accent text-xs px-1.5 py-0.5 rounded font-mono">admin</span>
      </div>
      <div className="glass-inset rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-xs text-secondary">Vandaag</span>
            <span className={`text-xs font-mono ${initial.today >= 200 ? 'text-red' : 'text-secondary'}`}>{initial.today} / 250</span>
          </div>
          <UsageBar value={initial.today} max={250} color="var(--accent)" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-xs text-secondary">Deze maand</span>
            <span className={`text-xs font-mono ${initial.month >= 2000 ? 'text-red' : 'text-secondary'}`}>{initial.month} / 2500</span>
          </div>
          <UsageBar value={initial.month} max={2500} color="var(--purple)" />
        </div>
      </div>
      <AnimatePresence mode="wait">
        {idVal && keyVal ? (
          <motion.div key="vals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 flex-wrap">
            <span className="glass-inset font-mono text-xs px-2 py-1 rounded-lg text-secondary">ID: {idVal}</span>
            <span className="glass-inset font-mono text-xs px-2 py-1 rounded-lg text-secondary">Key: {keyVal}</span>
            <Tappable onClick={del} disabled={loading}
              className="text-xs text-red hover:opacity-80 disabled:opacity-40"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Verwijder</Tappable>
          </motion.div>
        ) : (
          <motion.p key="link" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-secondary">Gratis via{' '}
            <a href="https://developer.adzuna.com" target="_blank" rel="noreferrer" className="underline text-accent">developer.adzuna.com</a>
          </motion.p>
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-2">
        <input type="text" value={idInput} onChange={e => setIdInput(e.target.value)} placeholder="App ID..."
          className={inputClass} />
        <div className="flex gap-2">
          <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} placeholder="App Key..."
            className={inputClass} />
          <Tappable onClick={save} disabled={loading || !idInput.trim() || !keyInput.trim()}
            className="glass-btn-accent px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
            style={{ border: 'none', cursor: 'pointer' }}>
            {loading ? '...' : 'Opslaan'}
          </Tappable>
        </div>
      </div>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`text-xs ${msg === 'Verwijderd' ? 'text-secondary' : 'text-green'}`}>{msg}</motion.p>}
      </AnimatePresence>
    </SectionCard>
  );
}

function KeywordsSection({ initial }: { initial: string[] }) {
  const [keywords, setKeywords] = useState<string[]>(initial);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const persist = async (updated: string[]) => {
    setSaving(true);
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: updated }) });
    try { localStorage.setItem('ja_tags', JSON.stringify(updated)); } catch {}
    setSaving(false);
  };
  const add = () => { const v = input.trim().toLowerCase(); if (!v || keywords.includes(v)) { setInput(''); return; } const next = [...keywords, v]; setKeywords(next); setInput(''); persist(next); };
  const remove = (kw: string) => { const next = keywords.filter(k => k !== kw); setKeywords(next); persist(next); };
  return (
    <SectionCard>
      <p className="text-sm font-semibold text-primary">Zoekwoorden</p>
      <div className="flex flex-wrap gap-2 min-h-[28px]">
        <AnimatePresence>
          {keywords.length > 0 ? keywords.map(kw => (
            <motion.span key={kw}
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={spring}
              className="glass-inset flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-secondary"
            >
              {kw}
              <motion.button
                onClick={() => remove(kw)}
                whileTap={{ scale: 0.8 }}
                transition={spring}
                className="ml-1 text-secondary"
                style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}
              >×</motion.button>
            </motion.span>
          )) : <p className="text-xs italic text-secondary">Gebruikt standaard zoekwoorden</p>}
        </AnimatePresence>
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Voeg zoekwoord toe..." className={inputClass} />
        <Tappable onClick={add} disabled={!input.trim() || saving}
          className="glass-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ cursor: 'pointer' }}>+</Tappable>
      </div>
    </SectionCard>
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
    <SectionCard>
      <p className="text-sm font-semibold text-primary">{PIN} Locatie</p>
      <CityCombobox value={city} onChange={setCity} />
      <div className="flex items-center gap-2">
        <input type="number" value={radius} min={5} max={100} onChange={e => setRadius(Number(e.target.value))}
          className="glass-input w-16 text-sm px-3 py-2 rounded-xl outline-none text-center" />
        <span className="text-xs flex-1 text-secondary">km straal</span>
        <Tappable onClick={save} disabled={loading}
          className="glass-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ cursor: 'pointer' }}>
          {loading ? '...' : 'Opslaan'}
        </Tappable>
      </div>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs text-green">{msg}</motion.p>}
      </AnimatePresence>
    </SectionCard>
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
      className="glass-card flex flex-col gap-3 rounded-2xl p-4"
      style={{ borderColor: enabled ? 'rgba(52,211,153,0.30)' : undefined, transition: 'border-color 0.2s' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">⚡ Auto-apply</p>
          <p className="text-xs text-secondary">Sla de modal over voor jobs boven de drempel.</p>
        </div>
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
              <span className="text-xs text-secondary">Drempel: <span className="font-bold tabular-nums text-green">{threshold}%</span></span>
            </div>
            <input type="range" min={50} max={95} step={5} value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              onMouseUp={e => save(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={e => save(Number((e.target as HTMLInputElement).value))}
              className="w-full accent-[var(--green)]" />
            <div className="flex justify-between text-xs text-secondary"><span>50%</span><span>95%</span></div>
            <p className="text-xs px-3 py-2 rounded-xl badge-green">
              Jobs met ≥{threshold}% match worden automatisch gesolliciteerd zonder modal.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs text-green">{msg}</motion.p>}
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
    <SectionCard>
      <div>
        <p className="text-sm font-semibold text-primary">{PAPERCLIP} CV</p>
        <p className="text-xs text-secondary">Alleen PDF, max 5MB.</p>
      </div>
      <AnimatePresence mode="wait">
        {cvUrl ? (
          <motion.div key="cv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="glass-inset flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
          >
            <span className="text-xs text-green">CV opgeslagen</span>
            <div className="flex gap-3">
              <a href={cvUrl} target="_blank" rel="noreferrer" className="text-xs underline text-accent">Bekijk</a>
              <Tappable onClick={() => fileRef.current?.click()} disabled={loading}
                className="text-xs text-yellow disabled:opacity-40"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{loading ? '...' : 'Vervang'}</Tappable>
            </div>
          </motion.div>
        ) : (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => fileRef.current?.click()}
            transition={spring}
            className="glass-inset flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-xl">{PAGE}</span>
            <p className="text-xs text-secondary">Klik om CV te uploaden (PDF)</p>
          </motion.div>
        )}
      </AnimatePresence>
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <AnimatePresence>
        {msg && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`text-xs ${msg.includes('mislukt') || msg === 'Alleen PDF' ? 'text-red' : 'text-green'}`}>{msg}</motion.p>}
      </AnimatePresence>
    </SectionCard>
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
      className="glass-card flex flex-col gap-3 rounded-2xl p-4"
      style={{ borderColor: 'rgba(251,113,133,0.20)' }}
    >
      <p className="text-sm font-semibold text-red">Gevaarzone</p>
      <p className="text-xs text-secondary">Verwijdert alle vacatures en sollicitaties permanent.</p>
      <AnimatePresence>
        {done && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-green">Verwijderd.</motion.p>}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {!confirm ? (
          <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Tappable onClick={() => setConfirm(true)} className="w-full text-sm font-medium py-2 rounded-xl badge-red"
              style={{ cursor: 'pointer' }}>Verwijder alle vacatures</Tappable>
          </motion.div>
        ) : (
          <motion.div key="confirm" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring} className="flex gap-2">
            <Tappable onClick={() => setConfirm(false)} className="flex-1 text-sm py-2 rounded-xl glass-btn" style={{ cursor: 'pointer' }}>Annuleer</Tappable>
            <Tappable onClick={deleteAll} disabled={loading} className="flex-1 text-sm py-2 rounded-xl font-medium disabled:opacity-40 text-white" style={{ background: 'var(--red)', border: 'none', cursor: 'pointer' }}>{loading ? '...' : 'Ja, verwijder'}</Tappable>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function SettingsMenu() {
  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  );

  type Data = {
    is_admin: boolean; groq_api_key: string | null;
    adzuna_app_id: string | null; adzuna_app_key: string | null;
    adzuna_calls_today: number; adzuna_calls_month: number;
    keywords: string[]; city: string; radius: number;
    auto_apply_threshold: number | null;
    last_scrape_at: string | null;
  };
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        setData(d);
        if (d.keywords?.length) {
          try { localStorage.setItem('ja_tags', JSON.stringify(d.keywords)); } catch {}
        }
      });
  }, []);

  if (!data) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-8">
      <span className="text-secondary text-sm">Laden...</span>
    </motion.div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Theme toggle */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card flex items-center justify-between rounded-2xl px-4 py-3"
      >
        <span className="text-sm font-medium text-primary">Weergave</span>
        <ThemeToggle />
      </motion.div>

      {data.is_admin && <AdzunaSection initial={{ id: data.adzuna_app_id, key: data.adzuna_app_key, today: data.adzuna_calls_today ?? 0, month: data.adzuna_calls_month ?? 0 }} />}
      <GroqSection initial={data.groq_api_key} />
      <AutoApplySection initial={data.auto_apply_threshold ?? null} />
      <KeywordsSection initial={data.keywords ?? []} />
      <LocationSection initial={{ city: data.city, radius: data.radius }} />
      <CvSection />
      <DangerSection />
    </div>
  );
}
