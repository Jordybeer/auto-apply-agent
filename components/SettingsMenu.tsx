'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import CityCombobox from '@/components/CityCombobox';

function KeyRow({
  label, sublabel, linkHref, linkText, placeholder, accentColor, currentKey, onSave, onDelete,
}: {
  label: string; sublabel: string; linkHref: string; linkText: string;
  placeholder: string; accentColor: string; currentKey: string | null;
  onSave: (val: string) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    if (!input.trim()) return;
    setLoading(true); setMessage('');
    await onSave(input.trim());
    setLoading(false);
    setMessage('✓ Opgeslagen');
    setInput('');
    setTimeout(() => setMessage(''), 2500);
  };

  const handleDelete = async () => {
    setLoading(true);
    await onDelete();
    setLoading(false);
    setMessage('Key verwijderd');
    setTimeout(() => setMessage(''), 2500);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{label}</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>
          {sublabel}{' '}
          <a href={linkHref} target="_blank" rel="noopener noreferrer" style={{ color: accentColor }} className="underline underline-offset-2">{linkText}</a>
        </p>
      </div>
      {currentKey ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--surface2)' }}>
          <span className="font-mono text-xs" style={{ color: 'var(--text3)' }}>{currentKey}</span>
          <button onClick={handleDelete} disabled={loading} className="text-xs hover:opacity-80 disabled:opacity-40" style={{ color: 'var(--red)' }}>Verwijder</button>
        </div>
      ) : (
        <p className="text-xs italic" style={{ color: 'var(--text2)' }}>Geen key ingesteld</p>
      )}
      <div className="flex gap-2">
        <input type="password" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} placeholder={placeholder}
          className="flex-1 text-sm px-3 py-2 rounded-xl outline-none font-mono"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        <button onClick={handleSave} disabled={loading || !input.trim()} className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40" style={{ background: accentColor, color: '#fff' }}>
          {loading ? '...' : 'Opslaan'}
        </button>
      </div>
      {message && <p className="text-xs" style={{ color: message.startsWith('✓') ? 'var(--green)' : 'var(--text2)' }}>{message}</p>}
    </div>
  );
}

function CvSection() {
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/cv').then((r) => r.json()).then((d) => setCvUrl(d.url ?? null));
  }, []);

  const handleUpload = async (file: File) => {
    const isPdf =
      file.type === 'application/pdf' ||
      (file.type === 'application/octet-stream' && file.name.toLowerCase().endsWith('.pdf'));
    if (!isPdf) { setMessage('Alleen PDF toegestaan'); return; }
    setLoading(true); setMessage('');
    const form = new FormData();
    form.append('cv', file);
    const res = await fetch('/api/cv', { method: 'POST', body: form });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setMessage('✓ CV opgeslagen');
      const r = await fetch('/api/cv');
      const d = await r.json();
      setCvUrl(d.url ?? null);
    } else {
      setMessage(data.error || 'Upload mislukt');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>📎 CV</p>
        <p className="text-xs" style={{ color: 'var(--text2)' }}>Wordt gebruikt voor AI-scoring en motivatiebrieven. Alleen PDF, max 5MB.</p>
      </div>
      {cvUrl ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--surface2)' }}>
          <span className="text-xs" style={{ color: 'var(--green)' }}>✅ CV opgeslagen</span>
          <div className="flex items-center gap-3">
            <a href={cvUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2" style={{ color: 'var(--accent)' }}>Bekijk</a>
            <button onClick={() => fileRef.current?.click()} disabled={loading} className="text-xs hover:opacity-80 disabled:opacity-40" style={{ color: '#ffd60a' }}>
              {loading ? 'Uploaden...' : 'Vervang'}
            </button>
          </div>
        </div>
      ) : (
        <div onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer"
          style={{ borderColor: 'var(--border)' }}>
          <span className="text-xl">📄</span>
          <p className="text-xs" style={{ color: 'var(--text2)' }}>Klik om CV te uploaden (PDF)</p>
        </div>
      )}
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      {message && <p className="text-xs" style={{ color: message.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{message}</p>}
    </div>
  );
}

function LocationSection() {
  const [city, setCity] = useState('Antwerpen');
  const [radius, setRadius] = useState(30);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.city) setCity(d.city);
      if (d.radius) setRadius(d.radius);
    });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, radius }),
    });
    const d = await res.json();
    setLoading(false);
    if (d.success) { setMessage('✓ Opgeslagen'); setTimeout(() => setMessage(''), 2500); }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>📍 Locatie</p>
      <CityCombobox value={city} onChange={setCity} />
      <div className="flex items-center gap-2">
        <input
          type="number" value={radius} min={5} max={100}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-16 text-sm px-3 py-2 rounded-xl outline-none text-center"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <span className="text-xs flex-1" style={{ color: 'var(--text2)' }}>km straal</span>
        <button onClick={handleSave} disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          {loading ? '...' : 'Opslaan'}
        </button>
      </div>
      {message && <p className="text-xs" style={{ color: 'var(--green)' }}>{message}</p>}
    </div>
  );
}

export default function SettingsMenu() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [scrapeKey, setScrapeKey]   = useState<string | null>(null);
  const [groqKey, setGroqKey]       = useState<string | null>(null);
  const [email, setEmail]           = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [lastScrape, setLastScrape] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      setScrapeKey(d.scrape_api_key ?? null);
      setGroqKey(d.groq_api_key ?? null);
      setEmail(d.user?.email ?? null);
      setAvatarUrl(d.user?.avatar_url ?? null);
      setLastScrape(d.last_scrape_at ?? null);
    });
  }, []);

  const saveScrape   = async (val: string) => {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scrape_api_key: val }) });
    const d = await res.json();
    if (d.success) setScrapeKey(`${val.slice(0, 6)}...${val.slice(-4)}`);
  };
  const deleteScrape = async () => { await fetch('/api/settings', { method: 'DELETE' }); setScrapeKey(null); };

  const saveGroq     = async (val: string) => {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groq_api_key: val }) });
    const d = await res.json();
    if (d.success) setGroqKey(`${val.slice(0, 6)}...${val.slice(-4)}`);
  };
  const deleteGroq   = async () => { await fetch('/api/settings?target=groq', { method: 'DELETE' }); setGroqKey(null); };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          {avatarUrl ? (
            <img src={avatarUrl} className="w-9 h-9 rounded-full ring-2 ring-white/10 flex-shrink-0" alt="avatar" />
          ) : (
            <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
              {email?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{email ?? '…'}</p>
            <p className="text-xs" style={{ color: 'var(--text2)' }}>
              {lastScrape
                ? `Laatste scrape: ${new Date(lastScrape).toLocaleString('nl-BE')}`
                : 'Nog niet gescrapet'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{ background: 'var(--surface2)', color: 'var(--red)', border: '1px solid var(--border)' }}>
          Uitloggen
        </button>
      </div>

      <KeyRow label="scrape.do API Key" sublabel="Vereist voor scrapen. Gratis op" linkHref="https://scrape.do" linkText="scrape.do" placeholder="Plak je scrape.do token..." accentColor="#0a84ff" currentKey={scrapeKey} onSave={saveScrape} onDelete={deleteScrape} />
      <KeyRow label="Groq API Key" sublabel="Voor AI-scoring & motivatiebrieven. Gratis op" linkHref="https://console.groq.com" linkText="console.groq.com" placeholder="Plak je Groq API key..." accentColor="#7c3aed" currentKey={groqKey} onSave={saveGroq} onDelete={deleteGroq} />
      <LocationSection />
      <CvSection />
    </div>
  );
}
