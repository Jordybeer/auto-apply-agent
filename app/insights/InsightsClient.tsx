"use client";

import { useState, useEffect } from 'react';
import { JobTitleInsights, WeightedTitle } from '@/components/JobTitleInsights';

type Props = {
  topUsed: WeightedTitle[];
};

export function JobTitleInsightsClient({ topUsed }: Props) {
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
    <main className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Jobtitel Insights</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Analyse van je sollicitatiepatroon + slimmere zoektermen.</p>
      </div>
      <JobTitleInsights topUsed={topUsed} suggestedUnused={suggestedUnused} loading={loading} />
    </main>
  );
}
