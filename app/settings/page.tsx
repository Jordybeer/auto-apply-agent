'use client';

import SettingsMenu from '@/components/SettingsMenu';

export default function SettingsPage() {
  return (
    <div className="min-h-screen px-5 py-10" style={{ background: 'var(--bg)' }}>
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-5" style={{ color: 'var(--text)' }}>
          Instellingen
        </h1>
        <SettingsMenu />
      </div>
    </div>
  );
}
