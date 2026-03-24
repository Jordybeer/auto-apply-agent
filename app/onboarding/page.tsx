'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'scrape' | 'groq';

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('scrape');
  const [scrapeKey, setScrapeKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleScrapeSubmit = async () => {
    if (!scrapeKey.trim()) return;
    setLoading(true);
    setError('');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrape_api_key: scrapeKey }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setStep('groq');
    } else {
      setError(data.error || 'Er ging iets mis');
    }
  };

  const handleGroqSubmit = async () => {
    if (!groqKey.trim()) return;
    setLoading(true);
    setError('');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groq_api_key: groqKey }),
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

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: '#6366f1' }} />
          <div className="w-8 h-px" style={{ background: step === 'groq' ? '#6366f1' : '#2a2a32' }} />
          <div className="w-2 h-2 rounded-full" style={{ background: step === 'groq' ? '#6366f1' : '#2a2a32' }} />
        </div>

        {step === 'scrape' && (
          <>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-3xl">🔑</div>
              <h1 className="text-white text-2xl font-semibold tracking-tight">Scraper API Key</h1>
              <p className="text-zinc-500 text-sm">Stap 1 van 2 — vereist om vacatures te scrapen</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 text-sm">
              <p className="text-zinc-300 font-medium">Hoe krijg je een scrape.do key?</p>
              <ol className="text-zinc-400 space-y-2 list-none">
                <li className="flex gap-2">
                  <span className="text-blue-400 font-medium shrink-0">1.</span>
                  Ga naar <a href="https://scrape.do" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline underline-offset-2">scrape.do</a>
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

            <div className="space-y-3">
              <input
                type="password"
                value={scrapeKey}
                onChange={(e) => setScrapeKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScrapeSubmit()}
                placeholder="Plak je scrape.do token..."
                className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 placeholder-zinc-600 font-mono"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                onClick={handleScrapeSubmit}
                disabled={loading || !scrapeKey.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium py-3 rounded-xl transition-colors"
              >
                {loading ? 'Opslaan...' : 'Volgende →'}
              </button>
            </div>
          </>
        )}

        {step === 'groq' && (
          <>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-3xl">🤖</div>
              <h1 className="text-white text-2xl font-semibold tracking-tight">Groq API Key</h1>
              <p className="text-zinc-500 text-sm">Stap 2 van 2 — vereist voor AI-scoring en motivatiebrieven</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 text-sm">
              <p className="text-zinc-300 font-medium">Hoe krijg je een Groq key?</p>
              <ol className="text-zinc-400 space-y-2 list-none">
                <li className="flex gap-2">
                  <span className="text-purple-400 font-medium shrink-0">1.</span>
                  Ga naar <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline underline-offset-2">console.groq.com</a>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-400 font-medium shrink-0">2.</span>
                  Maak een gratis account aan
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-400 font-medium shrink-0">3.</span>
                  Ga naar API Keys → klik <span className="text-white font-mono bg-zinc-800 px-1 rounded">Create API Key</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-400 font-medium shrink-0">4.</span>
                  Plak hem hieronder
                </li>
              </ol>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGroqSubmit()}
                placeholder="Plak je Groq API key..."
                className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 placeholder-zinc-600 font-mono"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                onClick={handleGroqSubmit}
                disabled={loading || !groqKey.trim()}
                className="w-full py-3 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ background: '#7c3aed' }}
              >
                {loading ? 'Opslaan...' : 'Aan de slag →'}
              </button>
              <button
                onClick={() => router.push('/')}
                className="w-full py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                Overslaan (kan later worden ingesteld)
              </button>
            </div>
          </>
        )}

        <p className="text-center text-zinc-600 text-xs">
          Je keys worden veilig opgeslagen en nooit gedeeld.
        </p>
      </div>
    </div>
  );
}
