'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Sparkles, AlertTriangle, Loader2,
  Mail, ExternalLink, ChevronDown, ChevronUp, Eye, RefreshCw, Pencil,
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
  const [editing, setEditing]       = useState(false);
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

  useEffect(() => {
    const normalized = normalizeLetter(initialLetter ?? '');
    setLetter(normalized);
    setEditing(false);
  }, [initialLetter]);

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
        setEditing(false);
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

  // Render-view: split on double newline to render proper paragraphs
  const paragraphs = letter.split(/\n\n+/).filter(Boolean);

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
            className="modal-overlay"
            style={{ zIndex: 250 }}
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              key="preview-dialog"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="modal-dialog"
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <span className="font-bold text-base text-primary">E-mailvoorbeeld</span>
                <button onClick={() => setShowPreview(false)} className="modal-close-btn" aria-label="Sluiten">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div
                className="flex-shrink-0 px-5 pb-3 flex flex-col gap-1 text-xs text-secondary"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div><span className="text-tertiary">Aan: </span>{emailTo || contactEmail || '\u2014'}</div>
                <div><span className="text-tertiary">Onderwerp: </span>{emailSubject}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-tertiary">Bijlage: </span>
                  <span className="status-pill">\uD83D\uDCCE cv.pdf</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <pre className="text-sm leading-relaxed whitespace-pre-wrap text-primary" style={{ fontFamily: 'inherit' }}>
                  {previewBody || '(geen inhoud)'}
                </pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hoofd overlay */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="modal-overlay"
        onClick={onClose}
      >
        <motion.div
          key="dialog"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="modal-dialog"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header">
            <div>
              <p className="font-bold text-base text-primary">{jobTitle}</p>
              <p className="text-sm text-secondary">
                {company}
                {jobUrl && (
                  <a
                    href={jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 ml-1.5 text-accent"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            </div>
            <button onClick={onClose} className="modal-close-btn" aria-label="Sluiten">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollbare body */}
          <div className="modal-body">

            {groqSkipped && (
              <div className="alert-warning">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Groq-sleutel ontbreekt \u2014 brief niet automatisch gegenereerd.</span>
              </div>
            )}

            {/* ── Motivatiebrief */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setLetterExpanded(v => !v)}
                className="flex items-center justify-between w-full py-1 text-sm font-semibold text-primary"
              >
                <span>Motivatiebrief</span>
                <span className="flex items-center gap-2">
                  {!letterExpanded && letter.trim() && (
                    <span className="status-pill">opgeslagen</span>
                  )}
                  {letterExpanded
                    ? <ChevronUp className="w-4 h-4 text-secondary" />
                    : <ChevronDown className="w-4 h-4 text-secondary" />}
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

                      {/* ── Render-view (default) vs edit mode */}
                      {editing ? (
                        <textarea
                          value={letter}
                          onChange={e => setLetter(e.target.value)}
                          rows={10}
                          placeholder="Schrijf hier je motivatiebrief of druk op 'Genereer brief'\u2026"
                          className="field-textarea"
                          autoFocus
                        />
                      ) : letter.trim() ? (
                        <div
                          className="field-textarea cursor-text"
                          style={{ minHeight: '10rem', whiteSpace: 'pre-wrap' }}
                          onClick={() => setEditing(true)}
                          title="Klik om te bewerken"
                        >
                          {paragraphs.map((p, i) => (
                            <p key={i} style={{ marginBottom: i < paragraphs.length - 1 ? '0.85em' : 0 }}>
                              {p}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div
                          className="field-textarea cursor-text"
                          style={{ minHeight: '6rem', color: 'var(--text-tertiary)' }}
                          onClick={() => setEditing(true)}
                        >
                          Schrijf hier je motivatiebrief of druk op &apos;Genereer brief&apos;\u2026
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={generate} disabled={generating} className="btn btn-sm btn-ghost-accent">
                          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {generating ? 'Genereren\u2026' : letter.trim() ? 'Opnieuw genereren' : 'Genereer brief'}
                        </button>
                        {letter.trim() && !editing && (
                          <button onClick={() => setEditing(true)} className="btn btn-sm btn-secondary">
                            <Pencil className="w-3.5 h-3.5" />
                            Bewerken
                          </button>
                        )}
                        {editing && (
                          <button onClick={() => setEditing(false)} className="btn btn-sm btn-secondary">
                            <Eye className="w-3.5 h-3.5" />
                            Bekijk
                          </button>
                        )}
                        {!editing && letter.trim() && (
                          <button onClick={() => setShowPreview(true)} className="btn btn-sm btn-secondary">
                            <Eye className="w-3.5 h-3.5" />
                            Voorbeeld
                          </button>
                        )}
                      </div>
                      {genError && <p className="text-xs text-red">{genError}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!letterExpanded && (
                <div className="flex gap-2">
                  <button onClick={generate} disabled={generating} className="btn btn-sm btn-ghost-accent">
                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {generating ? 'Genereren\u2026' : letter.trim() ? 'Opnieuw genereren' : 'Genereer brief'}
                  </button>
                  {letter.trim() && (
                    <button onClick={() => { setLetterExpanded(true); setShowPreview(true); }} className="btn btn-sm btn-secondary">
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
                className="flex items-center justify-between w-full py-1 text-sm font-semibold text-primary"
              >
                <span className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-accent" />
                  Verstuur via Gmail
                  {sentOk && <span className="status-pill status-pill--green">verstuurd</span>}
                </span>
                {showEmailPanel
                  ? <ChevronUp className="w-4 h-4 text-secondary" />
                  : <ChevronDown className="w-4 h-4 text-secondary" />}
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
                        <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          \u2713 E-mail is al verstuurd. Je kan nogmaals versturen als je wilt.
                        </p>
                      )}

                      {gmailNotConnected ? (
                        <div className="alert-error flex-col">
                          <p>Gmail is niet verbonden met je account.</p>
                          <a href="/login" className="btn btn-sm btn-primary w-full mt-1" style={{ borderRadius: '0.75rem' }}>
                            <RefreshCw className="w-4 h-4" />
                            Verbind Gmail opnieuw
                          </a>
                        </div>
                      ) : (
                        <>
                          {!hasEmail && (
                            <p className="text-xs text-tertiary">Geen contacte-mail gevonden. Vul hieronder handmatig in.</p>
                          )}
                          <div className="flex flex-col gap-1">
                            <label className="field-label">Aan{contactPerson ? ` \u2014 ${contactPerson}` : ''}</label>
                            <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="recruiter@bedrijf.be" className="field-input" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="field-label">Onderwerp</label>
                            <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="field-input" />
                          </div>
                          {sendError && sendError !== GMAIL_NOT_CONNECTED && (
                            <p className="text-xs text-red">{sendError}</p>
                          )}
                          <button onClick={sendViaGmail} disabled={sending} className="btn btn-lg btn-primary">
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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

          {error && <p className="mx-5 mb-2 text-xs flex-shrink-0 text-red">{error}</p>}

          {/* Sticky footer */}
          <div className="modal-footer">
            <button onClick={onClose} className="btn btn-lg btn-secondary">Annuleer</button>
            <button onClick={confirm} disabled={saving} className="btn btn-lg btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {saving ? 'Opslaan\u2026' : 'Bevestig sollicitatie'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
