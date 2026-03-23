import SettingsMenu from '@/components/SettingsMenu';

export default function SettingsPage() {
  return (
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Instellingen</h1>
      <SettingsMenu />
    </main>
  );
}