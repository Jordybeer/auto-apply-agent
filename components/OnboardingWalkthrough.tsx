'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, X, Sparkles, ListTodo, SearchCheck,
  UserCircle2, Settings, CheckCircle2,
} from 'lucide-react';

export const WALKTHROUGH_KEY = 'ja_walkthrough_seen';
const STEP_KEY = 'ja_walkthrough_step';
const PAD = 14; // spotlight padding around target element

/* ── Step definitions ─────────────────────────────────────────────────── */

interface Step {
  id: string;
  color: string;
  Icon: React.ElementType;
  title: string;
  body: React.ReactNode;
  hint?: string;
  page?: string;
  targetSelector?: string;
  Illustration: React.FC;
}

/* ── Illustrations ──────────────────────────────────────────────────────
   Each is a mini mockup of the relevant UI, giving users a visual
   preview before they navigate to that screen.
──────────────────────────────────────────────────────────────────────── */

function IllWelcome() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
      <motion.div
        animate={{ scale: [1, 1.1, 1], filter: ['drop-shadow(0 0 12px var(--accent))', 'drop-shadow(0 0 28px var(--accent))', 'drop-shadow(0 0 12px var(--accent))'] }}
        transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
        style={{ color: 'var(--accent)' }}
      >
        <Sparkles size={48} strokeWidth={1.4} />
      </motion.div>
      <div style={{ display: 'flex', gap: 6 }}>
        {['var(--accent)', '#a78bfa', 'var(--green)', 'var(--yellow)', '#f472b6'].map((c, i) => (
          <motion.div
            key={i}
            animate={{ y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.15, ease: 'easeInOut' }}
            style={{ width: 6, height: 6, borderRadius: 99, background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function IllDashboard() {
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
        {[{ c: 'var(--accent)', n: '12', l: 'Wachtrij' }, { c: '#a78bfa', n: '4', l: 'Bewaard' }, { c: 'var(--green)', n: '2', l: 'Gesolliciteerd' }].map(t => (
          <div key={t.l} style={{
            flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '7px 4px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            border: `1px solid ${t.c}28`,
          }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: t.c, lineHeight: 1 }}>{t.n}</span>
            <span style={{ fontSize: 8.5, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.25 }}>{t.l}</span>
          </div>
        ))}
      </div>
      <motion.div
        animate={{ boxShadow: ['0 0 0 0 rgba(99,102,241,0)', '0 0 0 5px rgba(99,102,241,0.25)', '0 0 0 0 rgba(99,102,241,0)'] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        style={{ background: 'var(--accent)', borderRadius: 10, padding: '9px 0', textAlign: 'center', color: '#fff', fontSize: 12.5, fontWeight: 700 }}
      >
        Zoeken
      </motion.div>
    </div>
  );
}

function IllQueue() {
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <motion.div
        initial={{ x: 0, rotate: 0 }}
        animate={{ x: [0, 4, -4, 0], rotate: [0, 1, -1, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        style={{
          background: 'var(--surface2)', borderRadius: 12, padding: '12px',
          border: '1px solid var(--border-bright)', boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>IT Helpdesk Medewerker</p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text2)' }}>Bedrijf BV · Antwerpen</p>
          </div>
          <span style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--green)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '2px 7px', flexShrink: 0 }}>82%</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <div style={{ flex: 1, background: 'rgba(248,113,113,0.12)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 7, padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: 600 }}>Overslaan</div>
          <div style={{ flex: 1, background: 'var(--accent)', color: '#fff', borderRadius: 7, padding: '6px 0', textAlign: 'center', fontSize: 11, fontWeight: 600 }}>Solliciteren</div>
        </div>
      </motion.div>
    </div>
  );
}

function IllAnalyse() {
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ display: 'flex', gap: 7, background: 'var(--surface2)', borderRadius: 10, padding: '10px 10px', border: '1px solid var(--border)', marginBottom: 7 }}>
        <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)', padding: '7px 9px', fontSize: 11, color: 'var(--text3)' }}>
          https://www.jobat.be/nl/jobs/...
        </div>
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          style={{ background: 'var(--accent)', borderRadius: 7, padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <Sparkles size={11} /> Analyseer
        </motion.div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[{ l: 'Vaardigheden', s: 88, c: 'var(--green)' }, { l: 'Ervaring', s: 70, c: 'var(--yellow)' }].map(r => (
          <div key={r.l} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '6px 9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text2)' }}>{r.l}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: r.c }}>{r.s}/100</span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'var(--surface)', overflow: 'hidden' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${r.s}%` }} transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }} style={{ height: '100%', borderRadius: 99, background: r.c }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IllProfiel() {
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          <UserCircle2 size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>CV & Profiel</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text2)', lineHeight: 1.6, background: 'var(--surface)', borderRadius: 7, padding: '7px 9px', border: '1px solid var(--border)', marginBottom: 7 }}>
          Ervaren IT-professional met 5 jaar ervaring in servicedesk en applicatiebeheer...
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {['helpdesk', 'IT support', 'Antwerpen'].map(t => (
            <span key={t} style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderRadius: 99, fontSize: 9.5, padding: '2px 7px', fontWeight: 600, border: '1px solid rgba(167,139,250,0.3)' }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function IllSettings() {
  return (
    <div style={{ padding: '4px 0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Groq card highlighted */}
      <motion.div
        animate={{ boxShadow: ['0 0 0 1.5px #a78bfa44', '0 0 0 2.5px #a78bfa99', '0 0 0 1.5px #a78bfa44'] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
        style={{ background: 'var(--surface2)', borderRadius: 10, border: '1px solid #a78bfa55', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px' }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#a78bfa18', border: '1px solid #a78bfa40', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13 }}>🤖</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 600, color: 'var(--text)' }}>Groq API Key</p>
            <p style={{ margin: 0, fontSize: 9, color: '#a78bfa', fontWeight: 500 }}>console.groq.com</p>
          </div>
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} style={{ width: 7, height: 7, borderRadius: 99, background: '#a78bfa', flexShrink: 0 }} />
        </div>
        {/* Fake input */}
        <div style={{ margin: '0 10px 10px', display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, height: 28, borderRadius: 7, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
            <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'monospace' }}>Plak je Groq API key…</span>
          </div>
          <div style={{ width: 44, height: 28, borderRadius: 7, background: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>Opslaan</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function IllDone() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0 4px' }}>
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36, delay: 0.08 }}
        style={{ color: 'var(--green)', filter: 'drop-shadow(0 0 18px var(--green))' }}
      >
        <CheckCircle2 size={52} strokeWidth={1.4} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{ margin: 0, fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}
      >
        Veel succes met je sollicitaties!
      </motion.p>
    </div>
  );
}

const STEPS: Step[] = [
  {
    id: 'welcome', color: 'var(--accent)', Icon: Sparkles,
    title: 'Welkom bij werkzoeker',
    body: 'Jouw persoonlijke sollicitatieassistent. Vind automatisch vacatures die bij jou passen en solliciteer sneller dan ooit.',
    Illustration: IllWelcome,
  },
  {
    id: 'dashboard', color: 'var(--accent)', Icon: Sparkles,
    title: 'Vacatures zoeken',
    body: 'Stel je zoekwoorden in en druk op "Zoeken". Werkzoeker haalt vacatures op en scoort ze met AI op basis van jouw profiel.',
    hint: 'Klik op "Zoeken" om je eerste vacatures op te halen',
    page: '/', targetSelector: '[data-walkthrough="zoek-knop"]',
    Illustration: IllDashboard,
  },
  {
    id: 'queue', color: '#6366f1', Icon: ListTodo,
    title: 'Je dagelijkse wachtrij',
    body: 'Elke kaart in de wachtrij heeft een AI-matchscore. Bewaar interessante jobs, sla anderen over, of solliciteer direct met een gegenereerde motivatiebrief.',
    page: '/queue', targetSelector: '[data-walkthrough="wachtrij"]',
    Illustration: IllQueue,
  },
  {
    id: 'analyse', color: '#f472b6', Icon: SearchCheck,
    title: 'Eenmalige analyse',
    body: 'Plak de URL van elke vacature voor een directe fit-check — ook buiten de wachtrij. De AI vergelijkt de vacature met jouw CV en geeft een gedetailleerde score.',
    page: '/analyse', targetSelector: '[data-walkthrough="analyse-url"]',
    Illustration: IllAnalyse,
  },
  {
    id: 'profiel', color: '#a78bfa', Icon: UserCircle2,
    title: 'Je profiel invullen',
    body: 'Plak je CV-tekst in en stel zoekwoorden en voorkeursstad in. Hoe completer je profiel, hoe nauwkeuriger de AI-scores en motivatiebrieven worden.',
    hint: 'CV invullen → betere matches',
    page: '/profiel', targetSelector: '[data-walkthrough="cv-veld"]',
    Illustration: IllProfiel,
  },
  {
    id: 'settings', color: 'var(--yellow)', Icon: Settings,
    title: 'Groq API key instellen',
    body: <>Groq is de gratis AI-engine achter alle scores en motivatiebrieven. Maak een gratis account aan op{' '}
      <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-bright)', textDecoration: 'underline', textUnderlineOffset: 2 }}>console.groq.com</a>
      {' '}→ <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', padding: '1px 5px', borderRadius: 4, background: 'var(--surface2)' }}>API Keys</span> → <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', padding: '1px 5px', borderRadius: 4, background: 'var(--surface2)' }}>Create API Key</span> en plak de key hieronder.</>,
    hint: 'Instellingen → Groq API Key',
    page: '/settings', targetSelector: '[data-walkthrough="groq-sleutel"]',
    Illustration: IllSettings,
  },
  {
    id: 'done', color: 'var(--green)', Icon: CheckCircle2,
    title: 'Klaar om te starten!',
    body: 'Alles staat klaar. Ga naar het dashboard en druk op "Zoeken" om je eerste vacatures op te halen. Succes!',
    page: '/',
    Illustration: IllDone,
  },
];

/* ── Spotlight overlay (SVG mask technique) ─────────────────────────── */

function SpotlightOverlay({ rect, color }: { rect: DOMRect; color: string }) {
  const x = rect.left - PAD;
  const y = rect.top - PAD;
  const w = rect.width + PAD * 2;
  const h = rect.height + PAD * 2;
  const r = 14;

  return (
    <>
      {/* Dark mask with hole */}
      <motion.svg
        key="spotlight-svg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 500, pointerEvents: 'none' }}
      >
        <defs>
          <mask id="walkthrough-cutout">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={r} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.78)" mask="url(#walkthrough-cutout)" />
      </motion.svg>

      {/* Pulse ring */}
      <motion.div
        key="spotlight-ring"
        animate={{ opacity: [0.5, 1, 0.5], scale: [0.97, 1.02, 0.97] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        style={{
          position: 'fixed',
          left: x - 3, top: y - 3,
          width: w + 6, height: h + 6,
          borderRadius: r + 3,
          border: `2px solid ${color}`,
          zIndex: 501,
          pointerEvents: 'none',
          boxShadow: `0 0 18px ${color}55`,
        }}
      />
    </>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

export default function OnboardingWalkthrough() {
  const router = useRouter();
  const [visible, setVisible]     = useState(false);
  const [step, setStep]           = useState(0);
  const [direction, setDirection] = useState(1);
  const [spotRect, setSpotRect]   = useState<DOMRect | null>(null);
  const timerRefs                 = useRef<ReturnType<typeof setTimeout>[]>([]);

  const current = STEPS[step];

  /* Mount: check localStorage */
  useEffect(() => {
    const seen  = !!localStorage.getItem(WALKTHROUGH_KEY);
    const saved = parseInt(localStorage.getItem(STEP_KEY) ?? '-1');
    if (!seen) {
      setStep(saved >= 0 && saved < STEPS.length ? saved : 0);
      setVisible(true);
    }
    const handler = () => { setStep(0); setDirection(1); setVisible(true); };
    window.addEventListener('walkthrough:open', handler);
    return () => window.removeEventListener('walkthrough:open', handler);
  }, []);

  /* Persist step */
  useEffect(() => {
    if (visible) localStorage.setItem(STEP_KEY, step.toString());
  }, [step, visible]);

  /* Spotlight: find target element, retry across page transitions */
  const measureSpot = useCallback(() => {
    const sel = current.targetSelector;
    if (!sel) { setSpotRect(null); return; }
    const el = document.querySelector<HTMLElement>(sel);
    if (el) {
      setSpotRect(el.getBoundingClientRect());
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setSpotRect(null);
    }
  }, [current.targetSelector]);

  useEffect(() => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
    if (!visible) { setSpotRect(null); return; }

    const delays = [120, 350, 700, 1200];
    timerRefs.current = delays.map(d => setTimeout(measureSpot, d));

    window.addEventListener('scroll', measureSpot, { passive: true });
    window.addEventListener('resize', measureSpot);
    return () => {
      timerRefs.current.forEach(clearTimeout);
      window.removeEventListener('scroll', measureSpot);
      window.removeEventListener('resize', measureSpot);
    };
  }, [visible, step, measureSpot]);

  const dismiss = () => {
    localStorage.setItem(WALKTHROUGH_KEY, 'true');
    localStorage.removeItem(STEP_KEY);
    setVisible(false);
  };

  const goTo = (nextStep: number) => {
    if (nextStep < 0 || nextStep >= STEPS.length) return;
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
    const p = STEPS[nextStep].page;
    if (p) router.push(p);
  };

  const next = () => (step === STEPS.length - 1 ? dismiss() : goTo(step + 1));
  const prev = () => { if (step > 0) goTo(step - 1); };

  const spotlightActive = !!spotRect && !!current.targetSelector;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop: full dark when no spotlight, SVG mask when spotlight */}
          {spotlightActive
            ? <SpotlightOverlay rect={spotRect!} color={current.color} />
            : (
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                onClick={dismiss}
                style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
              />
            )
          }

          {/* Bottom sheet card */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501,
              display: 'flex', flexDirection: 'column',
              background: 'var(--surface)',
              borderRadius: '24px 24px 0 0',
              border: '1px solid var(--border-bright)',
              boxShadow: '0 -24px 64px rgba(0,0,0,0.55)',
              paddingBottom: 'calc(var(--navbar-h) + 8px)',
              maxHeight: 'calc(100dvh - var(--navbar-h) - 16px)',
              overflowY: 'auto',
            }}
          >
            {/* Handle bar */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border-bright)' }} />
            </div>

            {/* Dismiss button */}
            <button
              onClick={dismiss}
              aria-label="Sluiten"
              style={{
                position: 'absolute', top: 14, right: 16,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 99, width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--text3)',
              }}
            >
              <X size={13} />
            </button>

            {/* Step counter */}
            <span style={{
              position: 'absolute', top: 18, left: 18,
              fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.06em',
            }}>
              {step + 1} / {STEPS.length}
            </span>

            <div style={{ padding: '4px 20px 0' }}>
              {/* Illustration */}
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={`ill-${step}`}
                  custom={direction}
                  variants={{
                    enter: (d: number) => ({ opacity: 0, x: d * 32 }),
                    center: { opacity: 1, x: 0 },
                    exit: (d: number) => ({ opacity: 0, x: d * -32 }),
                  }}
                  initial="enter" animate="center" exit="exit"
                  transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                >
                  <current.Illustration />
                </motion.div>
              </AnimatePresence>

              {/* Accent bar */}
              <motion.div
                key={`bar-${step}`}
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  height: 3, borderRadius: 99, background: current.color,
                  transformOrigin: 'left', marginBottom: 12,
                  boxShadow: `0 0 10px ${current.color}66`,
                }}
              />

              {/* Text */}
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={`text-${step}`}
                  custom={direction}
                  variants={{
                    enter: (d: number) => ({ opacity: 0, x: d * 24 }),
                    center: { opacity: 1, x: 0 },
                    exit: (d: number) => ({ opacity: 0, x: d * -24 }),
                  }}
                  initial="enter" animate="center" exit="exit"
                  transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                >
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 7px', lineHeight: 1.3 }}>
                    {current.title}
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>
                    {current.body}
                  </p>
                  {current.hint && (
                    <p style={{ marginTop: 8, fontSize: '0.75rem', color: current.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <current.Icon size={12} />
                      {current.hint}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 20px 10px' }}>
              {STEPS.map((s, i) => (
                <motion.button
                  key={i}
                  onClick={() => goTo(i)}
                  animate={{ width: i === step ? 20 : 6, background: i === step ? current.color : 'var(--border-bright)' }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: 6, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0 }}
                  aria-label={`Stap ${i + 1}: ${s.title}`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 8, padding: '0 20px' }}>
              {step > 0 ? (
                <button
                  onClick={prev}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: '0.875rem',
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    color: 'var(--text2)', fontSize: '0.85rem', fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  <ChevronLeft size={15} /> Terug
                </button>
              ) : (
                <button
                  onClick={dismiss}
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: '0.875rem',
                    border: '1px solid var(--border)', background: 'var(--surface2)',
                    color: 'var(--text3)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Overslaan
                </button>
              )}
              <motion.button
                onClick={next}
                whileTap={{ scale: 0.95 }}
                style={{
                  flex: 2, padding: '0.7rem', borderRadius: '0.875rem',
                  border: 'none', background: current.color, color: '#fff',
                  fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: `0 4px 18px ${current.color}44`,
                }}
              >
                {step === STEPS.length - 1 ? 'Aan de slag!' : (<>Volgende <ChevronRight size={15} /></>)}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
