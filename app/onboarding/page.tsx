'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import LegalLinks from '@/components/LegalLinks';
import SearchModeSelector from '@/components/SearchModeSelector';
import StudentJobForm from '@/components/StudentJobForm';
import PivotForm from '@/components/PivotForm';
import posthog from 'posthog-js';
import type { SearchMode, StudentJobPrefs, PivotPrefs } from '@/lib/search-mode';
import { MODE_LABELS } from '@/lib/search-mode';

const DEFAULT_STUDENT: StudentJobPrefs = {
  max_hours_per_week: 20, flexible_schedule: false,
  sectors: [], student_status: 'hoger_onderwijs', availability_from: null,
};
const DEFAULT_PIVOT: PivotPrefs = {
  target_sectors: [], transferable_skills: [], open_to_retraining: false,
};

type Step = 0 | 1 | 2 | 3;

const variants = {
  enter:  { opacity: 0, x: 28 },
  center: { opacity: 1, x: 0 },
  exit:   { opacity: 0, x: -28 },
};

export default function OnboardingPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  // CV step
  const [cvFile, setCvFile]     = useState<File | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError]   = useState('');

  // Mode step
  const [mode, setMode]               = useState<SearchMode>('career');
  const [studentPrefs, setStudentPrefs] = useState<StudentJobPrefs>(DEFAULT_STUDENT);
  const [pivotPrefs, setPivotPrefs]   = useState<PivotPrefs>(DEFAULT_PIVOT);

  // Flow
  const [step, setStep]     = useState<Step>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Progress dots: career = 2 steps, student/pivot = 3 steps
  const totalDots = mode === 'career' ? 2 : 3;
  const activeDot = step === 0 ? 0 : step === 1 ? 1 : 2;

  // ── Step 0 ─────────────────────────────────────────────────────
  async function handleCvNext(skip = false) {
    setCvLoading(true); setCvError('');
    if (!skip) {
      if (!cvFile) { setCvLoading(false); return; }
      const form = new FormData();
      form.append('cv', cvFile);
      const res  = await fetch('/api/cv', { method: 'POST', body: form });
      const data = await res.json();
      if (!data.success) { setCvLoading(false); setCvError(data.error || 'Upload mislukt'); return; }
    }
    setCvLoading(false);
    setStep(1);
  }

  // ── Step 1 ─────────────────────────────────────────────────────
  function handleModeNext() {
    if (mode === 'career') finalize();
    else setStep(2);
  }

  // ── Finalize ───────────────────────────────────────────────────
  async function finalize() {
    setSaving(true); setError('');
    try {
      const modeRes = await fetch('/api/search-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_mode:       mode,
          student_job_prefs: mode === 'student' ? studentPrefs : null,
          pivot_prefs:       mode === 'pivot'   ? pivotPrefs   : null,
        }),
      });
      const modeJson = await modeRes.json();
      if (!modeJson.success) throw new Error('Zoekmodus opslaan mislukt');

      const settRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_onboarded: true }),
      });
      const settJson = await settRes.json();
      if (!settJson.success) throw new Error('Instellingen opslaan mislukt');

      posthog.capture('onboarding_completed', { mode, skipped_cv: !cvFile });
      localStorage.setItem('ja_walkthrough_pending', '1');
      setStep(3);
      setTimeout(() => { window.location.href = '/'; }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Er ging iets mis');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm flex flex-col gap-0">

        {/* Done */}
        {step === 3 && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center flex flex-col gap-4 items-center py-12">
            <div className="text-5xl">✅</div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Klaar!</h1>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>Je wordt doorgestuurd…</p>
          </motion.div>
        )}

        {step !== 3 && (
          <>
            {/* Progress dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
              {Array.from({ length: totalDots }).map((_, i) => (
                <motion.span key={i}
                  animate={{ width: i === activeDot ? 20 : 7 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    display: 'inline-block', height: 7, borderRadius: 999,
                    background: i === activeDot ? 'var(--accent)' : 'var(--surface3)',
                  }}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={step} variants={variants} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.2, ease: 'easeOut' }}>

                {/* ── Step 0: CV upload ── */}
                {step === 0 && (
                  <div className="flex flex-col gap-4">
                    <div className="text-center flex flex-col gap-2">
                      <div className="text-4xl">📎</div>
                      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Upload je CV</h1>
                      <p className="text-sm" style={{ color: 'var(--text2)' }}>Voor gepersonaliseerde AI-scores &amp; motivatiebrieven</p>
                    </div>
                    <div className="glass-card rounded-2xl p-4 text-sm" style={{ color: 'var(--text2)' }}>
                      Je CV wordt veilig opgeslagen per account. Alleen PDF toegestaan, max 5MB.
                    </div>
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex flex-col items-center gap-2 py-8 rounded-2xl border-2 border-dashed cursor-pointer transition-colors"
                      style={{ borderColor: cvFile ? 'var(--accent)' : 'var(--border)', background: cvFile ? 'var(--accent-dim)' : 'var(--surface2)' }}
                    >
                      {cvFile ? (
                        <><span className="text-2xl">✅</span>
                          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{cvFile.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text2)' }}>{(cvFile.size / 1024).toFixed(0)} KB</p>
                        </>
                      ) : (
                        <><span className="text-2xl">📄</span>
                          <p className="text-sm" style={{ color: 'var(--text2)' }}>Klik om een PDF te kiezen</p>
                        </>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { setCvFile(f); setCvError(''); } }} />
                    {cvError && <p className="text-xs" style={{ color: 'var(--red)' }}>{cvError}</p>}
                    <button onClick={() => handleCvNext(false)} disabled={cvLoading || !cvFile} className="btn btn-lg btn-primary w-full">
                      {cvLoading ? 'Uploaden…' : 'CV opslaan & verder →'}
                    </button>
                    <button onClick={() => handleCvNext(true)} disabled={cvLoading}
                      className="text-xs py-2 rounded-xl transition-colors disabled:opacity-40"
                      style={{ color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Overslaan (kan later worden ingesteld)
                    </button>
                  </div>
                )}

                {/* ── Step 1: mode picker ── */}
                {step === 1 && (
                  <div className="flex flex-col gap-4">
                    <div className="text-center flex flex-col gap-2">
                      <div className="text-4xl">🎯</div>
                      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Hoe gebruik je de app?</h1>
                      <p className="text-sm" style={{ color: 'var(--text2)' }}>Kies je zoekmodus. Je kan dit later aanpassen in je profiel.</p>
                    </div>
                    <SearchModeSelector value={mode} onChange={setMode} disabled={saving} />
                    {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
                    <button onClick={handleModeNext} disabled={saving} className="btn btn-lg btn-primary w-full" style={{ marginTop: 4 }}>
                      {saving ? 'Opslaan…' : mode === 'career' ? `Starten (${MODE_LABELS[mode]}) →` : 'Verder →'}
                    </button>
                    <button onClick={() => setStep(0)} disabled={saving}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                      <ChevronLeft size={14} /> Terug
                    </button>
                  </div>
                )}

                {/* ── Step 2: mode detail ── */}
                {step === 2 && (
                  <div className="flex flex-col gap-4">
                    <div className="text-center flex flex-col gap-2">
                      <div className="text-4xl">{mode === 'student' ? '🎓' : '🔄'}</div>
                      <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                        {mode === 'student' ? 'Studentenjob voorkeuren' : 'Sectorwissel voorkeuren'}
                      </h1>
                      <p className="text-sm" style={{ color: 'var(--text2)' }}>
                        {mode === 'student' ? 'Vertel de AI wat voor jou past als student.' : 'Help de AI begrijpen waar je naartoe wil.'}
                      </p>
                    </div>
                    {mode === 'student' && <StudentJobForm value={studentPrefs} onChange={setStudentPrefs} />}
                    {mode === 'pivot'   && <PivotForm      value={pivotPrefs}   onChange={setPivotPrefs} />}
                    {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
                    <button onClick={finalize} disabled={saving} className="btn btn-lg btn-primary w-full" style={{ marginTop: 4 }}>
                      {saving ? 'Opslaan…' : 'Starten →'}
                    </button>
                    <button onClick={() => setStep(1)} disabled={saving}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                      <ChevronLeft size={14} /> Terug
                    </button>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </>
        )}

        <div style={{ marginTop: 24 }}><LegalLinks /></div>
      </div>
    </div>
  );
}
