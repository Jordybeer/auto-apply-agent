'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Sparkles, AlertTriangle, Loader2,
  Mail, ExternalLink, ChevronDown, ChevronUp, Eye,
} from 'lucide-react';

interface Job {
  title: string;
  company: string;
  url: string | null;
  source: string | null;
  description: string | null;
  location: string | null;
}

interface Application {
  id: string;
  status: string;
  match_score: number | null;
  reasoning: string | null;
  cover_letter_draft?: string | null;
  applied_at?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  note?: string | null;
  sent_via_email?: boolean | null;
  jobs: Job | null;
}

interface Props {
  applicationId?: string;
  jobTitle?: string;
  company?: string;
  initialLetter?: string | null;
  initialBullets?: string[] | null;
  groqSkipped?: boolean;
  application?: Application;
  onClose: () => void;
  onApplied?: () => void;
  onConfirmed?: (id: string) => void;
}

export default function ApplyModal({
  applicationId: applicationIdProp,
  jobTitle: jobTitleProp,
  company: companyProp,
  initialLetter: initialLetterProp,
  initialBullets,
  groqSkipped,
  application,
  onClose,
  onApplied,
  onConfirmed,
}: Props) {
  const applicationId = applicationIdProp ?? application?.id ?? '';
  const jobTitle      = jobTitleProp     ?? application?.jobs?.title   ?? 'Onbekende functie';
  const company       = companyProp      ?? application?.jobs?.company ?? '\u2014';
  const jobUrl        = application?.jobs?.url ?? null;
  const initialLetter = initialLetterProp !== undefined
    ? initialLetterProp
    : (application?.cover_letter_draft ?? null);

  const contactEmail  = application?.contact_email  ?? null;
  const contactPerson = application?.contact_person ?? null;
  const alreadySent   = application?.sent_via_email ?? false;

  const [letter, setLetter]         = useState(initialLetter ?? '');
  const [saving, setSaving]         = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);
  const showToast = (msg: string, type: 'error' | 'success' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // FIX: initialise directly from props so fields are pre-filled on first render
  const [showEmailPanel, setShowEmailPanel] = useState(Boolean(contactEmail));
  const [emailTo, setEmailTo]               = useState(contactEmail ?? '');
  const [emailSubject, setEmailSubject]     = useState(
    `Sollicitatie: ${jobTitle} \u2014 ${company}`,
  );
  const [sending, setSending]   = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentOk, setSentOk]     = useState(alreadySent);

  const [showPreview, setShowPreview] = useState(false);

  // Keep letter in sync if parent updates the prop (e.g. after generate)
  useEffect(() => { setLetter(initialLetter ?? ''); }, [initialLetter]);

  // Sync emailTo only when the prop arrives late (async scrape)
  useEffect(() => {
    if (contactEmail) {
      setEmailTo(prev => prev || contactEmail);
      setShowEmailPanel(true);
    }
  }, [contactEmail]);

  // Keep subject in sync if title/company change
  useEffect(() => {
    setEmailSubject(`Sollicitatie: ${jobTitle} \u2014 ${company}`);
  }, [jobTitle, company]);

  const generate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: applicationId }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error ?? `Fout ${res.status}`); return; }
      if (data.cover_letter_draft) setLetter(data.cover_letter_draft);
      if (data.groq_skipped) {
        setGenError('Groq API-sleutel ontbreekt of generatie mislukt. Voer je sleutel in via Instellingen.');
      }
    } catch (e: unknown) {
      setGenError((e as Error).message ?? 'Generatie mislukt');
    } finally {
      setGenerating(false);
    }
  };

  const confirm = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          ...(letter.trim() ? { cover_letter_draft: letter } : {}),
          ...(initialBullets?.length ? { resume_bullets_draft: initialBullets } : {}),
          confirm: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onConfirmed?.(applicationId);
      onApplied?.();
      onClose();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Fout bij opslaan');
    } finally {
      setSaving(false);
    }
  };

  const sendViaGmail = async () => {
    if (!emailTo.trim()) {
      setSendError('Voer een e-mailadres in.');
      showToast('Voer een e-mailadres in.');
      return;
    }
    setSending(true); setSendError(null);
    try {
      if (letter.trim()) {
        await fetch('/api/apply', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ application_id: applicationId, cover_letter_draft: letter }),
        });
      }
      const res = await fetch('/api/send-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId,
          to:      emailTo.trim(),
          subject: emailSubject.trim() || `Sollicitatie: ${jobTitle}`,
          body:    letter,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error ?? `Fout ${res.status}`;
        setSendError(errMsg); showToast(errMsg); return;
      }
      setSentOk(true);
      showToast('E-mail succesvol verstuurd!', 'success');
      onConfirmed?.(applicationId);
      onApplied?.();
      setTimeout(onClose, 1800);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? 'Versturen mislukt';
      setSendError(msg); showToast(msg);
    } finally {
      setSending(false);
    }
  };

  const hasEmail   = Boolean(contactEmail);
  const previewBody = jobUrl ? `${letter}\n\n---\nVacature: ${jobUrl}` : letter;

  return (
    <AnimatePresence>
      {/* ── Toast ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium shadow-lg"
            style={{
              background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
              color:      toast.type === 'success' ? 'var(--green)' : 'var(--red)',
              border:     toast.type === 'success' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(248,113,113,0.3)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Mail className="w-4 h-4 flex-shrink-0" />
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── E-mail preview sheet ─────────────────────────────────────── */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            key="preview-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ zIndex: 250, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              key="preview-dialog"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full max-w-lg rounded-3xl flex flex-col"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-bright)',
                // FIX: was overflow:hidden which clipped the scroll area
                maxHeight: 'min(88dvh, 720px)',
                overflow: 'clip',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
                <span className="font-bold text-base" style={{ color: 'var(--text)' }}>E-mailvoorbeeld</span>
                <button
                  onClick={() => setShowPreview(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--surface2)' }}
                  aria-label="Sluiten"
                >
                  <X className="w-4 h-4" style={{ color: 'var(--text2)' }} />
                </button>
              </div>
              <div className="flex-shrink-0 px-5 pb-3 flex flex-col gap-1 text-xs"
                style={{ color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>
                <div><span style={{ color: 'var(--text3)' }}>Aan: </span>{emailTo || contactEmail || '\u2014'}</div>
                <div><span style={{ color: 'var(--text3)' }}>Onderwerp: </span>{emailSubject}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span style={{ color: 'var(--text3)' }}>Bijlage: </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                    \uD83D\uDCCE cv.pdf
                  </span>
                </div>
              </div>
              {/* FIX: scrollable body inside preview — overflow-y-auto here, not on wrapper */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <pre className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--text)', fontFamily: 'inherit' }}>
                  {previewBody || '(geen inhoud)'}
                </pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main modal ───────────────────────────────────────────────── */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4"
        style={{ zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          key="dialog"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-bright)',
            maxHeight: '92dvh',
            // FIX: overflow:clip preserves border-radius on children
            // while NOT blocking internal overflow-y-auto scroll regions
            overflow: 'clip',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Scrollable body ──────────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-4 p-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-base leading-snug" style={{ color: 'var(--text)' }}>
                  {jobTitle}
                </span>
                <span className="text-sm" style={{ color: 'var(--text2)' }}>{company}</span>
                {contactPerson && (
                  <span className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                    Contactpersoon: {contactPerson}
                  </span>
                )}
                {contactEmail && (
                  <span className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                    {contactEmail}
                  </span>
                )}
                {sentOk && (
                  <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold w-fit"
                    style={{
                      background: 'rgba(34,197,94,0.12)',
                      color: 'var(--green)',
                      border: '1px solid rgba(34,197,94,0.25)',
                    }}>
                    <Mail className="w-3 h-3" />
                    E-mail verzonden
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {sentOk && (
                  <button
                    onClick={() => setShowPreview(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                    aria-label="Bekijk verstuurde e-mail"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Bekijk e-mail
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--surface2)' }}
                  aria-label="Sluiten"
                >
                  <X className="w-4 h-4" style={{ color: 'var(--text2)' }} />
                </button>
              </div>
            </div>

            {/* Groq skipped warning */}
            {groqSkipped && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--yellow)', border: '1px solid rgba(251,191,36,0.25)' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Groq API-sleutel ontbreekt \u2014 brief niet automatisch gegenereerd.</span>
              </div>
            )}

            {/* Motivatiebrief header */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Motivatiebrief</label>
              <button
                onClick={generate}
                disabled={generating || saving}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-opacity disabled:opacity-40 active:scale-95"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(129,140,248,0.25)' }}
                aria-label="Genereer brief met AI"
              >
                {generating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                {generating ? 'Genereren\u2026' : 'Genereer brief'}
              </button>
            </div>

            {genError && (
              <div className="text-xs rounded-xl px-3 py-2"
                style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
                {genError}
              </div>
            )}

            {/* FIX: min-h so content is always visible; line-height shows paragraph spacing */}
            <textarea
              value={letter}
              onChange={e => setLetter(e.target.value)}
              rows={12}
              placeholder="Schrijf hier je motivatiebrief of druk op 'Genereer brief' voor een AI-voorstel\u2026"
              className="w-full rounded-2xl p-3.5 text-sm resize-none focus:outline-none"
              style={{
                background:  'var(--surface2)',
                color:       'var(--text)',
                border:      '1px solid var(--border)',
                lineHeight:  1.7,
                minHeight:   '14rem',
                whiteSpace:  'pre-wrap',
                overflowY:   'auto',
              }}
            />

            {/* Gmail send panel */}
            <div className="rounded-2xl" style={{ border: '1px solid var(--border)', overflow: 'clip' }}>
              <button
                onClick={() => setShowEmailPanel(p => !p)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium"
                style={{ background: 'var(--surface2)', color: hasEmail ? 'var(--text)' : 'var(--text2)' }}
              >
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {hasEmail
                    ? `Verstuur via Gmail naar ${contactEmail}`
                    : 'Verstuur via Gmail (voer e-mailadres in)'}
                </span>
                {showEmailPanel
                  ? <ChevronUp className="w-4 h-4 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
              </button>

              <AnimatePresence initial={false}>
                {showEmailPanel && (
                  <motion.div
                    key="email-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="flex flex-col gap-3 px-4 pb-4 pt-3" style={{ background: 'var(--surface)' }}>
                      {sentOk ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-medium rounded-xl px-3 py-2.5 flex-1"
                            style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--green)' }}>
                            <Mail className="w-4 h-4" />
                            E-mail succesvol verstuurd!
                          </div>
                          <button
                            onClick={() => setShowPreview(true)}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium flex-shrink-0"
                            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                          >
                            <Eye className="w-4 h-4" />
                            Bekijk
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* FIX: Aan-veld toont contactEmail als waarde */}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Aan</label>
                            <input
                              type="email"
                              value={emailTo}
                              onChange={e => setEmailTo(e.target.value)}
                              placeholder="recruiter@bedrijf.be"
                              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Onderwerp</label>
                            <input
                              type="text"
                              value={emailSubject}
                              onChange={e => setEmailSubject(e.target.value)}
                              className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <p className="text-xs" style={{ color: 'var(--text3)' }}>
                            De motivatiebrief + vacature-URL worden verstuurd. Je CV (cv.pdf) wordt als bijlage toegevoegd.
                          </p>
                          {sendError && (
                            <div className="text-xs rounded-xl px-3 py-2"
                              style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
                              {sendError}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowPreview(true)}
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-medium flex-shrink-0"
                              style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                              aria-label="Bekijk e-mailvoorbeeld"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={sendViaGmail}
                              disabled={sending || !emailTo.trim()}
                              className="flex flex-1 items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform"
                              style={{ background: 'var(--accent)', color: '#fff' }}
                            >
                              {sending
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Mail className="w-4 h-4" />}
                              {sending ? 'Versturen\u2026' : 'Verstuur e-mail'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {error && (
              <div className="text-xs rounded-xl px-3 py-2"
                style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.25)' }}>
                {error}
              </div>
            )}
          </div>

          {/* ── Sticky footer ────────────────────────────────────────── */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-5 py-4"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            {jobUrl && (
              <a
                href={jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl text-sm font-medium"
                style={{ background: 'var(--surface2)', color: 'var(--text2)', flexShrink: 0 }}
                aria-label="Open vacature"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              disabled={saving || generating}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Annuleer
            </button>
            <button
              onClick={confirm}
              disabled={saving || generating || sentOk}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40 active:scale-95"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Bevestig sollicitatie
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
