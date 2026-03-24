'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'adzuna' | 'groq' | 'cv';

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('adzuna');
  const [adzunaAppId, setAdzunaAppId] = useState('');
  const [adzunaAppKey, setAdzunaAppKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const stepIndex = { adzuna: 0, groq: 1, cv: 2 }[step];

  const handleAdzunaSubmit = async () => {
    if (!adzunaAppId.trim() || !adzunaAppKey.trim()) return;
    setLoading(true); setError('');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adzuna_app_id: adzunaAppId, adzuna_app_key: adzunaAppKey }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) setStep('groq'); else setError(data.error || 'Er ging iets mis');
  };

  const handleGroqSubmit = async () => {
    if (!groqKey.trim()) return;
    setLoading(true); setError('');
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groq_api_key: groqKey }) });
    const data = await res.json();
    setLoading(false);
    if (data.success) setStep('cv'); else setError(data.error || 'Er ging iets mis');
  };

  const handleCvSubmit = async (skip = false) => {
    setLoading(true); setError('');
    if (!skip) {
      if (!cvFile) { setLoading(false); return; }
      const form = new FormData();
      form.append('cv', cvFile);
      const res = await fetch('/api/cv', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) { setLoading(false); setError(data.error || 'Upload mislukt'); return; }
    }
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_onboarded: true }) });
    const data = await res.json();
    setLoading(false);
    if (data.success) router.push('/'); else setError(data.error || 'Er ging iets mis');
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">

        <div className="flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <>
              <div key={`dot-${i}`} className="w-2 h-2 rounded-full transition-colors" style={{ background: i <= stepIndex ? '#6366f1' : '#2a2a32' }} />
              {i < 2 && <div key={`line-${i}`} className="w-8 h-px transition-colors" style={{ background: i < stepIndex ? '#6366f1' : '#2a2a32' }} />}
            </>
          ))}
        </div>

        {step === 'adzuna' && (
          <>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-3xl">🔑</div>
              <h1 className="text-white text-2xl font-semibold tracking-tight">Adzuna API</h1>
              <p className="text-zinc-500 text-sm">Stap 1 van 3 — vereist om vacatures op te halen</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 text-sm">
              <p className="text-zinc-300 font-medium">Hoe krijg je Adzuna credentials?</p>
              <ol className="text-zinc-400 space-y-2 list-none">
                <li className="flex gap-2"><span className="text-blue-400 font-medium shrink-0">1.</span>Ga naar <a href="https://developer.adzuna.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline underline-offset-2">developer.adzuna.com</a></li>
                <li className="flex gap-2"><span className="text-blue-400 font-medium shrink-0">2.</span>Maak een gratis account aan</li>
                <li className="flex gap-2"><span className="text-blue-400 font-medium shrink-0">3.</span>Dashboard → kopieer je <span className="text-white font-mono bg-zinc-800 px-1 rounded">App ID</span> en <span className="text-white font-mono bg-zinc-800 px-1 rounded">App Key</span></li>
              </ol>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={adzunaAppId}
                onChange={(e) => setAdzunaAppId(e.target.value)}
                placeholder="App ID"
                className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 placeholder-zinc-600 font-mono"
              />
              <input
                type="password"
                value={adzunaAppKey}
                onChange={(e) => setAdzunaAppKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdzunaSubmit()}
                placeholder="App Key"
                className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 placeholder-zinc-600 font-mono"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                onClick={handleAdzunaSubmit}
                disabled={loading || !adzunaAppId.trim() || !adzunaAppKey.trim()}
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
              <p className="text-zinc-500 text-sm">Stap 2 van 3 — vereist voor AI-scoring & motivatiebrieven</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 text-sm">
              <p className="text-zinc-300 font-medium">Hoe krijg je een Groq key?</p>
              <ol className="text-zinc-400 space-y-2 list-none">
                <li className="flex gap-2"><span className="text-purple-400 font-medium shrink-0">1.</span>Ga naar <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline underline-offset-2">console.groq.com</a></li>
                <li className="flex gap-2"><span className="text-purple-400 font-medium shrink-0">2.</span>Maak een gratis account aan</li>
                <li className="flex gap-2"><span className="text-purple-400 font-medium shrink-0">3.</span>API Keys → <span className="text-white font-mono bg-zinc-800 px-1 rounded">Create API Key</span></li>
              </ol>
            </div>
            <div className="space-y-3">
              <input type="password" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGroqSubmit()} placeholder="Plak je Groq API key..." className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 placeholder-zinc-600 font-mono" />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={handleGroqSubmit} disabled={loading || !groqKey.trim()} className="w-full py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-40" style={{ background: '#7c3aed' }}>{loading ? 'Opslaan...' : 'Volgende →'}</button>
            </div>
          </>
        )}

        {step === 'cv' && (
          <>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-3xl">📎</div>
              <h1 className="text-white text-2xl font-semibold tracking-tight">Upload je CV</h1>
              <p className="text-zinc-500 text-sm">Stap 3 van 3 — voor gepersonaliseerde motivatiebrieven</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-400">
              Je CV wordt veilig opgeslagen per account. Alleen PDF toegestaan, max 5MB.
            </div>
            <div className="space-y-3">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed cursor-pointer transition-colors"
                style={{ borderColor: cvFile ? '#6366f1' : '#2a2a32', background: cvFile ? 'rgba(99,102,241,0.06)' : '#0f0f11' }}
              >
                {cvFile ? (
                  <>
                    <span className="text-2xl">✅</span>
                    <p className="text-sm font-medium text-white">{cvFile.name}</p>
                    <p className="text-xs" style={{ color: '#6b6b7b' }}>{(cvFile.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">📄</span>
                    <p className="text-sm text-zinc-400">Klik om een PDF te kiezen</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCvFile(f); }} />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button onClick={() => handleCvSubmit(false)} disabled={loading || !cvFile} className="w-full py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-40" style={{ background: '#6366f1' }}>{loading ? 'Uploaden...' : 'CV opslaan & starten →'}</button>
              <button onClick={() => handleCvSubmit(true)} disabled={loading} className="w-full py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-400 transition-colors disabled:opacity-40">Overslaan (kan later worden ingesteld)</button>
            </div>
          </>
        )}

        <p className="text-center text-zinc-600 text-xs">Je gegevens worden veilig opgeslagen en nooit gedeeld.</p>
      </div>
    </div>
  );
}
