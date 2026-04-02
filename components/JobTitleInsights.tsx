'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type WeightedTitle = {
  title: string;
  weight: number;
  count: number;
};

export type TagHit = {
  tag: string;
  hits: number;
  applied: number;
};

type Props = {
  topUsed: WeightedTitle[];
  topTags: TagHit[];
  suggestedUnused: string[];
  loading?: boolean;
};

const spring = { type: 'spring' as const, stiffness: 500, damping: 35 };

export function JobTitleInsights({ topUsed, topTags, suggestedUnused, loading }: Props) {
  const [added, setAdded] = useState<Record<string, 'adding' | 'done' | 'error'>>({});

  const addToTags = async (title: string) => {
    if (added[title]) return;
    setAdded(prev => ({ ...prev, [title]: 'adding' }));
    try {
      const settingsRes = await fetch('/api/settings');
      const settings = await settingsRes.json();
      const current: string[] = settings.keywords ?? [];
      const lower = title.toLowerCase();
      if (!current.includes(lower)) {
        const next = [...current, lower];
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keywords: next }),
        });
        const d = await res.json();
        if (!d.success) throw new Error();
        try { localStorage.setItem('ja_tags', JSON.stringify(next)); } catch {}
      }
      setAdded(prev => ({ ...prev, [title]: 'done' }));
    } catch {
      setAdded(prev => ({ ...prev, [title]: 'error' }));
      setTimeout(() => setAdded(prev => { const n = { ...prev }; delete n[title]; return n; }), 2000);
    }
  };

  const maxWeight  = topUsed[0]?.weight || 1;
  const maxHits    = topTags[0]?.hits   || 1;

  const Skeleton = ({ rows = 5 }: { rows?: number }) => (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: 'var(--surface2)' }} />
      ))}
    </div>
  );

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-8">

      {/* Jobtitels */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Jobtitels waar je nu op focust</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Opgeslagen + verstuurde sollicitaties (applied telt dubbel).</p>
        </div>
        {loading ? <Skeleton /> : topUsed.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--text2)' }}>Nog geen opgeslagen of verstuurde sollicitaties.</p>
        ) : (
          <div className="space-y-2">
            {topUsed.map((t, i) => {
              const barW = Math.round((t.weight / maxWeight) * 100);
              return (
                <div key={t.title}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                >
                  <span className="text-xs font-bold w-4 text-right flex-shrink-0" style={{ color: 'var(--text2)' }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate" style={{ color: 'var(--text)' }}>{t.title}</span>
                    <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${barW}%`, background: 'var(--accent)', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                  <span className="text-xs flex-shrink-0 px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
                    {t.count}×
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tag hits */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Tags met de meeste hits</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>Welke zoektermen de meeste vacatures opleverden. Paars = verstuurde sollicitaties.</p>
        </div>
        {loading ? <Skeleton rows={6} /> : topTags.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--text2)' }}>Nog geen tag-data. Ververs je vacatures om tags te registreren.</p>
        ) : (
          <div className="space-y-2">
            {topTags.map((t, i) => {
              const totalBar  = Math.round((t.hits    / maxHits) * 100);
              const appliedBar = t.hits > 0 ? Math.round((t.applied / t.hits) * totalBar) : 0;
              return (
                <div key={t.tag}
                  className="px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold w-4 text-right flex-shrink-0" style={{ color: 'var(--text2)' }}>{i + 1}</span>
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.tag}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
                        {t.hits} hit{t.hits !== 1 ? 's' : ''}
                      </span>
                      {t.applied > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                          {t.applied} gesolliciteerd
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div className="relative h-full rounded-full" style={{ width: `${totalBar}%`, background: 'rgba(99,102,241,0.25)', transition: 'width 0.5s ease' }}>
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${appliedBar > 0 ? (appliedBar / totalBar) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.5s ease 0.1s' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* AI suggesties */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Nieuwe zoektermen om te proberen</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>AI-suggesties op basis van je profiel. Tik om toe te voegen.</p>
        </div>
        {loading ? <Skeleton /> : suggestedUnused.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--text2)' }}>Geen suggesties beschikbaar.</p>
        ) : (
          <div className="space-y-2">
            {suggestedUnused.map((title) => {
              const state    = added[title];
              const isDone   = state === 'done';
              const isAdding = state === 'adding';
              const isError  = state === 'error';
              return (
                <motion.button
                  key={title}
                  type="button"
                  onClick={() => addToTags(title)}
                  disabled={isDone || isAdding}
                  whileTap={isDone ? undefined : { scale: 0.97 }}
                  transition={spring}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left"
                  style={{
                    background: isDone ? 'rgba(74,222,128,0.10)' : isError ? 'rgba(248,113,113,0.10)' : 'var(--surface2)',
                    border: `1px solid ${isDone ? 'rgba(74,222,128,0.35)' : isError ? 'rgba(248,113,113,0.35)' : 'var(--border)'}`,
                    transition: 'background 0.2s ease, border-color 0.2s ease',
                    cursor: isDone ? 'default' : 'pointer',
                    opacity: isDone ? 0.75 : 1,
                  }}
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{title}</span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={state ?? 'idle'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs flex-shrink-0 ml-2 font-medium"
                      style={{ color: isDone ? 'var(--green)' : isError ? 'var(--red)' : 'var(--text2)' }}
                    >
                      {isDone ? '✓ Toegevoegd' : isAdding ? '…' : isError ? 'Mislukt' : '+ Voeg toe'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
