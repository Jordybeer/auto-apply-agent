'use client';

import { useState, useRef, useEffect } from 'react';
import { CheckIcon } from '@radix-ui/react-icons';

const BELGIAN_CITIES = [
  'Antwerpen','Gent','Brussel','Luik','Brugge','Mechelen','Leuven','Hasselt','Namen',
  'Mons','Kortrijk','Aalst','Genk','Sint-Niklaas','Roeselare','Turnhout','Lier',
  'Herentals','Geel','Mol','Boom','Willebroek','Kontich','Mortsel','Deurne',
  'Hoboken','Merksem','Schoten','Wijnegem','Wommelgem','Stabroek','Kapellen',
  'Brasschaat','Edegem','Aartselaar','Hemiksem','Niel','Rumst','Duffel',
  'Sint-Katelijne-Waver','Bonheiden','Putte','Berlaar','Nijlen','Heist-op-den-Berg',
  'Aarschot','Diest','Tienen','Wavre','Ottignies','Waterloo','Ixelles',
  'Etterbeek','Schaerbeek','Molenbeek','Anderlecht','Jette','Laeken',
].sort();

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function CityCombobox({ value, onChange }: Props) {
  const [input, setInput]     = useState(value);
  const [open, setOpen]       = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep input in sync when value changes externally
  useEffect(() => { setInput(value); }, [value]);

  // Filter cities as user types
  useEffect(() => {
    const q = input.trim().toLowerCase();
    if (!q) { setFiltered(BELGIAN_CITIES); return; }
    setFiltered(BELGIAN_CITIES.filter(c => c.toLowerCase().includes(q)));
  }, [input]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (city: string) => {
    setInput(city);
    onChange(city);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Kies een stad..."
        className="field-input"
        autoComplete="off"
      />

      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 400,
          background: 'var(--surface)',
          border: '1px solid var(--border-bright)',
          borderRadius: '0.75rem',
          maxHeight: '12rem',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
          overscrollBehavior: 'contain',
        }}>
          {filtered.map(city => (
            <button
              key={city}
              type="button"
              // onMouseDown instead of onClick — prevents input blur closing dropdown before click fires
              onMouseDown={e => { e.preventDefault(); select(city); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                background: city === value ? 'var(--accent-dim)' : 'transparent',
                color: city === value ? 'var(--accent)' : 'var(--text)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (city !== value) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = city === value ? 'var(--accent-dim)' : 'transparent'; }}
            >
              <CheckIcon style={{ opacity: city === value ? 1 : 0, flexShrink: 0, color: 'var(--accent)' }} />
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
