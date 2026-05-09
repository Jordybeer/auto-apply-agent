'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import LegalLinks from '@/components/LegalLinks';
import posthog from 'posthog-js';

export default function OnboardingPage() {
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (data.success) {
      posthog.capture('onboarding_completed', { skipped_cv: skip });
      localStorage.setItem('ja_walkthrough_pending', '1');
      setDone(true);
      setTimeout(() => { window.location.href = '/'; }, 1000);
    } else {
      setError(data.error || 'Er ging iets mis');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-8">

        {done && (
          <div className="text-center flex flex-col gap-4 items-center py-8">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl glass">✅</div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Klaar!</h1>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Je wordt doorgestuurd…</p>
          </div>
        )}

        {!done && (
          <>
            <div className="text-center flex flex-col gap-2">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl glass">📎</div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Upload je CV</h1>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>Voor gepersonaliseerde AI-scores &amp; motivatiebrieven</p>
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

        <LegalLinks />
      </div>
    </div>
  );
}
