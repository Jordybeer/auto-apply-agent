'use client';

import { useState, useEffect, useRef } from 'react';

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
    <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs" style={{ color: '#6b6b7b' }}>
          {sublabel}{' '}
          <a href={linkHref} target="_blank" rel="noopener noreferrer" style={{ color: accentColor }} className="underline underline-offset-2">{linkText}</a>
        </p>
      </div>
      {currentKey ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: '#2a2a32' }}>
          <span className="font-mono text-xs" style={{ color: '#c4c4d0' }}>{currentKey}</span>
          <button onClick={handleDelete} disabled={loading} className="text-xs hover:opacity-80 disabled:opacity-40" style={{ color: '#f87171' }}>Verwijder</button>
        </div>
      ) : (
        <p className="text-xs italic" style={{ color: '#3a3a45' }}>Geen key ingesteld</p>
      )}
      <div className="flex gap-2">
        <input type="password" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} placeholder={placeholder}
          className="flex-1 text-sm px-3 py-2 rounded-xl outline-none font-mono"
          style={{ background: '#2a2a32', border: '1px solid #3a3a45', color: '#ffffff' }} />
        <button onClick={handleSave} disabled={loading || !input.trim()} className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40" style={{ background: accentColor, color: '#fff' }}>
          {loading ? '...' : 'Opslaan'}
        </button>
      </div>
      {message && <p className="text-xs" style={{ color: message.startsWith('✓') ? '#6ee7b7' : '#6b6b7b' }}>{message}</p>}
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
    if (file.type !== 'application/pdf') { setMessage('Alleen PDF toegestaan'); return; }
    setLoading(true); setMessage('');
    const form = new FormData();
    form.append('cv', file);
    const res = await fetch('/api/cv', { method: 'POST', body: form });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setMessage('✓ CV opgeslagen');
      // Refresh signed URL
      const r = await fetch('/api/cv');
      const d = await r.json();
      setCvUrl(d.url ?? null);
    } else {
      setMessage(data.error || 'Upload mislukt');
    }
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl p-4" style={{ background: '#1a1a1f', border: '1px solid #2a2a32' }}>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-white">📎 CV</p>
        <p className="text-xs" style={{ color: '#6b6b7b' }}>Wordt gebruikt voor AI-scoring en motivatiebrieven. Alleen PDF, max 5MB.</p>
      </div>

      {cvUrl ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: '#2a2a32' }}>
          <span className="text-xs" style={{ color: '#6ee7b7' }}>✅ CV opgeslagen</span>
          <div className="flex items-center gap-3">
            <a href={cvUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2" style={{ color: '#6366f1' }}>Bekijk</a>
            <button onClick={() => fileRef.current?.click()} disabled={loading} className="text-xs hover:opacity-80 disabled:opacity-40" style={{ color: '#ffd60a' }}>
              {loading ? 'Uploaden...' : 'Vervang'}
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed cursor-pointer"
          style={{ borderColor: '#2a2a32' }}
        >
          <span className="text-xl">📄</span>
          <p className="text-xs" style={{ color: '#6b6b7b' }}>Klik om CV te uploaden (PDF)</p>
        </div>
      )}

      <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      {message && <p className="text-xs" style={{ color: message.startsWith('✓') ? '#6ee7b7' : '#f87171' }}>{message}</p>}
    </div>
  );
}

export default function SettingsMenu() {
  const [scrapeKey, setScrapeKey] = useState<string | null>(null);
  const [groqKey, setGroqKey]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      setScrapeKey(d.scrape_api_key ?? null);
      setGroqKey(d.groq_api_key ?? null);
    });
  }, []);

  const saveScrape = async (val: string) => {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scrape_api_key: val }) });
    const d = await res.json();
    if (d.success) setScrapeKey(`${val.slice(0, 6)}...${val.slice(-4)}`);
  };
  const deleteScrape = async () => { await fetch('/api/settings', { method: 'DELETE' }); setScrapeKey(null); };

  const saveGroq = async (val: string) => {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groq_api_key: val }) });
    const d = await res.json();
    if (d.success) setGroqKey(`${val.slice(0, 6)}...${val.slice(-4)}`);
  };
  const deleteGroq = async () => { await fetch('/api/settings?target=groq', { method: 'DELETE' }); setGroqKey(null); };

  return (
    <div className="flex flex-col gap-3">
      <KeyRow label="scrape.do API Key" sublabel="Vereist voor scrapen. Gratis op" linkHref="https://scrape.do" linkText="scrape.do" placeholder="Plak je scrape.do token..." accentColor="#0a84ff" currentKey={scrapeKey} onSave={saveScrape} onDelete={deleteScrape} />
      <KeyRow label="Groq API Key" sublabel="Voor AI-scoring & motivatiebrieven. Gratis op" linkHref="https://console.groq.com" linkText="console.groq.com" placeholder="Plak je Groq API key..." accentColor="#7c3aed" currentKey={groqKey} onSave={saveGroq} onDelete={deleteGroq} />
      <CvSection />
    </div>
  );
}
