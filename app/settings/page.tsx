'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Lottie from 'lottie-react';
import checkmarkJson from '@/app/lotties/checkmark.json';
import loaderJson from '@/app/lotties/loader-dots.json';

type Settings = {
  adzuna_app_id:  string | null;
  adzuna_app_key: string | null;
  groq_api_key:   string | null;
  keywords: string[];
  city: string;
  radius: number;
  last_scrape_at: string | null;
  user: { email: string; avatar_url: string | null };
};

const card: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: 'easeOut' as const },
  }),
};

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [settings, setSettings] = useState<Settings | null>(null);
  const [adzunaIdInput,  setAdzunaIdInput]  = useState('');
  const [adzunaKeyInput, setAdzunaKeyInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [city, setCity] = useState('Antwerpen');
  const [radius, setRadius] = useState(30);
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d: Settings) => {
        setSettings(d);
        setCity(d.city ?? 'Antwerpen');
        setRadius(d.radius ?? 30);
        if (d.keywords?.length) {
          localStorage.setItem('ja_tags', JSON.stringify(d.keywords));
        }
      });
  }, []);

  const showSuccess = (key: string) => {
    setSuccess(key);
    setTimeout(() => setSuccess(null), 2200);
  };

  const save = async (body: object, key: string) => {
    setLoading(key);
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(null);
    if (data.success) showSuccess(key);
    return data;
  };

  const handleSaveAdzuna = async () => {
    if (!adzunaIdInput.trim() || !adzunaKeyInput.trim()) return;
    const data = await save({ adzuna_app_id: adzunaIdInput, adzuna_app_key: adzunaKeyInput }, 'adzuna');
    if (data.success) {
      setSettings((s) => s ? {
        ...s,
        adzuna_app_id:  `${adzunaIdInput.slice(0, 4)}...${adzunaIdInput.slice(-4)}`,
        adzuna_app_key: `${adzunaKeyInput.slice(0, 4)}...${adzunaKeyInput.slice(-4)}`,
      } : s);
      setAdzunaIdInput('');
      setAdzunaKeyInput('');
    }
  };

  const handleDeleteAdzuna = async () => {
    setLoading('adzuna');
    await fetch('/api/settings?target=adzuna', { method: 'DELETE' });
    setSettings((s) => s ? { ...s, adzuna_app_id: null, adzuna_app_key: null } : s);
    setLoading(null);
  };

  const handleAddKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || settings?.keywords.includes(kw)) return;
    const updated = [...(settings?.keywords ?? []), kw];
    setSettings((s) => s ? { ...s, keywords: updated } : s);
    setKeywordInput('');
    save({ keywords: updated }, 'keywords');
    localStorage.setItem('ja_tags', JSON.stringify(updated));
  };

  const handleRemoveKeyword = (kw: string) => {
    const updated = (settings?.keywords ?? []).filter((k) => k !== kw);
    setSettings((s) => s ? { ...s, keywords: updated } : s);
    save({ keywords: updated }, 'keywords');
    localStorage.setItem('ja_tags', JSON.stringify(updated));
  };

  const handleSaveLocation = () => save({ city, radius }, 'location');

  const handleDeleteJobs = async () => {
    setLoading('danger');
    await fetch('/api/settings?target=jobs', { method: 'DELETE' });
    setLoading(null);
    setShowDeleteWarning(false);
    showSuccess('danger');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const SuccessIcon = ({ id }: { id: string }) => (
    <AnimatePresence>
      {success === id && (
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
        >
          <Lottie animationData={checkmarkJson} loop={false} style={{ width: 28, height: 28 }} />
        </motion.span>
      )}
    </AnimatePresence>
  );

  const Spinner = ({ id }: { id: string }) =>
    loading === id ? (
      <Lottie animationData={loaderJson} loop style={{ width: 30, height: 30 }} />
    ) : null;

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f11' }}>
        <Lottie animationData={loaderJson} loop style={{ width: 52, height: 52 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-10" style={{ background: '#0f0f11' }}>
      <div className="max-w-md mx-auto space-y-3">

        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-white text-xl font-semibold mb-5"
        >
          Instellingen
        </motion.h1>

        {/* Account info */}
        <motion.div custom={0} variants={card} initial="hidden" animate="visible"
          className="p-4 rounded-2xl flex items-center gap-3"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
          {settings.user?.avatar_url ? (
            <img src={settings.user.avatar_url} className="w-10 h-10 rounded-full ring-2 ring-white/10" alt="avatar" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ background: '#2a2a32' }}>
              {settings.user?.email?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-white text-sm font-medium">{settings.user?.email}</p>
            {settings.last_scrape_at ? (
              <p className="text-xs" style={{ color: '#6b6b7b' }}>
                Laatste scrape: {new Date(settings.last_scrape_at).toLocaleString('nl-BE')}
              </p>
            ) : (
              <p className="text-xs" style={{ color: '#6b6b7b' }}>Nog niet gescrapet</p>
            )}
          </div>
        </motion.div>

        {/* Adzuna API credentials */}
        <motion.div custom={1} variants={card} initial="hidden" animate="visible"
          className="p-4 rounded-2xl space-y-3"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Adzuna API</p>
            <SuccessIcon id="adzuna" />
          </div>

          {settings.adzuna_app_id && settings.adzuna_app_key ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs px-2 py-1 rounded-lg" style={{ background: '#2a2a32', color: '#c4c4d0' }}>
                ID: {settings.adzuna_app_id}
              </span>
              <span className="font-mono text-xs px-2 py-1 rounded-lg" style={{ background: '#2a2a32', color: '#c4c4d0' }}>
                Key: {settings.adzuna_app_key}
              </span>
              <button onClick={handleDeleteAdzuna} disabled={loading === 'adzuna'}
                className="text-xs transition-colors" style={{ color: '#f87171' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
                onMouseLeave={e => (e.currentTarget.style.color = '#f87171')}>
                Verwijder
              </button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: '#6b6b7b' }}>
              Haal gratis credentials op via{' '}
              <a href="https://developer.adzuna.com" target="_blank" rel="noreferrer"
                className="underline" style={{ color: '#6366f1' }}>developer.adzuna.com</a>
            </p>
          )}

          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={adzunaIdInput}
              onChange={(e) => setAdzunaIdInput(e.target.value)}
              placeholder="App ID..."
              className="flex-1 text-white text-sm px-3 py-2 rounded-lg outline-none transition-colors"
              style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={e => (e.currentTarget.style.borderColor = '#3a3a45')}
            />
            <div className="flex gap-2">
              <input
                type="password"
                value={adzunaKeyInput}
                onChange={(e) => setAdzunaKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveAdzuna()}
                placeholder="App Key..."
                className="flex-1 text-white text-sm px-3 py-2 rounded-lg outline-none transition-colors"
                style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
                onBlur={e => (e.currentTarget.style.borderColor = '#3a3a45')}
              />
              <button onClick={handleSaveAdzuna}
                disabled={loading === 'adzuna' || !adzunaIdInput.trim() || !adzunaKeyInput.trim()}
                className="text-white text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-40 flex items-center justify-center min-w-[80px]"
                style={{ background: '#6366f1' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
                onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}>
                <Spinner id="adzuna" />
                {loading !== 'adzuna' && 'Opslaan'}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Keywords */}
        <motion.div custom={2} variants={card} initial="hidden" animate="visible"
          className="p-4 rounded-2xl space-y-3"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Zoekwoorden</p>
            <SuccessIcon id="keywords" />
          </div>
          <div className="flex flex-wrap gap-2 min-h-[28px]">
            <AnimatePresence>
              {settings.keywords.length > 0 ? settings.keywords.map((kw) => (
                <motion.span key={kw}
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                  style={{ background: '#2a2a32', color: '#c4c4d0', border: '1px solid #3a3a45' }}>
                  {kw}
                  <button onClick={() => handleRemoveKeyword(kw)}
                    className="ml-1 leading-none transition-colors"
                    style={{ color: '#6b6b7b' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#6b6b7b')}>
                    ×
                  </button>
                </motion.span>
              )) : (
                <p className="text-xs italic" style={{ color: '#6b6b7b' }}>Gebruikt standaard keywords</p>
              )}
            </AnimatePresence>
          </div>
          <div className="flex gap-2">
            <input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
              placeholder="Voeg zoekwoord toe..."
              className="flex-1 text-white text-sm px-3 py-2 rounded-lg outline-none transition-colors"
              style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={e => (e.currentTarget.style.borderColor = '#3a3a45')}
            />
            <button onClick={handleAddKeyword} disabled={!keywordInput.trim()}
              className="text-white text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-40"
              style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#3a3a45')}
              onMouseLeave={e => (e.currentTarget.style.background = '#2a2a32')}>
              +
            </button>
          </div>
        </motion.div>

        {/* Locatie */}
        <motion.div custom={3} variants={card} initial="hidden" animate="visible"
          className="p-4 rounded-2xl space-y-3"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Locatie</p>
            <SuccessIcon id="location" />
          </div>
          <div className="flex gap-2 items-center">
            <input value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="Stad..."
              className="flex-1 text-white text-sm px-3 py-2 rounded-lg outline-none transition-colors"
              style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={e => (e.currentTarget.style.borderColor = '#3a3a45')}
            />
            <input type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))}
              min={5} max={100}
              className="w-16 text-white text-sm px-3 py-2 rounded-lg outline-none text-center"
              style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={e => (e.currentTarget.style.borderColor = '#3a3a45')}
            />
            <span className="text-xs" style={{ color: '#6b6b7b' }}>km</span>
            <button onClick={handleSaveLocation} disabled={loading === 'location'}
              className="text-white text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-40 flex items-center justify-center min-w-[80px]"
              style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#3a3a45')}
              onMouseLeave={e => (e.currentTarget.style.background = '#2a2a32')}>
              <Spinner id="location" />
              {loading !== 'location' && 'Opslaan'}
            </button>
          </div>
        </motion.div>

        {/* Account */}
        <motion.div custom={4} variants={card} initial="hidden" animate="visible"
          className="p-4 rounded-2xl"
          style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
          <p className="text-sm font-medium text-white mb-3">Account</p>
          <button onClick={handleLogout}
            className="w-full text-sm font-medium py-2 px-4 rounded-lg transition-all"
            style={{ background: '#2a2a32', border: '1px solid #3a3a45', color: '#f87171' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#3a2a2a')}
            onMouseLeave={e => (e.currentTarget.style.background = '#2a2a32')}>
            Uitloggen
          </button>
        </motion.div>

        {/* Gevaarzone */}
        <motion.div custom={5} variants={card} initial="hidden" animate="visible"
          className="p-4 rounded-2xl space-y-3"
          style={{ background: '#1a1a1f', border: '1px solid #3a1a1a' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: '#f87171' }}>Gevaarzone</p>
            <SuccessIcon id="danger" />
          </div>
          <p className="text-xs" style={{ color: '#6b6b7b' }}>Verwijdert alle vacatures en sollicitaties permanent.</p>
          <button onClick={() => setShowDeleteWarning(true)}
            className="w-full text-sm font-medium py-2 px-4 rounded-lg transition-all"
            style={{ background: '#2a1a1a', border: '1px solid #5a2a2a', color: '#f87171' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#3a1a1a')}
            onMouseLeave={e => (e.currentTarget.style.background = '#2a1a1a')}>
            Verwijder alle vacatures
          </button>
        </motion.div>

      </div>

      {/* Delete warning modal */}
      <AnimatePresence>
        {showDeleteWarning && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-6"
            style={{ background: 'rgba(0,0,0,0.75)' }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' as const }}
              className="rounded-2xl p-6 max-w-sm w-full space-y-4"
              style={{ background: '#1a1a1f', border: '1px solid #3a1a1a' }}>
              <p className="text-white font-semibold">Weet je het zeker?</p>
              <p className="text-sm" style={{ color: '#9a9aaa' }}>
                Alle vacatures en sollicitaties worden permanent verwijderd. Dit kan niet ongedaan worden gemaakt.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteWarning(false)}
                  className="flex-1 text-white text-sm py-2 rounded-lg transition-all"
                  style={{ background: '#2a2a32', border: '1px solid #3a3a45' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#3a3a45')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#2a2a32')}>
                  Annuleren
                </button>
                <button onClick={handleDeleteJobs} disabled={loading === 'danger'}
                  className="flex-1 text-white text-sm py-2 rounded-lg transition-all disabled:opacity-40 flex items-center justify-center"
                  style={{ background: '#dc2626' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#b91c1c')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#dc2626')}>
                  <Spinner id="danger" />
                  {loading !== 'danger' && 'Ja, verwijder alles'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
