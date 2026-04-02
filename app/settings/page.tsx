'use client';

import SettingsMenu from '@/components/SettingsMenu';

export default function SettingsPage() {
  return (
    <main className="page-shell flex flex-col gap-5">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
        Instellingen
      </h1>
      <SettingsMenu />
    </main>
  );
}
