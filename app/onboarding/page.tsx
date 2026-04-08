'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'groq' | 'cv';

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('groq');
  const [groqKey, setGroqKey] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const stepIndex = { groq: 0, cv: 1 }[step];

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
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2">
          {[0, 1].map((i) => (
            <>
              <div key={`dot-${i}`} className="w-2 h-2 rounded-full transition-colors"
                style={{ background: i <= stepIndex ? 'var(--accent)' : 'var(--surface2)' }} />
              {i < 1 && <div key={`line-${i}`} className="w-8 h-px transition-colors"
                style={{ background: i < stepIndex ? 'var(--accent)' : 'var(--surface2)' }} />}
            </>
          ))}
        </div>

        {step === 'groq' && (
          <>
            <div className="text-center flex flex-col gap-2">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl glass">🤖</div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Groq API Key</h1>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>Stap 1 van 2 — vereist voor AI-scoring &amp; motivatiebrieven</p>
            </div>
            <div className="glass-card rounded-2xl p-4 flex flex-col gap-3 text-sm">
              <p className="font-medium" style={{ color: 'var(--text)' }}>Hoe krijg je een Groq key?</p>
              <ol className="flex flex-col gap-2 list-none" style={{ color: 'var(--text2)' }}>
                <li className="flex gap-2"><span className="font-medium flex-shrink-0" style={{ color: 'var(--accent-bright)' }}>1.</span>Ga naar <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: 'var(--accent-bright)' }}>console.groq.com</a></li>
                <li className="flex gap-2"><span className="font-medium flex-shrink-0" style={{ color: 'var(--accent-bright)' }}>2.</span>Maak een gratis account aan</li>
                <li className="flex gap-2"><span className="font-medium flex-shrink-0" style={{ color: 'var(--accent-bright)' }}>3.</span>API Keys → <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text)' }}>Create API Key</span></li>
              </ol>
            </div>
            <div className="flex flex-col gap-3">
              <input type="password" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleGroqSubmit()} placeholder="Plak je Groq API key..." className="field-input font-mono" />
              {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
              <button onClick={handleGroqSubmit} disabled={loading || !groqKey.trim()} className="btn btn-lg btn-primary w-full">
                {loading ? 'Opslaan…' : 'Volgende →'}
              </button>
            </div>
          </>
        )}

        {step === 'cv' && (
          <>
            <div className="text-center flex flex-col gap-2">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl glass">📎</div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Upload je CV</h1>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>Stap 2 van 2 — voor gepersonaliseerde motivatiebrieven</p>
            </div>
            <div className="glass-card rounded-2xl p-4 text-sm" style={{ color: 'var(--text2)' }}>
              Je CV wordt veilig opgeslagen per account. Alleen PDF toegestaan, max 5MB.
            </div>
            <div className="flex flex-col gap-3">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed cursor-pointer transition-colors"
                style={{
                  borderColor: cvFile ? 'var(--accent)' : 'var(--border)',
                  background: cvFile ? 'var(--accent-dim)' : 'var(--surface2)',
                }}
              >
                {cvFile ? (
                  <>
                    <span className="text-2xl">✅</span>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{cvFile.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text2)' }}>{(cvFile.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">📄</span>
                    <p className="text-sm" style={{ color: 'var(--text2)' }}>Klik om een PDF te kiezen</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCvFile(f); }} />
              {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
              <button onClick={() => handleCvSubmit(false)} disabled={loading || !cvFile} className="btn btn-lg btn-primary w-full">
                {loading ? 'Uploaden…' : 'CV opslaan & starten →'}
              </button>
              <button onClick={() => handleCvSubmit(true)} disabled={loading} className="text-xs py-2 rounded-xl transition-colors disabled:opacity-40" style={{ color: 'var(--text3)' }}>
                Overslaan (kan later worden ingesteld)
              </button>
            </div>
          </>
        )}

        <p className="text-center text-xs" style={{ color: 'var(--text4)' }}>Je gegevens worden veilig opgeslagen en nooit gedeeld.</p>
      </div>
    </div>
  );
}
