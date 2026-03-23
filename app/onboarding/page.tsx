'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError('');

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrape_api_key: key }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.success) {
      router.push('/');
    } else {
      setError(data.error || 'Er ging iets mis');
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-3xl">
            🔑
          </div>
          <h1 className="text-white text-2xl font-semibold tracking-tight">API Key instellen</h1>
          <p className="text-zinc-500 text-sm">Vereist om vacatures te scrapen</p>
        </div>

        {/* Uitleg */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 text-sm">
          <p className="text-zinc-300 font-medium">Hoe krijg je een scrape.do key?</p>
          <ol className="text-zinc-400 space-y-2 list-none">
            <li className="flex gap-2">
              <span className="text-blue-400 font-medium shrink-0">1.</span>
              Ga naar{' '}
              <a href="https://scrape.do" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline underline-offset-2">
                scrape.do
              </a>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-medium shrink-0">2.</span>
              Maak een gratis account aan (1000 requests/maand gratis)
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-medium shrink-0">3.</span>
              Ga naar je dashboard → kopieer je <span className="text-white font-mono bg-zinc-800 px-1 rounded">Token</span>
            </li>
            <li className="flex gap-2">
              <span className="text-blue-400 font-medium shrink-0">4.</span>
              Plak hem hieronder
            </li>
          </ol>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Plak je scrape.do token..."
            className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 placeholder-zinc-600 font-mono"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading || !key.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? 'Opslaan...' : 'Doorgaan →'}
          </button>
        </div>

        <p className="text-center text-zinc-600 text-xs">
          Je key wordt veilig opgeslagen en nooit gedeeld.
        </p>
      </div>
    </div>
  );
}