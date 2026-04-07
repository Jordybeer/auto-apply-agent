"use client";

import { useState, useEffect } from 'react';
import { JobTitleInsights, WeightedTitle, TagHit } from '@/components/JobTitleInsights';

type Props = {
  topUsed: WeightedTitle[];
  topTags: TagHit[];
};

export function JobTitleInsightsClient({ topUsed, topTags }: Props) {
  const [suggestedUnused, setSuggestedUnused] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (topUsed.length === 0) { setLoading(false); return; }
    fetch('/api/title-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topUsed }),
    })
      .then((r) => r.json())
      .then((data) => setSuggestedUnused(data.suggestions ?? []))
      .catch(() => setSuggestedUnused([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page-shell flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Inzichten</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Analyse van je sollicitatiepatroon + slimmere zoektermen.</p>
      </div>
      <JobTitleInsights
        topUsed={topUsed}
        topTags={topTags}
        suggestedUnused={suggestedUnused}
        loading={loading}
      />
    </main>
  );
}
