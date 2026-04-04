'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Sparkles, AlertTriangle, Loader2,
  Mail, ExternalLink, ChevronDown, ChevronUp, Eye, RefreshCw,
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

function normalizeLetter(raw: string): string {
  return raw
    .replace(/^[ \t\u00A0\u2002\u2003\u2009]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? (e.message || fallback) : fallback;
}

const GMAIL_NOT_CONNECTED = 'gmail_not_connected';

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

  const [letter, setLetter]         = useState(normalizeLetter(initialLetter ?? ''));
  const [saving, setSaving]         = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);
  const showToast = (msg: string, type: 'error' | 'success' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [letterExpanded, setLetterExpanded] = useState(false);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [emailTo, setEmailTo]               = useState(contactEmail ?? '');
  const [emailSubject, setEmailSubject]     = useState(
    `Sollicitatie: ${jobTitle} \u2014 ${company}`,
  );
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentOk, setSentOk]       = useState(alreadySent);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => { setLetter(normalizeLetter(initialLetter ?? '')); }, [initialLetter]);

  useEffect(() => {
    if (contactEmail) {
      setEmailTo(prev => prev || contactEmail);
      setShowEmailPanel(true);
    }
  }, [contactEmail]);

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
      if (data.cover_letter_draft) {
        setLetter(normalizeLetter(data.cover_letter_draft));
        setLetterExpanded(true);
      }
      if (data.groq_skipped) {
        setGenError(data.groq_error ?? 'Generatie mislukt \u2014 controleer je Groq API-sleutel via Instellingen.');
      }
    } catch (e: unknown) {
      setGenError(getErrorMessage(e, 'Generatie mislukt \u2014 controleer je verbinding.'));
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
      setError(getErrorMessage(e, 'Fout bij opslaan'));
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
        const errMsg: string = data.error ?? `Fout ${res.status}`;
        const isGmailAuth = res.status === 403 || errMsg.toLowerCase().includes('gmail') || errMsg.toLowerCase().includes('verbonden');
        setSendError(isGmailAuth ? GMAIL_NOT_CONNECTED : errMsg);
        if (!isGmailAuth) showToast(errMsg);
        return;
      }
      setSentOk(true);
      showToast('E-mail succesvol verstuurd!', 'success');
      onConfirmed?.(applicationId);
      onApplied?.();
      setTimeout(onClose, 1800);
    } catch (e: unknown) {
      const msg = getErrorMessage(e, 'Versturen mislukt');
      setSendError(msg); showToast(msg);
    } finally {
      setSending(false);
    }
  };

  const hasEmail    = Boolean(contactEmail);
  const previewBody = jobUrl ? `${letter}\n\n---\nVacature: ${jobUrl}` : letter;
  const gmailNotConnected = sendError === GMAIL_NOT_CONNECTED;

  return (
    <AnimatePresence>
      {/* ── Toast */}
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

      {/* ── E-mail preview sheet */}
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
              <div
                className="flex-shrink-0 px-5 pb-3 flex flex-col gap-1 text-xs"
                style={{ color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}
              >
                <div><span style={{ color: 'var(--text3)' }}>Aan: </span>{emailTo || contactEmail || '\u2014'}</div>
                <div><span style={{ color: 'var(--text3)' }}>Onderwerp: </span>{emailSubject}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span style={{ color: 'var(--text3)' }}>Bijlage: </span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                  >
                    \uD83D\uDCCE cv.pdf
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <pre
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: 'var(--text)', fontFamily: 'inherit' }}
                >{previewBody || '(geen inhoud)'}</pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main overlay — always centered */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      >
        <motion.div
          key="dialog"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="w-full max-w-lg rounded-3xl flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-bright)',
            maxHeight: 'calc(100dvh - var(--navbar-h) - 2rem)',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--text)' }}>{jobTitle}</p>
              <p className="text-sm" style={{ color: 'var(--text2)' }}>
                {company}
                {jobUrl && (
                  <a
                    href={jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 ml-1.5"
                    style={{ color: 'var(--accent)' }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              aria-label="Sluiten"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 flex flex-col gap-4 pb-4">

            {groqSkipped && (
              <div
                className="flex items-start gap-2 p-3 rounded-2xl text-xs"
                style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--yellow)', border: '1px solid rgba(251,191,36,0.2)' }}
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Groq-sleutel ontbreekt \u2014 brief niet automatisch gegenereerd.</span>
              </div>
            )}

            {/* ── Motivatiebrief */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setLetterExpanded(v => !v)}
                className="flex items-center justify-between w-full py-1 text-sm font-semibold"
                style={{ color: 'var(--text)' }}
              >
                <span>Motivatiebrief</span>
                <span className="flex items-center gap-2">
                  {!letterExpanded && letter.trim() && (
                    <span
                      className="text-xs font-normal px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                    >
                      opgeslagen
                    </span>
                  )}
                  {letterExpanded
                    ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text2)' }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text2)' }} />}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {letterExpanded && (
                  <motion.div
                    key="letter-body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="flex flex-col gap-2 pt-1">
                      <textarea
                        value={letter}
                        onChange={e => setLetter(e.target.value)}
                        rows={10}
                        placeholder="Schrijf hier je motivatiebrief of druk op 'Genereer brief'\u2026"
                        className="w-full rounded-2xl px-3 py-2.5 text-sm leading-relaxed resize-none outline-none"
                        style={{
                          background: 'var(--surface2)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={generate}
                          disabled={generating}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                          style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                        >
                          {generating
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Sparkles className="w-3.5 h-3.5" />}
                          {generating ? 'Genereren\u2026' : letter.trim() ? 'Opnieuw genereren' : 'Genereer brief'}
                        </button>
                        <button
                          onClick={() => setShowPreview(true)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                          style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Voorbeeld
                        </button>
                      </div>
                      {genError && (
                        <p className="text-xs" style={{ color: 'var(--red)' }}>{genError}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!letterExpanded && (
                <div className="flex gap-2">
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                    style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                  >
                    {generating
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />}
                    {generating ? 'Genereren\u2026' : letter.trim() ? 'Opnieuw genereren' : 'Genereer brief'}
                  </button>
                  {letter.trim() && (
                    <button
                      onClick={() => { setLetterExpanded(true); setShowPreview(true); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Bekijk
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Verstuur via Gmail */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowEmailPanel(v => !v)}
                className="flex items-center justify-between w-full py-1 text-sm font-semibold"
                style={{ color: 'var(--text)' }}
              >
                <span className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  Verstuur via Gmail
                  {sentOk && (
                    <span
                      className="text-xs font-normal px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.25)' }}
                    >
                      verstuurd
                    </span>
                  )}
                </span>
                {showEmailPanel
                  ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text2)' }} />
                  : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text2)' }} />}
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
                    <div className="flex flex-col gap-3 pt-1">
                      {sentOk && (
                        <p
                          className="text-xs px-3 py-2 rounded-xl"
                          style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)' }}
                        >
                          \u2713 E-mail is al verstuurd. Je kan nogmaals versturen als je wilt.
                        </p>
                      )}

                      {gmailNotConnected ? (
                        <div
                          className="flex flex-col gap-2 p-3 rounded-2xl"
                          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}
                        >
                          <p className="text-xs" style={{ color: 'var(--red)' }}>
                            Gmail is niet verbonden met je account.
                          </p>
                          <a
                            href="/login"
                            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                          >
                            <RefreshCw className="w-4 h-4" />
                            Verbind Gmail opnieuw
                          </a>
                        </div>
                      ) : (
                        <>
                          {!hasEmail && (
                            <p className="text-xs" style={{ color: 'var(--text3)' }}>
                              Geen contacte-mail gevonden. Vul hieronder handmatig in.
                            </p>
                          )}
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>
                              Aan{contactPerson ? ` \u2014 ${contactPerson}` : ''}
                            </label>
                            <input
                              type="email"
                              value={emailTo}
                              onChange={e => setEmailTo(e.target.value)}
                              placeholder="recruiter@bedrijf.be"
                              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Onderwerp</label>
                            <input
                              type="text"
                              value={emailSubject}
                              onChange={e => setEmailSubject(e.target.value)}
                              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                            />
                          </div>
                          {sendError && sendError !== GMAIL_NOT_CONNECTED && (
                            <p className="text-xs" style={{ color: 'var(--red)' }}>{sendError}</p>
                          )}
                          <button
                            onClick={sendViaGmail}
                            disabled={sending}
                            className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                          >
                            {sending
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Send className="w-4 h-4" />}
                            {sending ? 'Versturen\u2026' : 'Verstuur via Gmail'}
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {error && (
            <p className="mx-5 mb-2 text-xs flex-shrink-0" style={{ color: 'var(--red)' }}>{error}</p>
          )}

          {/* Sticky footer */}
          <div
            className="flex-shrink-0 px-5 pt-3 pb-5 flex gap-2"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Annuleer
            </button>
            <button
              onClick={confirm}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              {saving ? 'Opslaan\u2026' : 'Bevestig sollicitatie'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
