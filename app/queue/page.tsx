"use client";

import { useEffect, useRef, useState } from 'react';
import SwipeCard from '@/components/SwipeCard';
import Lottie from 'lottie-react';
import loaderDots from '@/app/lotties/loader-dots.json';
import sparklesData from '@/app/lotties/sparkles.json';
import Link from 'next/link';
import { SOURCE_COLOR_FLAT as SOURCE_COLORS } from '@/lib/constants';
import { Copy, Check, X, FileText, Send, AlertTriangle, PlusCircle, Sparkles, Download, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';

const BOOKMARK   = String.fromCodePoint(0x1F516);
const CLIPBOARD  = String.fromCodePoint(0x1F4CB);
const ROBOT      = String.fromCodePoint(0x1F916);
const CHECK_DONE = '\u2713';

const APPLIED_STATUSES = [
  { key: 'in_progress', label: 'In behandeling', label_en: 'In progress', icon: '\u2705', color: '#22c55e', blur: false },
  { key: 'applied',     label: 'Verstuurd',       label_en: 'Pending',     icon: '\u2b50', color: '#f97316', blur: false },
  { key: 'rejected',    label: 'Afgewezen',       label_en: 'Denied',      icon: '\u274c', color: '#ef4444', blur: true  },
] as const;
type AppliedStatus = typeof APPLIED_STATUSES[number]['key'];

const STATUS_SORT_ORDER: Record<string, number> = {
  in_progress: 0,
  applied:     1,
  rejected:    2,
};

function sortApplied(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const sa = STATUS_SORT_ORDER[a.status] ?? 1;
    const sb = STATUS_SORT_ORDER[b.status] ?? 1;
    if (sa !== sb) return sa - sb;
    const ta = a.status_changed_at ?? a.applied_at ?? '';
    const tb = b.status_changed_at ?? b.applied_at ?? '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
}

function sortByScore(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const sa = typeof a.match_score === 'number' ? a.match_score : -1;
    const sb = typeof b.match_score === 'number' ? b.match_score : -1;
    return sb - sa;
  });
}

function appliedStatusConfig(status: string) {
  return APPLIED_STATUSES.find((s) => s.key === status) ?? APPLIED_STATUSES[1];
}

function exportToPdf(applied: any[]) {
  const statusLabel: Record<string, string> = {
    in_progress: 'In behandeling',
    applied:     'Verstuurd',
    rejected:    'Afgewezen',
  };
  const rows = applied.map((a) => {
    const job   = a.jobs ?? {};
    const date  = a.applied_at ? new Date(a.applied_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014';
    const score = typeof a.match_score === 'number' && a.match_score > 0 ? `${a.match_score}%` : '\u2014';
    const st    = statusLabel[a.status] ?? a.status ?? '\u2014';
    return `
      <tr>
        <td>${job.title ?? '\u2014'}</td>
        <td>${job.company ?? '\u2014'}</td>
        <td>${date}</td>
        <td>${score}</td>
        <td>${st}</td>
        <td style="max-width:260px;font-size:11px;color:#555;white-space:pre-line">${a.cover_letter_draft ? a.cover_letter_draft.slice(0, 300) + (a.cover_letter_draft.length > 300 ? '\u2026' : '') : '\u2014'}</td>
      </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sollicitaties export</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:32px;color:#111}
    h1{font-size:22px;margin-bottom:4px}
    p.sub{color:#888;font-size:13px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f4f4f4;text-align:left;padding:8px 10px;border-bottom:2px solid #ddd;font-weight:600}
    td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
    tr:nth-child(even) td{background:#fafafa}
  </style></head><body>
  <h1>Gesolliciteerde vacatures</h1>
  <p class="sub">Ge\u00ebxporteerd op ${new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })} &mdash; ${applied.length} sollicitatie${applied.length !== 1 ? 's' : ''}</p>
  <table>
    <thead><tr><th>Functie</th><th>Bedrijf</th><th>Datum</th><th>Match</th><th>Status</th><th>Motivatiebrief (preview)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=()=>{window.print();};<\/script>
  <\/body><\/html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function CircleProgress({ done, total }: { done: number; total: number }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const dash = circ * pct;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ flexShrink: 0 }}>
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
      <circle cx="14" cy="14" r={r} fill="none"
        stroke="var(--green)" strokeWidth="2.5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
        style={{ transition: 'stroke-dasharray 0.35s ease' }} />
      <text x="14" y="18" textAnchor="middle" fontSize="7" fontWeight="700"
        fill="var(--text2)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {done}
      </text>
    </svg>
  );
}

function RefreshAllButton({
  list, onUpdate, onDone,
}: {
  list: any[];
  onUpdate: (id: string, score: number, reasoning: string) => void;
  onDone?: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const total = list.length;
  const abortRef = useRef(false);

  const handleStart = async () => {
    if (running || total === 0) return;
    abortRef.current = false;
    setRunning(true);
    setDone(0);
    for (const app of list) {
      if (abortRef.current) break;
      try {
        const res = await fetch('/api/rematch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: app.id }),
        });
        if (res.ok) {
          const json = await res.json();
          onUpdate(app.id, json.match_score, json.reasoning);
        }
      } catch { /* skip */ }
      setDone((d) => d + 1);
    }
    setRunning(false);
    if (!abortRef.current && onDone) onDone();
  };

  const handleStop = () => { abortRef.current = true; };

  return (
    <motion.button
      onClick={running ? handleStop : handleStart}
      disabled={total === 0}
      whileTap={{ scale: 0.92 }}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-40"
      style={{
        background: running ? 'rgba(248,113,113,0.12)' : 'rgba(99,102,241,0.12)',
        color: running ? 'var(--red)' : 'var(--accent)',
        border: `1px solid ${running ? 'rgba(248,113,113,0.3)' : 'rgba(99,102,241,0.25)'}`,
      }}
    >
      {running ? (
        <><CircleProgress done={done} total={total} /><span>Stop ({done}/{total})</span></>
      ) : (
        <><RefreshCw className="w-3.5 h-3.5" /><span>Refresh scores</span></>
      )}
    </motion.button>
  );
}

function Confetti({ trigger }: { trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = Array.from({ length: 80 }, () => ({
      x: canvas.width / 2, y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 1.2) * 14,
      color: ['#6ee7b7','#6366f1','#fbbf24','#f87171','#a78bfa'][Math.floor(Math.random() * 5)],
      size: Math.random() * 8 + 4, rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8, alpha: 1,
    }));
    let frame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx; p.vy += 0.55; p.y += p.vy;
        p.rotation += p.rotSpeed; p.alpha -= 0.018;
        if (p.alpha <= 0) continue;
        alive = true;
        ctx.save(); ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y); ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        ctx.restore();
      }
      if (alive) frame = requestAnimationFrame(animate);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [trigger]);
  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />;
}

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    setBump(true);
    const t = setTimeout(() => { setDisplay(value); setBump(false); prev.current = value; }, 180);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span className="tabular-nums transition-all duration-200" style={{
      display: 'inline-block',
      transform: bump ? 'scale(1.45)' : 'scale(1)',
      color: bump ? 'var(--accent)' : 'var(--text2)',
    }}>{display}</span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
      style={{
        background: copied ? 'rgba(110,231,183,0.15)' : 'var(--surface2)',
        color: copied ? 'var(--green)' : 'var(--text2)',
        border: `1px solid ${copied ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
      }}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Gekopieerd' : 'Kopieer'}
    </button>
  );
}

function scoreColor(score: number) {
  if (score >= 75) return 'var(--green)';
  if (score >= 50) return '#ffd60a';
  return 'var(--red)';
}

function Spinner() {
  return (
    <motion.span className="inline-block w-4 h-4 rounded-full border-2"
      style={{ borderColor: 'var(--green)', borderTopColor: 'transparent' }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }} />
  );
}

function SpinnerAccent() {
  return (
    <motion.span className="inline-block w-4 h-4 rounded-full border-2"
      style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }} />
  );
}

function StatusPicker({ current, onChange }: { current: AppliedStatus; onChange: (s: AppliedStatus) => void }) {
  return (
    <div className="flex gap-1">
      {APPLIED_STATUSES.map((s) => (
        <button key={s.key} onClick={(e) => { e.stopPropagation(); onChange(s.key); }} title={s.label}
          className="w-7 h-7 flex items-center justify-center rounded-full text-sm transition-all"
          style={{
            background: current === s.key ? `${s.color}28` : 'var(--surface2)',
            border: `1.5px solid ${current === s.key ? s.color : 'var(--border)'}`,
            opacity: current === s.key ? 1 : 0.45,
            transform: current === s.key ? 'scale(1.12)' : 'scale(1)',
          }}>{s.icon}</button>
      ))}
    </div>
  );
}

const tabVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 0, 0, 1] as const } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const } },
};

type ManualForm = { title: string; company: string; url: string; description: string; cover_letter: string; };
const EMPTY_FORM: ManualForm = { title: '', company: '', url: '', description: '', cover_letter: '' };

function ManualApplyModal({ onClose, onAdded }: { onClose: () => void; onAdded: (app: any) => void }) {
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);
  const [groqLoading, setGroqLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groqError, setGroqError] = useState('');

  const set = (k: keyof ManualForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleGroq = async () => {
    if (!form.title || !form.company) { setGroqError('Vul eerst functietitel en bedrijf in.'); return; }
    setGroqError('');
    setGroqLoading(true);
    try {
      const res = await fetch('/api/applied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cover_letter_draft: form.cover_letter, generate_groq: true, _preview_only: true }),
      });
      const json = await res.json();
      if (!res.ok) { setGroqError(json.error || 'Groq mislukt'); return; }
      setForm((f) => ({ ...f, cover_letter: json.cover_letter_draft || '' }));
    } catch (e: any) { setGroqError(e.message); }
    finally { setGroqLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.title || !form.company) { setGroqError('Functietitel en bedrijf zijn verplicht.'); return; }
    setGroqError('');
    setSaving(true);
    try {
      const res = await fetch('/api/applied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, company: form.company, url: form.url, description: form.description, cover_letter_draft: form.cover_letter, generate_groq: false }),
      });
      const json = await res.json();
      if (!res.ok) { setGroqError(json.error || 'Opslaan mislukt'); return; }
      onAdded({
        id: json.application_id, status: 'applied', applied_at: new Date().toISOString(),
        cover_letter_draft: form.cover_letter, resume_bullets_draft: json.resume_bullets_draft || [],
        match_score: json.match_score || 0, reasoning: json.reasoning || '',
        jobs: { title: form.title, company: form.company, url: form.url || null, source: 'manual' },
      });
    } catch (e: any) { setGroqError(e.message); }
    finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', width: '100%', outline: 'none',
  };

  return (
    <motion.div className="fixed inset-0 z-[70] flex flex-col justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <motion.div className="relative z-10 rounded-t-3xl flex flex-col w-full mx-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderBottom: 'none', maxWidth: 640, maxHeight: '92dvh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Manuele sollicitatie</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>Elders gesolliciteerd? Voeg het toe.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Functietitel *</label>
            <input value={form.title} onChange={set('title')} placeholder="bijv. Helpdesk Medewerker" style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Bedrijf *</label>
            <input value={form.company} onChange={set('company')} placeholder="bijv. Acme NV" style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Vacature URL</label>
            <input value={form.url} onChange={set('url')} placeholder="https://..." style={inputStyle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Vacaturebeschrijving</label>
            <textarea value={form.description} onChange={set('description')} rows={4} placeholder="Plak hier de vacaturetekst voor betere AI-generatie\u2026" style={{ ...inputStyle, resize: 'none' }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Motivatiebrief</label>
              <button onClick={handleGroq} disabled={groqLoading}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all disabled:opacity-50"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <AnimatePresence mode="wait" initial={false}>
                  {groqLoading
                    ? <motion.span key="s" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><SpinnerAccent /> Genereren\u2026</motion.span>
                    : <motion.span key="l" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Sparkles className="w-3.5 h-3.5" /> Genereer met Groq</motion.span>}
                </AnimatePresence>
              </button>
            </div>
            <textarea value={form.cover_letter} onChange={set('cover_letter')} rows={8}
              placeholder="Plak of genereer hier je motivatiebrief\u2026" style={{ ...inputStyle, resize: 'none' }} />
          </div>
          {groqError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-2xl text-xs"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)' }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{groqError}
            </div>
          )}
          <div className="h-2" />
        </div>
        <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>Annuleer</button>
          <button onClick={handleAdd} disabled={saving || !form.title || !form.company}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'rgba(110,231,183,0.18)', color: 'var(--green)', border: '1px solid rgba(110,231,183,0.25)' }}>
            <AnimatePresence mode="wait" initial={false}>
              {saving
                ? <motion.span key="s" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Spinner /> Toevoegen\u2026</motion.span>
                : <motion.span key="l" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><PlusCircle className="w-4 h-4" /> Toevoegen aan gesolliciteerd</motion.span>}
            </AnimatePresence>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

type ModalMode = 'confirm' | 'view' | 'edit';
type ApplyModalProps = {
  app: any; initialCoverLetter: string; initialBullets: string[]; mode: ModalMode;
  groqSkipped?: boolean; onClose: () => void;
  onConfirm?: (coverLetter: string, bullets: string[]) => Promise<void>;
  onLetterRegenerated?: (coverLetter: string, bullets: string[]) => void;
};

function ApplyModal({ app, initialCoverLetter, initialBullets, mode, groqSkipped, onClose, onConfirm, onLetterRegenerated }: ApplyModalProps) {
  const [coverLetter, setCoverLetter] = useState(initialCoverLetter);
  const [bullets, setBullets] = useState<string[]>(initialBullets);
  const [saving, setSaving] = useState(false);
  const [groqLoading, setGroqLoading] = useState(false);
  const [groqError, setGroqError] = useState('');
  const [regenDone, setRegenDone] = useState(false);
  const job = app.jobs;
  const isEditable = mode === 'confirm' || mode === 'edit';

  const handleBulletChange = (i: number, val: string) =>
    setBullets((prev) => prev.map((b, idx) => idx === i ? val : b));

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setSaving(true);
    try { await onConfirm(coverLetter, bullets); }
    finally { setSaving(false); }
  };

  // Available in ALL modes (confirm, edit, view)
  const handleRegenerate = async () => {
    setGroqError('');
    setRegenDone(false);
    setGroqLoading(true);
    try {
      const res = await fetch('/api/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, regenerate_letter: true }),
      });
      const json = await res.json();
      if (!res.ok) { setGroqError(json.error || 'Groq mislukt'); return; }
      const newLetter  = json.cover_letter_draft  || coverLetter;
      const newBullets = json.resume_bullets_draft?.length ? json.resume_bullets_draft : bullets;
      setCoverLetter(newLetter);
      setBullets(newBullets);
      setRegenDone(true);
      setTimeout(() => setRegenDone(false), 3000);
      // Persist immediately so the card list reflects the new letter too
      await fetch('/api/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: app.id, cover_letter_draft: newLetter, resume_bullets_draft: newBullets, confirm: false }),
      });
      if (onLetterRegenerated) onLetterRegenerated(newLetter, newBullets);
    } catch (e: any) { setGroqError(e.message); }
    finally { setGroqLoading(false); }
  };

  const footerLabel = mode === 'confirm' ? 'Solliciteer' : 'Opslaan';

  return (
    <motion.div className="fixed inset-0 z-[60] flex flex-col justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <motion.div className="relative z-10 rounded-t-3xl flex flex-col w-full mx-auto"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderBottom: 'none', maxWidth: 640, maxHeight: '90dvh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>
              {mode === 'confirm' ? `${ROBOT} AI Sollicitatie-concept` : mode === 'edit' ? '\u270f\ufe0f Score breakdown' : `${CLIPBOARD} Sollicitatie-details`}
            </span>
            <span className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>{job?.title || 'Vacature'}</span>
            {typeof app.match_score === 'number' && app.match_score > 0 && (
              <span className="text-xs font-bold mt-1 self-start px-2 py-0.5 rounded-full tabular-nums"
                style={{ background: `${scoreColor(app.match_score)}18`, color: scoreColor(app.match_score), border: `1px solid ${scoreColor(app.match_score)}44` }}>
                {app.match_score}% match
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Regenerate banner — always visible at top of scroll area */}
        <div className="px-5 pt-4 flex-shrink-0">
          <motion.button
            onClick={handleRegenerate}
            disabled={groqLoading}
            whileTap={{ scale: 0.96 }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: regenDone ? 'rgba(110,231,183,0.15)' : 'rgba(99,102,241,0.12)',
              color: regenDone ? 'var(--green)' : 'var(--accent)',
              border: `1px solid ${regenDone ? 'rgba(110,231,183,0.35)' : 'rgba(99,102,241,0.3)'}`,
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {groqLoading
                ? <motion.span key="loading" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <SpinnerAccent /> Nieuwe brief genereren\u2026
                  </motion.span>
                : regenDone
                ? <motion.span key="done" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Check className="w-4 h-4" /> Brief bijgewerkt!
                  </motion.span>
                : <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Sparkles className="w-4 h-4" /> Regenereer motivatiebrief
                  </motion.span>}
            </AnimatePresence>
          </motion.button>
          {groqError && (
            <div className="flex items-start gap-2 px-3 py-2 mt-2 rounded-xl text-xs"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)' }}>
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />{groqError}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {groqSkipped && mode === 'confirm' && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-2xl text-xs leading-relaxed"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)' }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Groq evaluatie overgeslagen \u2014 controleer je API-sleutel in instellingen.</span>
            </div>
          )}
          {app.reasoning && <p className="text-xs leading-relaxed" style={{ color: '#a78bfa' }}>{ROBOT} {app.reasoning}</p>}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Motivatiebrief</span>
              {coverLetter && <CopyButton text={coverLetter} />}
            </div>
            {isEditable
              ? <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={10}
                  className="w-full rounded-2xl p-3 text-xs leading-relaxed resize-none outline-none"
                  style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'inherit' }} />
              : <p className="text-xs leading-relaxed whitespace-pre-line p-3 rounded-2xl"
                  style={{ background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                  {coverLetter || '\u2014'}
                </p>}
          </div>

          {bullets.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Score breakdown</span>
                <CopyButton text={bullets.join('\n')} />
              </div>
              <div className="flex flex-col gap-2">
                {bullets.map((bullet, i) => isEditable
                  ? <div key={i} className="flex items-start gap-2">
                      <span className="mt-2 flex-shrink-0 text-xs" style={{ color: 'var(--accent)' }}>\u25b8</span>
                      <textarea value={bullet} onChange={(e) => handleBulletChange(i, e.target.value)} rows={2}
                        className="flex-1 rounded-xl px-3 py-2 text-xs leading-relaxed resize-none outline-none"
                        style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'inherit' }} />
                    </div>
                  : <div key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text3)' }}>
                      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>\u25b8</span>{bullet}
                    </div>
                )}
              </div>
            </div>
          )}
          <div className="h-4" />
        </div>

        {/* Footer */}
        {isEditable && (
          <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>Annuleer</button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'rgba(110,231,183,0.18)', color: 'var(--green)' }}>
              {saving ? <Lottie animationData={loaderDots} loop autoplay style={{ width: 32, height: 20 }} /> : <><Send className="w-4 h-4" /> {footerLabel}</>}
            </button>
          </div>
        )}
        {mode === 'view' && job?.url && (
          <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <a href={job.url} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}>Vacature openen \u2197</a>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

type Tab = 'results' | 'saved' | 'applied';
const DEFAULT_TAGS = ['IT support', 'helpdesk', 'servicedesk', 'technician'];

function ls<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; }
  catch { return fallback; }
}

export default function QueuePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [topIdx, setTopIdx] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [redFlash, setRedFlash] = useState(false);
  const [tab, setTab] = useState<Tab>('results');
  const [prevTab, setPrevTab] = useState<Tab>('results');
  const [saved, setSaved] = useState<any[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [applied, setApplied] = useState<any[]>([]);
  const [appliedLoading, setAppliedLoading] = useState(false);
  const [activeKeywords, setActiveKeywords] = useState<string[]>(DEFAULT_TAGS);
  const [dragX, setDragX] = useState(0);
  const [manualModal, setManualModal] = useState(false);
  const [rematchLoading, setRematchLoading] = useState<string | null>(null);
  const [queueRematchLoading, setQueueRematchLoading] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState<string | null>(null);
  const [modal, setModal] = useState<{ app: any; coverLetter: string; bullets: string[]; mode: ModalMode; groqSkipped?: boolean; } | null>(null);

  const TAB_ORDER: Tab[] = ['results', 'saved', 'applied'];
  const tabDir = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(prevTab) ? 1 : -1;

  const switchTab = (next: Tab) => { if (next === tab) return; setPrevTab(tab); setTab(next); };

  useEffect(() => {
    setActiveKeywords(ls('ja_tags', DEFAULT_TAGS));
    fetchQueue();
    fetchSaved();
    fetchApplied();
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.applications) setApplications(sortByScore(json.applications));
    } catch (e) { console.error('fetchQueue mislukt', e); }
    finally { setLoading(false); }
  };

  const fetchSaved = async () => {
    setSavedLoading(true);
    try {
      const res = await fetch('/api/saved');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.applications) setSaved(sortByScore(json.applications));
    } catch (e) { console.error('fetchSaved mislukt', e); }
    finally { setSavedLoading(false); }
  };

  const fetchApplied = async () => {
    setAppliedLoading(true);
    try {
      const res = await fetch('/api/applied');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.applications) setApplied(json.applications);
    } catch (e) { console.error('fetchApplied mislukt', e); }
    finally { setAppliedLoading(false); }
  };

  const advance = () => setTopIdx((i) => i + 1);

  const handleSwipeLeft = async (id: string) => {
    setRedFlash(true); setDragX(0);
    setTimeout(() => setRedFlash(false), 400);
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'skipped' }) });
    advance();
  };

  const handleSwipeRight = async (id: string) => {
    setDragX(0);
    const item = applications.find((a) => a.id === id);
    if (item) setSaved((prev) => sortByScore([{ ...item, status: 'saved' }, ...prev]));
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'saved' }) });
    advance();
  };

  const handleQueueRematch = async (id: string) => {
    setQueueRematchLoading(id);
    try {
      const res = await fetch('/api/rematch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: id }) });
      if (res.ok) {
        const json = await res.json();
        setApplications((prev) => sortByScore(prev.map((a) => a.id === id ? { ...a, match_score: json.match_score, reasoning: json.reasoning } : a)));
      }
    } catch (e) { console.error('Queue rematch mislukt', e); }
    finally { setQueueRematchLoading(null); }
  };

  const handleApplyPress = async (app: any) => {
    const id = app.id;
    setApplyLoading(id);
    try {
      const res = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: id }) });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Groq evaluatie mislukt.'); return; }
      setModal({ app: { ...app, match_score: json.match_score, reasoning: json.reasoning }, coverLetter: json.cover_letter_draft || '', bullets: json.resume_bullets_draft || [], mode: 'confirm', groqSkipped: !!json.groq_skipped });
    } catch (e: any) { alert(e.message || 'Netwerkfout'); }
    finally { setApplyLoading(null); }
  };

  const handleRematch = async (app: any, listSetter: React.Dispatch<React.SetStateAction<any[]>>) => {
    const id = app.id;
    setRematchLoading(id);
    try {
      const res = await fetch('/api/rematch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: id }) });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Rematch mislukt.'); return; }
      listSetter((prev) => prev.map((a) => a.id === id ? { ...a, match_score: json.match_score, reasoning: json.reasoning } : a));
    } catch (e: any) { alert(e.message || 'Netwerkfout'); }
    finally { setRematchLoading(null); }
  };

  const handleModalConfirm = async (coverLetter: string, bullets: string[]) => {
    if (!modal) return;
    const id = modal.app.id;
    const isEdit = modal.mode === 'edit';
    const res = await fetch('/api/apply', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: id, cover_letter_draft: coverLetter, resume_bullets_draft: bullets, confirm: !isEdit }),
    });
    if (!res.ok) { const json = await res.json(); alert(json.error || 'Opslaan mislukt.'); return; }
    if (isEdit) {
      setApplied((prev) => prev.map((a) => a.id === id ? { ...a, cover_letter_draft: coverLetter, resume_bullets_draft: bullets } : a));
    } else {
      setConfetti((c) => c + 1);
      const item = saved.find((a) => a.id === id);
      setSaved((prev) => prev.filter((a) => a.id !== id));
      if (item) setApplied((prev) => sortApplied([{ ...item, status: 'applied', cover_letter_draft: coverLetter, resume_bullets_draft: bullets, match_score: modal.app.match_score, reasoning: modal.app.reasoning, applied_at: new Date().toISOString() }, ...prev]));
    }
    setModal(null);
  };

  const handleLetterRegenerated = (id: string, newLetter: string, newBullets: string[]) => {
    setSaved((prev) => prev.map((a) => a.id === id ? { ...a, cover_letter_draft: newLetter, resume_bullets_draft: newBullets } : a));
    setApplied((prev) => prev.map((a) => a.id === id ? { ...a, cover_letter_draft: newLetter, resume_bullets_draft: newBullets } : a));
    if (modal) setModal((m) => m ? { ...m, coverLetter: newLetter, bullets: newBullets } : m);
  };

  const removeFromSaved = async (id: string) => {
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'skipped' }) });
    setSaved((prev) => prev.filter((a) => a.id !== id));
  };

  const removeFromApplied = async (id: string) => {
    await fetch('/api/applied', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: id }) });
    setApplied((prev) => prev.filter((a) => a.id !== id));
  };

  const updateAppliedStatus = async (id: string, status: AppliedStatus) => {
    const now = new Date().toISOString();
    setApplied((prev) => sortApplied(prev.map((a) => a.id === id ? { ...a, status, status_changed_at: now } : a)));
    await fetch('/api/applied', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: id, status }) });
  };

  const handleManualAdded = (app: any) => {
    setApplied((prev) => sortApplied([app, ...prev]));
    setConfetti((c) => c + 1);
    setManualModal(false);
    switchTab('applied');
  };

  const openAppliedModal   = (app: any) => setModal({ app, coverLetter: app.cover_letter_draft || '', bullets: app.resume_bullets_draft || [], mode: 'view' });
  const openAddLetterModal = (app: any) => setModal({ app, coverLetter: app.cover_letter_draft || '', bullets: app.resume_bullets_draft || [], mode: 'edit' });

  const updateSavedScore   = (id: string, score: number, reasoning: string) =>
    setSaved((prev) => sortByScore(prev.map((a) => a.id === id ? { ...a, match_score: score, reasoning } : a)));
  const updateAppliedScore = (id: string, score: number, reasoning: string) =>
    setApplied((prev) => prev.map((a) => a.id === id ? { ...a, match_score: score, reasoning } : a));

  const topApp    = applications[topIdx];
  const visible   = applications.slice(topIdx, topIdx + 3);
  const remaining = applications.length - topIdx;
  const sortedApplied = sortApplied(applied);

  const tabs: { key: Tab; label: (count: number) => string }[] = [
    { key: 'results', label: (n) => n > 0 ? `Vacatures (${n})` : 'Vacatures' },
    { key: 'saved',   label: (n) => n > 0 ? `Bewaard (${n})` : 'Bewaard' },
    { key: 'applied', label: (n) => n > 0 ? `Gesolliciteerd (${n})` : 'Gesolliciteerd' },
  ];
  const tabCounts: Record<Tab, number> = { results: remaining, saved: saved.length, applied: applied.length };

  return (
    <motion.div
      className="page-shell page-shell--full select-none transition-colors duration-300"
      style={{ background: redFlash ? 'rgba(248,113,113,0.06)' : 'var(--bg)' }}
      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <Confetti trigger={confetti} />

      <AnimatePresence>
        {modal && (
          <ApplyModal
            app={modal.app}
            initialCoverLetter={modal.coverLetter}
            initialBullets={modal.bullets}
            mode={modal.mode}
            groqSkipped={modal.groqSkipped}
            onClose={() => setModal(null)}
            onConfirm={modal.mode !== 'view' ? handleModalConfirm : undefined}
            onLetterRegenerated={(letter, bullets) => handleLetterRegenerated(modal.app.id, letter, bullets)}
          />
        )}
        {manualModal && <ManualApplyModal onClose={() => setManualModal(false)} onAdded={handleManualAdded} />}
      </AnimatePresence>

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>\u2190 Terug</Link>
          <div className="flex items-center gap-2">
            {tab === 'results' && (
              <span className="text-sm">
                <AnimatedCount value={remaining} />
                <span style={{ color: 'var(--text2)' }}> resterend</span>
              </span>
            )}
            {tab === 'saved' && saved.length > 0 && (
              <RefreshAllButton list={saved} onUpdate={updateSavedScore} onDone={fetchSaved} />
            )}
            {tab === 'applied' && sortedApplied.length > 0 && (
              <>
                <RefreshAllButton list={sortedApplied} onUpdate={updateAppliedScore} onDone={fetchApplied} />
                <motion.button onClick={() => exportToPdf(sortedApplied)} whileTap={{ scale: 0.92 }}
                  initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <Download className="w-3.5 h-3.5" /> PDF
                </motion.button>
              </>
            )}
            <motion.button onClick={() => setManualModal(true)} whileTap={{ scale: 0.92 }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl"
              style={{ background: 'rgba(110,231,183,0.12)', color: 'var(--green)', border: '1px solid rgba(110,231,183,0.25)' }}>
              <PlusCircle className="w-3.5 h-3.5" /> Toevoegen
            </motion.button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-4 p-1 rounded-2xl" style={{ background: 'var(--surface)' }}>
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => switchTab(key)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200"
              style={{
                background: tab === key ? 'var(--surface2)' : 'transparent',
                color: tab === key ? 'var(--text)' : 'var(--text2)',
                boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
              }}>{label(tabCounts[key])}</button>
          ))}
        </div>
      </div>

      {/* ── Scrollable tab content ─────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>

        {tab === 'results' && (
          <motion.div key="results" variants={tabVariants} initial="initial" animate="animate" exit="exit" custom={tabDir}
            className="flex-1 flex flex-col min-h-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-4">
                <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
                <p className="text-sm" style={{ color: 'var(--text2)' }}>Wachtrij laden\u2026</p>
              </div>
            ) : remaining > 0 ? (
              <div className="flex flex-col flex-1 min-h-0 gap-0">
                <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-3xl">
                  {visible.map((app, i) => (
                    <div key={app.id} className="absolute inset-0"
                      style={{
                        transform: `scale(${1 - i * 0.04}) translateY(${i * 14}px)`,
                        zIndex: visible.length - i,
                        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                        pointerEvents: i === 0 ? 'auto' : 'none',
                      }}>
                      <SwipeCard
                        application={app}
                        onSwipeLeft={handleSwipeLeft}
                        onSwipeRight={handleSwipeRight}
                        isTop={i === 0}
                        activeKeywords={activeKeywords}
                        onDragX={i === 0 ? setDragX : undefined}
                        onRematch={handleQueueRematch}
                        rematchLoading={queueRematchLoading === app.id}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center flex-shrink-0 mt-4 px-1 gap-3">
                  <motion.button
                    onClick={() => topApp && handleSwipeLeft(topApp.id)}
                    disabled={!topApp} whileTap={{ scale: 0.93 }}
                    className="flex flex-1 items-center justify-center gap-1.5 text-sm font-semibold py-3 rounded-2xl transition-all duration-150 disabled:opacity-30"
                    style={{
                      background: dragX < -40 ? 'rgba(248,113,113,0.18)' : 'var(--surface)',
                      color: dragX < -40 ? 'var(--red)' : 'var(--text2)',
                      border: `1px solid ${dragX < -40 ? 'rgba(248,113,113,0.4)' : 'var(--border)'}`,
                    }}>
                    <ThumbsDown className="w-4 h-4" /> Overslaan
                  </motion.button>
                  <motion.button
                    onClick={() => topApp && handleSwipeRight(topApp.id)}
                    disabled={!topApp} whileTap={{ scale: 0.93 }}
                    className="flex flex-1 items-center justify-center gap-1.5 text-sm font-semibold py-3 rounded-2xl transition-all duration-150 disabled:opacity-30"
                    style={{
                      background: dragX > 40 ? 'rgba(110,231,183,0.18)' : 'var(--surface)',
                      color: dragX > 40 ? 'var(--green)' : 'var(--text2)',
                      border: `1px solid ${dragX > 40 ? 'rgba(110,231,183,0.4)' : 'var(--border)'}`,
                    }}>
                    <ThumbsUp className="w-4 h-4" /> Bewaren
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface)' }}>{CHECK_DONE}</div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Alles bekeken</h2>
                <p className="text-sm" style={{ color: 'var(--text2)' }}>Geen vacatures meer in de wachtrij.</p>
                <Link href="/" className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Opnieuw zoeken</Link>
              </div>
            )}
          </motion.div>
        )}

        {tab === 'saved' && (
          <motion.div key="saved" variants={tabVariants} initial="initial" animate="animate" exit="exit" custom={tabDir}
            className="flex-1 min-h-0 overflow-y-auto -webkit-overflow-scrolling-touch">
            {savedLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
                <p className="text-sm" style={{ color: 'var(--text2)' }}>Laden\u2026</p>
              </div>
            ) : saved.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface)' }}>{BOOKMARK}</div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Nog niets bewaard</h2>
                <p className="text-sm" style={{ color: 'var(--text2)' }}>Swipe rechts om vacatures hier op te slaan.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 pb-8">
                {saved.map((app) => {
                  const job = app.jobs;
                  const src = job?.source || '';
                  const col = SOURCE_COLORS[src] || 'var(--text2)';
                  const isGenerating = applyLoading === app.id;
                  const isRematching = rematchLoading === app.id;
                  return (
                    <div key={app.id} className="rounded-2xl p-4 flex flex-col gap-3"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: `${col}22`, color: col }}>{src || '?'}</span>
                          <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                          {typeof app.match_score === 'number' && app.match_score > 0 && (
                            <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: scoreColor(app.match_score) }}>{app.match_score}%</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <motion.button onClick={(e) => { e.stopPropagation(); handleRematch(app, setSaved); }}
                            disabled={isRematching || !!rematchLoading} title="Herbereken match %" whileTap={{ scale: 0.88 }}
                            className="w-6 h-6 flex items-center justify-center rounded-full disabled:opacity-40"
                            style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                            <motion.span animate={isRematching ? { rotate: 360 } : { rotate: 0 }}
                              transition={isRematching ? { repeat: Infinity, duration: 0.75, ease: 'linear' } : { duration: 0 }}
                              style={{ display: 'flex' }}><RefreshCw className="w-3 h-3" /></motion.span>
                          </motion.button>
                          <button onClick={() => removeFromSaved(app.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-full opacity-40 hover:opacity-80 transition-opacity"
                            style={{ color: 'var(--text2)' }}>\u2715</button>
                        </div>
                      </div>
                      <p className="font-semibold text-base leading-snug" style={{ color: 'var(--text)' }}>{job?.title || 'Onbekend'}</p>
                      <div className="flex gap-2">
                        {job?.url && (
                          <a href={job.url} target="_blank" rel="noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl"
                            style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>Openen \u2197</a>
                        )}
                        <button onClick={() => handleApplyPress(app)} disabled={isGenerating || !!applyLoading}
                          className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
                          style={{ background: 'rgba(110,231,183,0.12)', color: 'var(--green)' }}>
                          <AnimatePresence mode="wait" initial={false}>
                            {isGenerating
                              ? <motion.span key="spinner" className="flex items-center gap-1.5" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}><Spinner /> Genereren\u2026</motion.span>
                              : <motion.span key="label" className="flex items-center gap-1.5" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}><Send className="w-3.5 h-3.5" /> Solliciteer</motion.span>}
                          </AnimatePresence>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {tab === 'applied' && (
          <motion.div key="applied" variants={tabVariants} initial="initial" animate="animate" exit="exit" custom={tabDir}
            className="flex-1 min-h-0 overflow-y-auto">
            {appliedLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
                <p className="text-sm" style={{ color: 'var(--text2)' }}>Laden\u2026</p>
              </div>
            ) : sortedApplied.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface)' }}>{CLIPBOARD}</div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Nog niet gesolliciteerd</h2>
                <p className="text-sm" style={{ color: 'var(--text2)' }}>Druk op &quot;Solliciteer&quot; bij bewaarde vacatures, of gebruik de + knop om manueel toe te voegen.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 pb-8">
                <AnimatePresence initial={false}>
                  {sortedApplied.map((app) => {
                    const job = app.jobs;
                    const src = job?.source || '';
                    const col = src === 'manual' ? 'var(--text2)' : (SOURCE_COLORS[src] || 'var(--text2)');
                    const hasLetter = !!(app.cover_letter_draft || (app.resume_bullets_draft?.length > 0));
                    const sc = appliedStatusConfig(app.status);
                    const isRejected = app.status === 'rejected';
                    const isRematching = rematchLoading === app.id;
                    const isInProgress = app.status === 'in_progress';
                    return (
                      <motion.div key={app.id} layout initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: isRejected ? 0.55 : 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden"
                        style={{ background: 'var(--surface)', border: `1.5px solid ${sc.color}55`, boxShadow: `0 0 0 1px ${sc.color}22`, filter: isRejected ? 'blur(0.4px)' : 'none' }}>
                        {isInProgress && (
                          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
                            <Lottie animationData={sparklesData} loop autoplay style={{ width: '100%', height: '100%', opacity: 0.18 }} />
                          </div>
                        )}
                        <div className="relative z-10 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex items-center gap-1 text-xs font-semibold flex-shrink-0" style={{ color: sc.color }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.color }} />
                              {sc.label_en}
                            </span>
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: `${col}22`, color: col }}>{src || 'manual'}</span>
                            <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <motion.button onClick={(e) => { e.stopPropagation(); handleRematch(app, setApplied); }}
                              disabled={isRematching || !!rematchLoading} title="Herbereken match %" whileTap={{ scale: 0.88 }}
                              className="w-6 h-6 flex items-center justify-center rounded-full disabled:opacity-40"
                              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                              <motion.span animate={isRematching ? { rotate: 360 } : { rotate: 0 }}
                                transition={isRematching ? { repeat: Infinity, duration: 0.75, ease: 'linear' } : { duration: 0 }}
                                style={{ display: 'flex' }}><RefreshCw className="w-3 h-3" /></motion.span>
                            </motion.button>
                            {typeof app.match_score === 'number' && app.match_score > 0 && (
                              <span className="text-xs font-bold tabular-nums" style={{ color: scoreColor(app.match_score) }}>{app.match_score}%</span>
                            )}
                            <button onClick={() => removeFromApplied(app.id)}
                              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full opacity-40 hover:opacity-80 transition-opacity"
                              style={{ color: 'var(--text2)' }}>\u2715</button>
                          </div>
                        </div>
                        <p className="relative z-10 font-semibold text-base leading-snug" style={{ color: 'var(--text)' }}>{job?.title || 'Onbekend'}</p>
                        {app.applied_at && (
                          <p className="relative z-10 text-xs" style={{ color: 'var(--text2)' }}>
                            Gesolliciteerd op {new Date(app.applied_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                        <div className="relative z-10">
                          <StatusPicker current={app.status as AppliedStatus} onChange={(s) => updateAppliedStatus(app.id, s)} />
                        </div>
                        <div className="relative z-10 flex gap-2 mt-1">
                          {job?.url && (
                            <a href={job.url} target="_blank" rel="noreferrer"
                              className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl"
                              style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>Openen \u2197</a>
                          )}
                          {hasLetter
                            ? <button onClick={() => openAppliedModal(app)}
                                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl"
                                style={{ background: 'rgba(191,90,242,0.12)', color: '#bf5af2' }}>
                                <FileText className="w-3.5 h-3.5" /> Bekijk brief & score
                              </button>
                            : <button onClick={() => openAddLetterModal(app)}
                                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl"
                                style={{ background: 'rgba(99,102,241,0.10)', color: 'var(--accent)', border: '1px dashed rgba(99,102,241,0.35)' }}>
                                <PlusCircle className="w-3.5 h-3.5" /> Brief toevoegen
                              </button>}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
