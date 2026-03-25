"use client";

import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Lottie from 'lottie-react';
import loaderDots from './lotties/loader-dots.json';
import { ChevronDown, ChevronRight, X, Copy, Check } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

const prettyMs = (ms?: number) => {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const DEFAULT_TAGS = ['helpdesk', 'it support', 'servicedesk', 'applicatiebeheerder'];

function ls<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

const EMOJIS = ['\uD83D\uDCB5', '\uD83D\uDCB4', '\uD83D\uDCB6', '\uD83D\uDCB7', '\uD83E\uDD11'];
const COUNT  = 22;

type Bill = {
  x: number; y: number;
  size: number; speed: number;
  drift: number; rot: number; rotSpeed: number;
  emoji: string; alpha: number;
  spawned: boolean; // true = newly spawned at top, false = pre-seeded anywhere
};

function makeBill(atTop: boolean): Bill {
  return {
    x:        Math.random() * window.innerWidth,
    y:        atTop ? -(Math.random() * 80 + 20) : Math.random() * window.innerHeight,
    size:     Math.random() * 14 + 16,
    speed:    Math.random() * 0.8 + 0.4,
    drift:    (Math.random() - 0.5) * 0.5,
    rot:      Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.018,
    emoji:    EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    alpha:    Math.random() * 0.15 + 0.06,
    spawned:  atTop,
  };
}

function MoneyRain({ active, draining, onDrained }: {
  active: boolean;
  draining: boolean;
  onDrained: () => void;
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const billsRef    = useRef<Bill[]>([]);
  const activeRef   = useRef(active);
  const drainingRef = useRef(draining);
  const rafRef      = useRef<number>(0);

  // keep refs in sync
  useEffect(() => { activeRef.current   = active;   }, [active]);
  useEffect(() => { drainingRef.current = draining; }, [draining]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Seed initial bills scattered across the screen
    billsRef.current = Array.from({ length: COUNT }, () => makeBill(false));

    let spawnTimer = 0;

    const tick = (ts: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn new bills while active and not draining
      if (activeRef.current && !drainingRef.current) {
        if (ts - spawnTimer > 400) {
          spawnTimer = ts;
          if (billsRef.current.length < COUNT + 10) {
            billsRef.current.push(makeBill(true));
          }
        }
      }

      // Move and draw
      billsRef.current = billsRef.current.filter((b) => {
        b.y   += b.speed;
        b.x   += b.drift;
        b.rot += b.rotSpeed;
        // In drain mode remove bills that fell off; in active mode recycle them
        if (b.y > canvas.height + 80) {
          if (drainingRef.current) return false; // gone forever
          Object.assign(b, makeBill(true));      // recycle
        }
        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.font        = `${b.size}px serif`;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillText(b.emoji, -b.size / 2, b.size / 2);
        ctx.restore();
        return true;
      });

      // Signal done when all bills have drained off screen
      if (drainingRef.current && billsRef.current.length === 0) {
        onDrained();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
    />
  );
}

export default function Home() {
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState('');
  const [progress, setProgress] = useState(0);
  const [showLog, setShowLog]   = useState(false);
  const [runLog, setRunLog]     = useState<{ text: string; color: string | null }[]>([]);
  const [copied, setCopied]     = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const logEndRef               = useRef<HTMLDivElement>(null);
  const [tags, setTagsRaw]      = useState<string[]>(DEFAULT_TAGS);
  const [tagInput, setTagInput] = useState('');
  const inputRef   = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(false);

  // Money rain state: idle | raining | draining
  const [rainState, setRainState] = useState<'idle' | 'raining' | 'draining'>('idle');

  const onDrained = useCallback(() => setRainState('idle'), []);

  useEffect(() => {
    setTagsRaw(ls('ja_tags', DEFAULT_TAGS));
    setHydrated(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.auth.getUser().then(({ data }) => {
      const u    = data?.user;
      const name = u?.user_metadata?.full_name || u?.user_metadata?.name || u?.email?.split('@')[0] || null;
      setUsername(name);
    });
  }, []);

  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runLog, showLog]);

  const setTags = (fn: (prev: string[]) => string[]) => {
    setTagsRaw((prev) => {
      const next = fn(prev);
      try { localStorage.setItem('ja_tags', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const addTag = (raw: string) => {
    const val = raw.trim();
    if (!val || tags.includes(val)) { setTagInput(''); return; }
    setTags((prev) => [...prev, val]);
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) setTags((prev) => prev.slice(0, -1));
  };

  const log = (line: string) => {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRunLog((prev) => [...prev, { text: `${t}  ${line}`, color: null }]);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(runLog.map(l => l.text).join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const runPipeline = async () => {
    if (tags.length === 0) { setStatus('Add at least one search tag.'); return; }
    setRunLog([]);
    setCopied(false);
    setShowLog(true);
    setLoading(true);
    setProgress(3);
    setRainState('raining'); // 💸 start
    setStatus('Zoeken naar vacatures\u2026');
    log(`Tags: ${tags.join(', ')}`);

    try {
      setStatus('Scraping Adzuna\u2026');
      setProgress(10);

      const t0  = performance.now();
      const res = await fetch(
        `/api/scrape/stream?source=adzuna&tags=${encodeURIComponent(tags.join(','))}`,
        { method: 'POST' },
      );
      if (!res.body) throw new Error('No stream body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let scrapeDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'log') {
              log(event.message);
              setProgress((p) => Math.min(p + 2, 65));
            } else if (event.type === 'done') {
              const ms = Math.round(performance.now() - t0);
              log(`\u2713 adzuna inserted=${event.count} found=${event.total_found} (${prettyMs(ms)})`);
              scrapeDone = true;
            } else if (event.type === 'error') {
              const ms = Math.round(performance.now() - t0);
              log(`\u2717 adzuna: ${event.message} (${prettyMs(ms)})`);
              scrapeDone = true;
            }
          } catch {}
        }
      }

      if (!scrapeDone) log('\u2717 adzuna: stream ended without result');

      setProgress(70);
      setStatus('Wachtrij aanmaken\u2026');
      log('\u2192 process');

      const p0  = performance.now();
      const pr  = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: tags }) });
      const pMs = Math.round(performance.now() - p0);
      const pd  = await pr.json();

      if (!pr.ok) {
        const errMsg = pd.error || pd.message || `HTTP ${pr.status}`;
        setProgress(0); setStatus(`\u26a0\ufe0f ${errMsg}`); log(`\u2717 process: ${errMsg}`);
      } else if (pd.success) {
        setProgress(100);
        setStatus(`${pd.count || 0} jobs gevonden \u2014 bekijk ze snel!`);
        log(`\u2713 process queued=${pd.count || 0}${pd.failed ? ` (${pd.failed} mislukt)` : ''} (${prettyMs(pMs)})`);
      } else {
        setProgress(100); setStatus(pd.message || 'Niets nieuws gevonden.'); log(`\u2713 process: ${pd.message || 'niets nieuw'} (${prettyMs(pMs)})`);
      }
    } catch (err: any) {
      setProgress(0); setStatus(`Error: ${err.message}`); log(`ERROR: ${err.message}`);
    }

    setLoading(false);
    setRainState('draining'); // 💸 stop new spawns, let remaining fall off
  };

  if (!hydrated) return null;

  return (
    <main className="page-shell flex flex-col gap-6" style={{ position: 'relative' }}>

      {rainState !== 'idle' && (
        <MoneyRain
          active={rainState === 'raining'}
          draining={rainState === 'draining'}
          onDrained={onDrained}
        />
      )}

      <div className="flex flex-col gap-6" style={{ position: 'relative', zIndex: 1 }}>

        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="flex flex-col gap-0.5"
        >
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Hey{username ? `, ${username}` : ''} \uD83D\uDC4B
          </h1>
        </motion.div>

        {/* Search tags */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.07 }}
          className="rounded-2xl p-4 flex flex-col gap-3 cursor-text"
          onClick={() => inputRef.current?.focus()}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text2)' }}>Search tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full"
                style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                {tag}
                <button
                  onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                  className="flex items-center justify-center w-4 h-4 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--accent)' }}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={onTagKeyDown}
            onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
            placeholder="Geef een functie in\u2026"
            className="bg-transparent text-sm outline-none w-full"
            style={{ color: 'var(--text)' }}
          />
        </motion.div>

        {/* Run button */}
        <motion.button
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.14 }}
          onClick={runPipeline}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-base font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {loading ? 'Gestart\u2026' : 'Zoeken'}
        </motion.button>

        {/* Progress */}
        {(loading || progress > 0) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl px-4 py-4 flex flex-col gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex justify-between text-xs" style={{ color: 'var(--text2)' }}>
              <span className="flex items-center gap-2">
                {loading && <Lottie animationData={loaderDots} loop autoplay style={{ width: 32, height: 20 }} />}
                {status || 'Ready'}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: 'var(--accent)' }}
              />
            </div>
          </motion.div>
        )}

        {/* Logs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setShowLog((v) => !v)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text2)' }}>
              {showLog ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Live logs
            </button>
            {showLog && runLog.length > 0 && (
              <button
                onClick={copyLogs}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
                style={{ color: copied ? 'var(--green)' : 'var(--text2)', background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          {showLog && (
            <div
              className="rounded-xl p-3 text-xs max-h-48 overflow-auto font-mono flex flex-col gap-0.5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              {runLog.length ? runLog.map((entry, i) => (
                <span key={i} style={{ color: 'var(--text2)', opacity: 0.8 }}>
                  {entry.text}
                </span>
              )) : <span style={{ color: 'var(--text2)' }}>\u2014</span>}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* Queue link */}
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.21 }}
        >
          <Link
            href="/queue"
            className="rounded-2xl px-5 py-4 flex items-center justify-between group"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
          >
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Review Queue</p>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>Swipe to review scraped jobs</p>
            </div>
            <span className="text-xl group-hover:translate-x-1 transition-transform" style={{ color: 'var(--accent)' }}>\u2192</span>
          </Link>
        </motion.div>

      </div>
    </main>
  );
}
