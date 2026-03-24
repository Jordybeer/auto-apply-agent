'use client';

import { useState, useEffect } from 'react';

function KeyRow({
  label,
  sublabel,
  linkHref,
  linkText,
  placeholder,
  accentColor,
  currentKey,
  onSave,
  onDelete,
}: {
  label: string;
  sublabel: string;
  linkHref: string;
  linkText: string;
  placeholder: string;
  accentColor: string;
  currentKey: string | null;
  onSave: (val: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setMessage('');
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
          <a href={linkHref} target="_blank" rel="noopener noreferrer" style={{ color: accentColor }} className="underline underline-offset-2">
            {linkText}
          </a>
        </p>
      </div>

      {/* Current key display */}
      {currentKey ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl" style={{ background: '#2a2a32' }}>
          <span className="font-mono text-xs" style={{ color: '#c4c4d0' }}>{currentKey}</span>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ color: '#f87171' }}
          >
            Verwijder
          </button>
        </div>
      ) : (
        <p className="text-xs italic" style={{ color: '#3a3a45' }}>Geen key ingesteld</p>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder={placeholder}
          className="flex-1 text-sm px-3 py-2 rounded-xl outline-none font-mono"
          style={{
            background: '#2a2a32',
            border: '1px solid #3a3a45',
            color: '#ffffff',
          }}
        />
        <button
          onClick={handleSave}
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
          style={{ background: accentColor, color: '#fff' }}
        >
          {loading ? '...' : 'Opslaan'}
        </button>
      </div>

      {message && (
        <p className="text-xs" style={{ color: message.startsWith('✓') ? '#6ee7b7' : '#6b6b7b' }}>
          {message}
        </p>
      )}
    </div>
  );
}

export default function SettingsMenu() {
  const [scrapeKey, setScrapeKey] = useState<string | null>(null);
  const [groqKey, setGroqKey]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setScrapeKey(d.scrape_api_key ?? null);
        setGroqKey(d.groq_api_key ?? null);
      });
  }, []);

  const saveScrape = async (val: string) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrape_api_key: val }),
    });
    const d = await res.json();
    if (d.success) setScrapeKey(`${val.slice(0, 6)}...${val.slice(-4)}`);
  };

  const deleteScrape = async () => {
    await fetch('/api/settings', { method: 'DELETE' });
    setScrapeKey(null);
  };

  const saveGroq = async (val: string) => {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groq_api_key: val }),
    });
    const d = await res.json();
    if (d.success) setGroqKey(`${val.slice(0, 6)}...${val.slice(-4)}`);
  };

  const deleteGroq = async () => {
    await fetch('/api/settings?target=groq', { method: 'DELETE' });
    setGroqKey(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <KeyRow
        label="scrape.do API Key"
        sublabel="Vereist voor scrapen. Gratis account op"
        linkHref="https://scrape.do"
        linkText="scrape.do"
        placeholder="Plak je scrape.do token..."
        accentColor="#0a84ff"
        currentKey={scrapeKey}
        onSave={saveScrape}
        onDelete={deleteScrape}
      />
      <KeyRow
        label="Groq API Key"
        sublabel="Vereist voor AI-scoring & motivatiebrieven. Gratis op"
        linkHref="https://console.groq.com"
        linkText="console.groq.com"
        placeholder="Plak je Groq API key..."
        accentColor="#7c3aed"
        currentKey={groqKey}
        onSave={saveGroq}
        onDelete={deleteGroq}
      />
    </div>
  );
}
