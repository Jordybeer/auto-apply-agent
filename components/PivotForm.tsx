'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { PivotPrefs } from '@/lib/search-mode';

const PRESET_SECTORS = ['IT', 'Zorg', 'Onderwijs', 'Bouw', 'Logistiek', 'Marketing', 'Finance', 'Horeca', 'Non-profit'];

interface Props {
  value: PivotPrefs;
  onChange: (prefs: PivotPrefs) => void;
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

export default function PivotForm({ value, onChange }: Props) {
  const [newSector, setNewSector] = useState('');
  const [newSkill,  setNewSkill]  = useState('');

  function addSector(s: string) {
    const t = s.trim();
    if (!t || value.target_sectors.includes(t)) return;
    onChange({ ...value, target_sectors: [...value.target_sectors, t] });
    setNewSector('');
  }
  function removeSector(s: string) {
    onChange({ ...value, target_sectors: value.target_sectors.filter(x => x !== s) });
  }
  function addSkill(s: string) {
    const t = s.trim();
    if (!t || value.transferable_skills.includes(t)) return;
    onChange({ ...value, transferable_skills: [...value.transferable_skills, t] });
    setNewSkill('');
  }
  function removeSkill(s: string) {
    onChange({ ...value, transferable_skills: value.transferable_skills.filter(x => x !== s) });
  }

  return (
    <div>
      <div style={cardStyle}>
        <label style={labelStyle}>Doelsectoren</label>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>Welke sectoren wil je verkennen?</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PRESET_SECTORS.map(s => {
            const selected = value.target_sectors.includes(s);
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
            style={{ background: newSector.trim() ? 'var(--accent)' : 'var(--surface2)', color: newSector.trim() ? '#fff' : 'var(--text2)', border: 'none', borderRadius: 10, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, height: 44, flexShrink: 0, fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Voeg toe
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <label style={labelStyle}>Overdraagbare skills</label>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>Skills die je meeneemt naar de nieuwe sector.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {value.transferable_skills.map(s => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
              {s}
              <button type="button" onClick={() => removeSkill(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 0 }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="bv. Projectbeheer, klantencontact…" value={newSkill}
            onChange={e => setNewSkill(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(newSkill); } }}
            style={{ ...inputStyle, flex: 1 }} />
          <button type="button" onClick={() => addSkill(newSkill)} disabled={!newSkill.trim()}
            style={{ background: newSkill.trim() ? 'var(--accent)' : 'var(--surface2)', color: newSkill.trim() ? '#fff' : 'var(--text2)', border: 'none', borderRadius: 10, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, height: 44, flexShrink: 0, fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> Voeg toe
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <span>Open voor bijscholing / omscholing</span>
          <button type="button"
            onClick={() => onChange({ ...value, open_to_retraining: !value.open_to_retraining })}
            style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: value.open_to_retraining ? 'var(--accent)' : 'var(--surface3)', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}
            aria-pressed={value.open_to_retraining}>
            <span style={{ position: 'absolute', top: 3, left: value.open_to_retraining ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
          </button>
        </label>
      </div>
    </div>
  );
}
