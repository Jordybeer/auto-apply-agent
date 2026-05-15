'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { StudentJobPrefs } from '@/lib/search-mode';

const PRESET_SECTORS = ['Horeca', 'Retail', 'Logistiek', 'Evenementen', 'Administratie', 'IT', 'Zorg', 'Tuinbouw'];

interface Props {
  value: StudentJobPrefs;
  onChange: (prefs: StudentJobPrefs) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '10px 12px', fontSize: 16, color: 'var(--text)', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6,
};
const cardStyle: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 16, padding: 16, marginBottom: 12,
  border: '1px solid var(--border)',
};

export default function StudentJobForm({ value, onChange }: Props) {
  const [newSector, setNewSector] = useState('');

  function addSector(s: string) {
    const t = s.trim();
    if (!t || value.sectors.includes(t)) return;
    onChange({ ...value, sectors: [...value.sectors, t] });
    setNewSector('');
  }
  function removeSector(s: string) {
    onChange({ ...value, sectors: value.sectors.filter(x => x !== s) });
  }

  return (
    <div>
      {/* Hours */}
      <div style={cardStyle}>
        <label style={labelStyle}>
          Max uren per week: <strong style={{ color: 'var(--accent-bright)' }}>{value.max_hours_per_week}u</strong>
        </label>
        <input type="range" min={1} max={40} step={1} value={value.max_hours_per_week}
          onChange={e => onChange({ ...value, max_hours_per_week: Number(e.target.value) })}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
          <span>1u</span><span>20u</span><span>40u</span>
        </div>
      </div>

      {/* Flexible schedule toggle */}
      <div style={cardStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <span>Flexibel rooster vereist</span>
          <button type="button"
            onClick={() => onChange({ ...value, flexible_schedule: !value.flexible_schedule })}
            style={{
              width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: value.flexible_schedule ? 'var(--accent)' : 'var(--surface3)',
              transition: 'background 0.2s', position: 'relative', flexShrink: 0,
            }}
            aria-pressed={value.flexible_schedule}>
            <span style={{
              position: 'absolute', top: 3, left: value.flexible_schedule ? 21 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </button>
        </label>
      </div>

      {/* Student status */}
      <div style={cardStyle}>
        <label style={labelStyle}>Studentenstatus</label>
        <select value={value.student_status}
          onChange={e => onChange({ ...value, student_status: e.target.value as StudentJobPrefs['student_status'] })}
          style={{ ...inputStyle }}>
          <option value="hoger_onderwijs">Hoger onderwijs (univ / hogeschool)</option>
          <option value="secundair">Secundair onderwijs</option>
          <option value="andere">Andere</option>
        </select>
      </div>

      {/* Availability */}
      <div style={cardStyle}>
        <label style={labelStyle}>Beschikbaar vanaf (optioneel)</label>
        <input type="date" value={value.availability_from ?? ''}
          onChange={e => onChange({ ...value, availability_from: e.target.value || null })}
          style={{ ...inputStyle }} />
      </div>

      {/* Sectors */}
      <div style={cardStyle}>
        <label style={labelStyle}>Voorkeurssectoren (optioneel)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PRESET_SECTORS.map(s => {
            const selected = value.sectors.includes(s);
            return (
              <button key={s} type="button" onClick={() => selected ? removeSector(s) : addSector(s)}
                style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: selected ? 'var(--accent)' : 'var(--surface2)',
                  color: selected ? '#fff' : 'var(--text2)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                {s}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="Andere sector…" value={newSector}
            onChange={e => setNewSector(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSector(newSector); } }}
            style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={() => addSector(newSector)} disabled={!newSector.trim()}
            style={{
              background: newSector.trim() ? 'var(--accent)' : 'var(--surface2)',
              color: newSector.trim() ? '#fff' : 'var(--text2)',
              border: 'none', borderRadius: 10, padding: '0 14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, height: 44, flexShrink: 0, fontSize: 13, fontWeight: 600,
            }}>
            <Plus size={14} /> Voeg toe
          </button>
        </div>
        {value.sectors.filter(s => !PRESET_SECTORS.includes(s)).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {value.sectors.filter(s => !PRESET_SECTORS.includes(s)).map(s => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                {s}
                <button type="button" onClick={() => removeSector(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 0 }}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
