'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type Props = {
  kpis: {
    totalApplied: number;
    avgScore:     number;
    responseRate: number;
    activeCount:  number;
  };
  weeklyActivity:  { week: string; count: number }[];
  funnel: {
    saved:      number;
    applied:    number;
    inProgress: number;
    rejected:   number;
  };
  topUsed:         { title: string; weight: number; count?: number }[];
  suggestedUnused: string[];
  loading?:        boolean;
};

function useCountUp(target: number, skip: boolean): number {
  const [val, setVal] = useState(skip ? target : 0);
  useEffect(() => {
    if (skip) { setVal(target); return; }
    setVal(0);
    const start = performance.now();
    let rafId: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 900, 1);
      setVal(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, skip]);
  return val;
}

export function InsightsClient({
  kpis,
  weeklyActivity,
  funnel,
  topUsed,
  suggestedUnused,
  loading = false,
}: Props) {
  const prefersReduced = useReducedMotion() ?? false;

  const [suggestions, setSuggestions]  = useState<string[]>(suggestedUnused);
  const [loadingSugg, setLoadingSugg]  = useState(suggestedUnused.length === 0 && topUsed.length > 0);
  const [activeBar, setActiveBar]      = useState<number | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current || suggestedUnused.length > 0 || topUsed.length === 0) return;
    hasFetched.current = true;
    fetch('/api/title-suggestions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ topUsed }),
    })
      .then((r) => r.json())
      .then((d: { suggestions?: string[] }) => setSuggestions(d.suggestions ?? []))
      .catch(() => {})
      .finally(() => setLoadingSugg(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const maxCount  = weeklyActivity.length > 0 ? Math.max(...weeklyActivity.map((w) => w.count))  : 1;
  const maxWeight = topUsed.length > 0         ? Math.max(...topUsed.map((t) => t.weight))        : 1;

  return (
    <main className="page-shell flex flex-col gap-3">

      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Inzichten</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
          Analyse van je sollicitatiepatroon
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Gesolliciteerd" color="var(--text)"          value={kpis.totalApplied} loading={loading} reduced={prefersReduced} />
        <KpiCard label="Gem. Score"     color="var(--accent-bright)" value={kpis.avgScore}     suffix="%" loading={loading} reduced={prefersReduced} />
        <KpiCard label="Reactie %"      color="var(--green)"         value={kpis.responseRate} suffix="%" loading={loading} reduced={prefersReduced} />
        <KpiCard label="In behandeling" color="var(--blue)"          value={kpis.activeCount}  loading={loading} reduced={prefersReduced} />
      </div>

      <div className="glass-card rounded-2xl p-3">
        <span className="label-overline">Activiteit per week</span>
        <div className="flex items-end gap-1 mt-2" style={{ height: '3.5rem' }}>
          {weeklyActivity.map(({ week, count }, i) => (
            <div key={week} className="flex-1 flex flex-col items-center justify-end h-full relative cursor-pointer" onClick={() => setActiveBar(activeBar === i ? null : i)}>
              {activeBar === i && (
                <span
                  className="absolute rounded px-1"
                  style={{ top: 0, fontSize: '10px', background: 'var(--accent-dim)', color: 'var(--accent-bright)', lineHeight: '16px', whiteSpace: 'nowrap' }}
                >
                  {count}
                </span>
              )}
              {prefersReduced ? (
                <div
                  style={{
                    width: '100%',
                    height: `${(count / maxCount) * 100}%`,
                    minHeight: '4px',
                    background: 'linear-gradient(to top, var(--accent), #8b5cf6)',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              ) : (
                <motion.div
                  initial={{ height: '4px' }}
                  animate={{ height: `${(count / maxCount) * 100}%` }}
                  transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    width: '100%',
                    minHeight: '4px',
                    background: 'linear-gradient(to top, var(--accent), #8b5cf6)',
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              )}
              <span
                className="mt-1 text-center"
                style={{ fontSize: '10px', color: 'var(--text4)', lineHeight: 1 }}
              >
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-3">
        <span className="label-overline">Status overzicht</span>
        <div className="grid grid-cols-4 gap-1 mt-2">
          <Pill label="Opgeslagen"     count={funnel.saved}       bg="var(--accent-dim)"  color="var(--accent-bright)" border="rgba(129,140,248,0.25)" />
          <Pill label="Gesolliciteerd" count={funnel.applied}     bg="var(--blue-dim)"    color="var(--blue)"          border="rgba(96,165,250,0.20)"  />
          <Pill label="In behandeling" count={funnel.inProgress}  bg="var(--yellow-dim)"  color="var(--yellow)"        border="rgba(251,191,36,0.25)"  />
          <Pill label="Afgewezen"      count={funnel.rejected}    bg="var(--red-dim)"     color="var(--red)"           border="rgba(251,113,133,0.25)" />
        </div>
      </div>

      <div className="glass-card rounded-2xl p-3">
        <span className="label-overline">Meest gezochte functies</span>
        <div className="flex flex-col gap-1.5 mt-2">
          {topUsed.map(({ title, weight }, i) => {
            const pct = Math.round((weight / maxWeight) * 100);
            return (
              <div key={title}>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{title}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent-bright)' }}>
                    {pct}%
                  </span>
                </div>
                <div
                  className="w-full rounded-full overflow-hidden"
                  style={{ height: '4px', background: 'var(--accent-dim)' }}
                >
                  {prefersReduced ? (
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: 'var(--accent)' }}
                    />
                  ) : (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-full"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-3">
        <span className="label-overline">AI-aanbevelingen</span>
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {loading || loadingSugg ? (
            <>
              <div className="skeleton rounded-full" style={{ height: 22, width: 148 }} />
              <div className="skeleton rounded-full" style={{ height: 22, width: 120 }} />
              <div className="skeleton rounded-full" style={{ height: 22, width: 132 }} />
            </>
          ) : suggestions.length > 0 ? (
            suggestions.map((chip) => (
              <SuggestionChip key={chip} title={chip} />
            ))
          ) : suggestions.length === 0 ? (
            <>
              <div className="skeleton rounded-full" style={{ height: 22, width: 148 }} />
              <div className="skeleton rounded-full" style={{ height: 22, width: 120 }} />
              <div className="skeleton rounded-full" style={{ height: 22, width: 132 }} />
            </>
          ) : null}
        </div>
      </div>

    </main>
  );
}

function KpiCard({
  label, color, loading, value, suffix = '', reduced,
}: {
  label:    string;
  color:    string;
  loading:  boolean;
  value:    number;
  suffix?:  string;
  reduced:  boolean;
}) {
  const animated = useCountUp(value, loading || reduced);
  return (
    <div className="glass-card rounded-2xl p-3 flex flex-col gap-0.5">
      {loading ? (
        <div className="skeleton rounded-lg" style={{ height: 28, width: '60%', marginBottom: 2 }} />
      ) : (
        <span className="text-xl font-bold leading-none" style={{ color }}>
          {animated}{suffix}
        </span>
      )}
      <span className="label-overline">{label}</span>
    </div>
  );
}

function Pill({
  label, count, bg, color, border,
}: {
  label:  string;
  count:  number;
  bg:     string;
  color:  string;
  border: string;
}) {
  return (
    <div
      className="flex flex-col items-center rounded-full px-2 py-0.5 text-xs font-semibold shrink-0"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: '9px', opacity: 0.65, lineHeight: 1.2 }}>{count}</span>
    </div>
  );
}

function Arrow() {
  return (
    <span className="shrink-0 text-xs" style={{ color: 'var(--text4)', margin: '0 1px' }}>→</span>
  );
}

function SuggestionChip({ title }: { title: string }) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'added'>('idle');

  const handlePress = () => {
    if (status !== 'idle') return;
    setStatus('pending');
    fetch('/api/job-pool/add', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title }),
    })
      .then(() => setStatus('added'))
      .catch(() => setStatus('idle'));
  };

  const added   = status === 'added';
  const pending = status === 'pending';

  return (
    <button
      onClick={handlePress}
      disabled={status !== 'idle'}
      className="rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1"
      style={{
        background:           added ? 'var(--accent-dim)' : 'linear-gradient(135deg, var(--accent-dim), rgba(45,212,191,0.08))',
        color:                added ? 'var(--text4)'      : 'var(--accent-bright)',
        border:               `1px solid ${added ? 'transparent' : 'rgba(129,140,248,0.22)'}`,
        backdropFilter:       'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        cursor:               status === 'idle' ? 'pointer' : 'default',
      }}
    >
      {pending && (
        <svg className="animate-spin" width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
        </svg>
      )}
      {added && <span>✓</span>}
      {title}
    </button>
  );
}
