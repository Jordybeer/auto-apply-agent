"use client";

import { useEffect, useRef, useState } from 'react';
import SwipeCard from '@/components/SwipeCard';
import Lottie from 'lottie-react';
import loaderDots from '@/app/lotties/loader-dots.json';
import Link from 'next/link';
import { SOURCE_COLOR_FLAT as SOURCE_COLORS } from '@/lib/constants';
import { Copy, Check, X, FileText, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Emoji via codepoint — never write surrogate pairs as literals
const BOOKMARK   = String.fromCodePoint(0x1F516); // 🔖
const CLIPBOARD  = String.fromCodePoint(0x1F4CB); // 📋
const ROBOT      = String.fromCodePoint(0x1F916); // 🤖
const CHECK_DONE = '\u2713';

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
    }}>
      {display}
    </span>
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
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
      style={{
        background: copied ? 'rgba(110,231,183,0.15)' : 'var(--surface2)',
        color: copied ? 'var(--green)' : 'var(--text2)',
        border: `1px solid ${copied ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
      }}
    >
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

type ModalMode = 'confirm' | 'view';
type ApplyModalProps = {
  app: any;
  initialCoverLetter: string;
  initialBullets: string[];
  mode: ModalMode;
  onClose: () => void;
  onConfirm?: (coverLetter: string, bullets: string[]) => Promise<void>;
};

function ApplyModal({ app, initialCoverLetter, initialBullets, mode, onClose, onConfirm }: ApplyModalProps) {
  const [coverLetter, setCoverLetter] = useState(initialCoverLetter);
  const [bullets, setBullets] = useState<string[]>(initialBullets);
  const [saving, setSaving] = useState(false);
  const job = app.jobs;

  const handleBulletChange = (i: number, val: string) => {
    setBullets((prev) => prev.map((b, idx) => idx === i ? val : b));
  };

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setSaving(true);
    try { await onConfirm(coverLetter, bullets); }
    finally { setSaving(false); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.div
        className="relative z-10 rounded-t-3xl flex flex-col w-full mx-auto"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          maxWidth: 640,
          maxHeight: '90dvh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>
              {mode === 'confirm' ? `${ROBOT} AI Sollicitatie-concept` : `${CLIPBOARD} Sollicitatie-details`}
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
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {app.reasoning && <p className="text-xs leading-relaxed" style={{ color: '#a78bfa' }}>{ROBOT} {app.reasoning}</p>}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>Motivatiebrief</span>
              <CopyButton text={coverLetter} />
            </div>
            {mode === 'confirm' ? (
              <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={10}
                className="w-full rounded-2xl p-3 text-xs leading-relaxed resize-none outline-none"
                style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'inherit' }} />
            ) : (
              <p className="text-xs leading-relaxed whitespace-pre-line p-3 rounded-2xl"
                style={{ background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                {coverLetter || '\u2014'}
              </p>
            )}
          </div>
          {bullets.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text2)' }}>CV-bullets</span>
                <CopyButton text={bullets.join('\n')} />
              </div>
              <div className="flex flex-col gap-2">
                {bullets.map((bullet, i) => mode === 'confirm' ? (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-2 flex-shrink-0 text-xs" style={{ color: 'var(--accent)' }}>▸</span>
                    <textarea value={bullet} onChange={(e) => handleBulletChange(i, e.target.value)} rows={2}
                      className="flex-1 rounded-xl px-3 py-2 text-xs leading-relaxed resize-none outline-none"
                      style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'inherit' }} />
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text3)' }}>
                    <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>▸</span>
                    {bullet}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="h-4" />
        </div>
        {mode === 'confirm' && (
          <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>Annuleer</button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'rgba(110,231,183,0.18)', color: 'var(--green)' }}>
              {saving ? <Lottie animationData={loaderDots} loop autoplay style={{ width: 32, height: 20 }} /> : <><Send className="w-4 h-4" /> Solliciteer</>}
            </button>
          </div>
        )}
        {mode === 'view' && job?.url && (
          <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <a href={job.url} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}>Vacature openen ↗</a>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

type Tab = 'results' | 'saved' | 'applied';
const DEFAULT_TAGS = ['IT support', 'helpdesk', 'servicedesk', 'technician'];

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

export default function QueuePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [topIdx, setTopIdx]             = useState(0);
  const [confetti, setConfetti]         = useState(0);
  const [redFlash, setRedFlash]         = useState(false);
  const [tab, setTab]                   = useState<Tab>('results');
  const [saved, setSaved]               = useState<any[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [applied, setApplied]           = useState<any[]>([]);
  const [appliedLoading, setAppliedLoading] = useState(false);
  const [activeKeywords, setActiveKeywords] = useState<string[]>(DEFAULT_TAGS);
  const [dragX, setDragX]               = useState(0);

  const [applyLoading, setApplyLoading] = useState<string | null>(null);
  const [modal, setModal]               = useState<{
    app: any; coverLetter: string; bullets: string[]; mode: ModalMode;
  } | null>(null);

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
      if (json.applications) setApplications(json.applications);
    } catch (e) { console.error('fetchQueue mislukt', e); }
    finally { setLoading(false); }
  };

  const fetchSaved = async () => {
    setSavedLoading(true);
    try {
      const res = await fetch('/api/saved');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.applications) setSaved(json.applications);
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
    if (item) setSaved((prev) => [{ ...item, status: 'saved' }, ...prev]);
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'saved' }) });
    advance();
  };

  const handleApplyPress = async (app: any) => {
    const id = app.id;
    setApplyLoading(id);
    try {
      const res = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: id }) });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Groq evaluatie mislukt.'); return; }
      setModal({ app: { ...app, match_score: json.match_score, reasoning: json.reasoning }, coverLetter: json.cover_letter_draft || '', bullets: json.resume_bullets_draft || [], mode: 'confirm' });
    } catch (e: any) { alert(e.message || 'Netwerkfout'); }
    finally { setApplyLoading(null); }
  };

  const handleModalConfirm = async (coverLetter: string, bullets: string[]) => {
    if (!modal) return;
    const id = modal.app.id;
    const res = await fetch('/api/apply', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ application_id: id, cover_letter_draft: coverLetter, resume_bullets_draft: bullets }) });
    if (!res.ok) { const json = await res.json(); alert(json.error || 'Opslaan mislukt.'); return; }
    setConfetti((c) => c + 1);
    const item = saved.find((a) => a.id === id);
    setSaved((prev) => prev.filter((a) => a.id !== id));
    if (item) setApplied((prev) => [{ ...item, status: 'applied', cover_letter_draft: coverLetter, resume_bullets_draft: bullets, match_score: modal.app.match_score, reasoning: modal.app.reasoning }, ...prev]);
    setModal(null);
  };

  const removeFromSaved = async (id: string) => {
    await fetch('/api/queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'skipped' }) });
    setSaved((prev) => prev.filter((a) => a.id !== id));
  };

  const openAppliedModal = (app: any) => {
    setModal({ app, coverLetter: app.cover_letter_draft || '', bullets: app.resume_bullets_draft || [], mode: 'view' });
  };

  const visible   = applications.slice(topIdx, topIdx + 3);
  const remaining = applications.length - topIdx;

  const tabs: { key: Tab; label: (count: number) => string }[] = [
    { key: 'results', label: (n) => n > 0 ? `Vacatures (${n})` : 'Vacatures' },
    { key: 'saved',   label: (n) => n > 0 ? `Bewaard (${n})` : 'Bewaard' },
    { key: 'applied', label: (n) => n > 0 ? `Gesolliciteerd (${n})` : 'Gesolliciteerd' },
  ];
  const tabCounts: Record<Tab, number> = { results: remaining, saved: saved.length, applied: applied.length };

  return (
    <div
      className="page-shell page-shell--full select-none transition-colors duration-300"
      style={{ background: redFlash ? 'rgba(248,113,113,0.06)' : 'var(--bg)' }}
    >
      <Confetti trigger={confetti} />

      <AnimatePresence>
        {modal && (
          <ApplyModal
            app={modal.app}
            initialCoverLetter={modal.coverLetter}
            initialBullets={modal.bullets}
            mode={modal.mode}
            onClose={() => setModal(null)}
            onConfirm={modal.mode === 'confirm' ? handleModalConfirm : undefined}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>← Terug</Link>
        {tab === 'results' && (
          <span className="text-sm">
            <AnimatedCount value={remaining} />
            <span style={{ color: 'var(--text2)' }}> resterend</span>
          </span>
        )}
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-2xl" style={{ background: 'var(--surface)' }}>
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200"
            style={{
              background: tab === key ? 'var(--surface2)' : 'transparent',
              color: tab === key ? 'var(--text)' : 'var(--text2)',
              boxShadow: tab === key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            {label(tabCounts[key])}
          </button>
        ))}
      </div>

      {tab === 'results' && (
        loading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-16">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Wachtrij laden…</p>
          </div>
        ) : remaining > 0 ? (
          <>
            <div className="relative w-full overflow-hidden rounded-3xl" style={{ height: 'clamp(340px, 58dvh, 560px)' }}>
              {visible.map((app, i) => (
                <div key={app.id} className="absolute inset-0"
                  style={{
                    transform: `scale(${1 - i * 0.04}) translateY(${i * 14}px)`,
                    zIndex: visible.length - i,
                    transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                    pointerEvents: i === 0 ? 'auto' : 'none',
                  }}
                >
                  <SwipeCard
                    application={app}
                    onSwipeLeft={handleSwipeLeft}
                    onSwipeRight={handleSwipeRight}
                    isTop={i === 0}
                    activeKeywords={activeKeywords}
                    onDragX={i === 0 ? setDragX : undefined}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-5 px-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-150"
                style={{
                  background: dragX < -40 ? 'rgba(248,113,113,0.15)' : 'var(--surface)',
                  color: dragX < -40 ? 'var(--red)' : 'var(--surface2)',
                  border: `1px solid ${dragX < -40 ? 'rgba(248,113,113,0.35)' : 'var(--border)'}`,
                  transform: dragX < -40 ? 'scale(1.05)' : 'scale(1)',
                }}
              >← Overslaan</div>
              <span className="text-xs" style={{ color: 'var(--border)' }}>swipe om te beslissen</span>
              <div className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-150"
                style={{
                  background: dragX > 40 ? 'rgba(110,231,183,0.15)' : 'var(--surface)',
                  color: dragX > 40 ? 'var(--green)' : 'var(--surface2)',
                  border: `1px solid ${dragX > 40 ? 'rgba(110,231,183,0.35)' : 'var(--border)'}`,
                  transform: dragX > 40 ? 'scale(1.05)' : 'scale(1)',
                }}
              >Bewaren →</div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center mt-16">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface)' }}>{CHECK_DONE}</div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Alles bekeken</h2>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Geen vacatures meer in de wachtrij.</p>
            <Link href="/" className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Opnieuw zoeken</Link>
          </div>
        )
      )}

      {tab === 'saved' && (
        savedLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-16">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Laden…</p>
          </div>
        ) : saved.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center mt-16">
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
              return (
                <div key={app.id} className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: `${col}22`, color: col }}>{src || '?'}</span>
                      <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                    </div>
                    <button onClick={() => removeFromSaved(app.id)}
                      className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full opacity-40 hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--text2)' }}>✕</button>
                  </div>
                  <p className="font-semibold text-base leading-snug" style={{ color: 'var(--text)' }}>{job?.title || 'Onbekend'}</p>
                  <div className="flex gap-2">
                    {job?.url && (
                      <a href={job.url} target="_blank" rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl"
                        style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>Openen ↗</a>
                    )}
                    <button
                      onClick={() => handleApplyPress(app)}
                      disabled={isGenerating || !!applyLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
                      style={{ background: 'rgba(110,231,183,0.12)', color: 'var(--green)' }}
                    >
                      {isGenerating
                        ? <Lottie animationData={loaderDots} loop autoplay style={{ width: 36, height: 22 }} />
                        : <><Send className="w-3.5 h-3.5" /> Solliciteer</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'applied' && (
        appliedLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 mt-16">
            <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Laden…</p>
          </div>
        ) : applied.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center mt-16">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface)' }}>{CLIPBOARD}</div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Nog niet gesolliciteerd</h2>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Druk op &quot;Solliciteer&quot; bij bewaarde vacatures om ze hier bij te houden.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-8">
            {applied.map((app) => {
              const job = app.jobs;
              const src = job?.source || '';
              const col = SOURCE_COLORS[src] || 'var(--text2)';
              const hasResume = !!(app.cover_letter_draft || (app.resume_bullets_draft?.length > 0));
              return (
                <div key={app.id} className="rounded-2xl p-4 flex flex-col gap-2"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: `${col}22`, color: col }}>{src || '?'}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--text2)' }}>{job?.company || ''}</span>
                    {typeof app.match_score === 'number' && app.match_score > 0 && (
                      <span className="ml-auto text-xs font-bold tabular-nums flex-shrink-0"
                        style={{ color: scoreColor(app.match_score) }}>{app.match_score}%</span>
                    )}
                  </div>
                  <p className="font-semibold text-base leading-snug" style={{ color: 'var(--text)' }}>{job?.title || 'Onbekend'}</p>
                  {app.applied_at && (
                    <p className="text-xs" style={{ color: 'var(--text2)' }}>
                      Gesolliciteerd op {new Date(app.applied_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  <div className="flex gap-2 mt-1">
                    {job?.url && (
                      <a href={job.url} target="_blank" rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl"
                        style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>Openen ↗</a>
                    )}
                    {hasResume && (
                      <button onClick={() => openAppliedModal(app)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-xl"
                        style={{ background: 'rgba(191,90,242,0.12)', color: '#bf5af2' }}>
                        <FileText className="w-3.5 h-3.5" /> Bekijk brief
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
