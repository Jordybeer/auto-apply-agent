'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  applicationId: string;
  /** Called with updated data after successful rematch */
  onRematched: (data: { match_score: number; reasoning: string; cover_letter_draft: string }) => void;
}

export default function RematchButton({ applicationId, onRematched }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const rematch = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const d = await res.json();
      onRematched({
        match_score:        d.match_score ?? 0,
        reasoning:          d.reasoning ?? '',
        cover_letter_draft: d.cover_letter_draft ?? '',
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rematch mislukt');
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={rematch}
        disabled={loading}
        className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 disabled:opacity-40"
        style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
        title="Herbereken score"
        aria-label="Herbereken score"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
      {error && (
        <span className="text-xs" style={{ color: 'var(--red)' }}>{error}</span>
      )}
    </div>
  );
}
