'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import Lottie from 'lottie-react';
import checkmarkJson from '@/app/lotties/checkmark.json';
import loaderJson from '@/app/lotties/loader-dots.json';



type Settings = {
  scrape_api_key: string | null;
  keywords: string[];
  city: string;
  radius: number;
  last_scrape_at: string | null;
  user: { email: string; avatar_url: string | null };
};

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
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
      });
  }, []);

  const showSuccess = (key: string) => {
    setSuccess(key);
    setTimeout(() => setSuccess(null), 2000);
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

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    const data = await save({ scrape_api_key: apiKeyInput }, 'apikey');
    if (data.success) {
      setSettings((s) => s ? { ...s, scrape_api_key: `${apiKeyInput.slice(0, 6)}...${apiKeyInput.slice(-4)}` } : s);
      setApiKeyInput('');
    }
  };

  const handleDeleteApiKey = async () => {
    setLoading('apikey');
    await fetch('/api/settings', { method: 'DELETE' });
    setSettings((s) => s ? { ...s, scrape_api_key: null } : s);
    setLoading(null);
  };

  const handleAddKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || settings?.keywords.includes(kw)) return;
    const updated = [...(settings?.keywords ?? []), kw];
    setSettings((s) => s ? { ...s, keywords: updated } : s);
    setKeywordInput('');
    save({ keywords: updated }, 'keywords');
  };

  const handleRemoveKeyword = (kw: string) => {
    const updated = (settings?.keywords ?? []).filter((k) => k !== kw);
    setSettings((s) => s ? { ...s, keywords: updated } : s);
    save({ keywords: updated }, 'keywords');
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

  const SuccessIcon = ({ id }: { id: string }) =>
    success === id ? (
      <Lottie animationData={checkmarkJson} loop={false} style={{ width: 28, height: 28 }} />
    ) : null;

  const LoadingIcon = ({ id }: { id: string }) =>
    loading === id ? (
      <Lottie animationData={loaderJson} loop style={{ width: 32, height: 32 }} />
    ) : null;

  if (!settings) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Lottie animationData={loaderJson} loop style={{ width: 48, height: 48 }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-6 py-10">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-white text-xl font-semibold mb-6">Instellingen</h1>

        {/* Account info */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
          {settings.user?.avatar_url ? (
            <img src={settings.user.avatar_url} className="w-10 h-10 rounded-full" alt="avatar" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm font-bold">
              {settings.user?.email?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-white text-sm font-medium">{settings.user?.email}</p>
            {settings.last_scrape_at && (
              <p className="text-zinc-500 text-xs">
                Laatste scrape: {new Date(settings.last_scrape_at).toLocaleString('nl-BE')}
              </p>
            )}
          </div>
        </div>

        {/* API Key */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">scrape.do API Key</p>
            <SuccessIcon id="apikey" />
          </div>
          {settings.scrape_api_key ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-300 bg-zinc-800 px-3 py-1.5 rounded-lg">
                {settings.scrape_api_key}
              </span>
              <button
                onClick={handleDeleteApiKey}
                disabled={loading === 'apikey'}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Verwijder
              </button>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 italic">Geen key ingesteld</p>
          )}
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
              placeholder="Nieuwe API key..."
              className="flex-1 bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSaveApiKey}
              disabled={loading === 'apikey' || !apiKeyInput.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center"
            >
              <LoadingIcon id="apikey" />
              {loading !== 'apikey' && 'Opslaan'}
            </button>
          </div>
        </div>

        {/* Keywords */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Zoekwoorden</p>
            <SuccessIcon id="keywords" />
          </div>
          <div className="flex flex-wrap gap-2 min-h-[28px]">
            {(settings.keywords.length > 0 ? settings.keywords : []).map((kw) => (
              <span key={kw}
                className="flex items-center gap-1 bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-lg border border-zinc-700">
                {kw}
                <button onClick={() => handleRemoveKeyword(kw)} className="text-zinc-500 hover:text-red-400 ml-1 leading-none">×</button>
              </span>
            ))}
            {settings.keywords.length === 0 && (
              <p className="text-zinc-500 text-xs italic">Gebruikt standaard keywords</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
              placeholder="Voeg zoekwoord toe..."
              className="flex-1 bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAddKeyword}
              disabled={!keywordInput.trim()}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Locatie */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Locatie</p>
            <SuccessIcon id="location" />
          </div>
          <div className="flex gap-2 items-center">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Stad..."
              className="flex-1 bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:outline-none focus:border-blue-500"
            />
            <input
              type="number"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              min={5} max={100}
              className="w-16 bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-700 focus:outline-none focus:border-blue-500"
            />
            <span className="text-zinc-500 text-xs">km</span>
            <button
              onClick={handleSaveLocation}
              disabled={loading === 'location'}
              className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center"
            >
              <LoadingIcon id="location" />
              {loading !== 'location' && 'Opslaan'}
            </button>
          </div>
        </div>

        {/* Account / logout */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-sm font-medium text-white mb-3">Account</p>
          <button
            onClick={handleLogout}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-red-400 hover:text-red-300 text-sm font-medium py-2 px-4 rounded-lg border border-zinc-700 transition-colors"
          >
            Uitloggen
          </button>
        </div>

        {/* Gevaarzone */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-red-900/50 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-400">Gevaarzone</p>
            <SuccessIcon id="danger" />
          </div>
          <p className="text-xs text-zinc-500">Verwijdert alle vacatures en sollicitaties permanent.</p>
          <button
            onClick={() => setShowDeleteWarning(true)}
            className="w-full bg-red-950 hover:bg-red-900 text-red-400 text-sm font-medium py-2 px-4 rounded-lg border border-red-900 transition-colors"
          >
            Verwijder alle vacatures
          </button>
        </div>
      </div>

      {/* Warning popup */}
      {showDeleteWarning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <p className="text-white font-semibold">Weet je het zeker?</p>
            <p className="text-zinc-400 text-sm">
              Alle vacatures en sollicitaties worden permanent verwijderd. Dit kan niet ongedaan worden gemaakt.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteWarning(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2 rounded-lg transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleDeleteJobs}
                disabled={loading === 'danger'}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors flex items-center justify-center"
              >
                <LoadingIcon id="danger" />
                {loading !== 'danger' && 'Ja, verwijder alles'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
