'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import Link from 'next/link';

type Notif = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((d) => { setNotifs(d.notifications ?? []); setLoading(false); })
      .catch(() => setLoading(false));

    fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read-all' }) });
  }, []);

  return (
    <main className="min-h-screen pb-[calc(var(--navbar-h)+env(safe-area-inset-bottom,0px))]" style={{ background: 'var(--bg)' }}>
      <div className="max-w-[560px] mx-auto px-4 pt-14 pb-4">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text1)' }}>Meldingen</h1>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)' }} />
          </div>
        )}

        {!loading && notifs.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20" style={{ color: 'var(--text3)' }}>
            <Bell size={40} strokeWidth={1.5} />
            <p className="text-sm">Geen meldingen</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {notifs.map((n, i) => {
            const card = (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl p-4"
                style={{
                  background: n.read_at ? 'var(--surface)' : 'var(--surface2)',
                  border: '1px solid var(--border)',
                  opacity: n.read_at ? 0.7 : 1,
                }}
              >
                <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text1)' }}>{n.title}</p>
                <p className="text-sm" style={{ color: 'var(--text2)' }}>{n.body}</p>
                <p className="text-[11px] mt-2" style={{ color: 'var(--text3)' }}>
                  {new Date(n.created_at).toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </motion.div>
            );

            return n.url ? (
              <Link key={n.id} href={n.url} className="no-underline block">{card}</Link>
            ) : (
              <div key={n.id}>{card}</div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
