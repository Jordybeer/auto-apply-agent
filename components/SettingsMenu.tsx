'use client';

import { useState, useEffect } from 'react';

export default function SettingsMenu() {
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setCurrentKey(d.scrape_api_key ?? null));
  }, []);

  const handleSave = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setMessage('');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrape_api_key: input }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setMessage('✓ API key opgeslagen');
      setCurrentKey(`${input.slice(0, 6)}...${input.slice(-4)}`);
      setInput('');
    } else {
      setMessage(`Fout: ${data.error}`);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    await fetch('/api/settings', { method: 'DELETE' });
    setCurrentKey(null);
    setMessage('API key verwijderd');
    setLoading(false);
  };

  return (
    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-700 space-y-4">
      <h2 className="text-lg font-semibold text-white">Instellingen</h2>

      <div className="space-y-1">
        <p className="text-sm text-zinc-400">scrape.do API Key</p>
        {currentKey ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-zinc-300 bg-zinc-800 px-3 py-1.5 rounded-lg">
              {currentKey}
            </span>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Verwijder
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 italic">Geen key — gebruikt gedeelde key</p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nieuwe API key..."
          className="flex-1 bg-zinc-800 text-white text-sm px-3 py-2 rounded-lg border border-zinc-600 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSave}
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg"
        >
          {loading ? '...' : 'Opslaan'}
        </button>
      </div>

      {message && <p className="text-sm text-zinc-400">{message}</p>}
    </div>
  );
}