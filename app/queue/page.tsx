"use client";

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import SwipeCard from '@/components/SwipeCard';
import Lottie from 'lottie-react';
import loaderDots from '@/app/lotties/loader-dots.json';
import Link from 'next/link';

export default function QueuePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [topIdx, setTopIdx]             = useState(0);

  useEffect(() => { fetchQueue(); }, []);

  const fetchQueue = async () => {
    const { data, error } = await supabase
      .from('applications')
      .select(`id, status, jobs ( title, company, url, source, description, location )`)
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setApplications(
        data.map((app: any) => ({ ...app, jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs }))
      );
    }
    setLoading(false);
  };

  const advance = () => setTopIdx((i) => i + 1);

  const handleSwipeLeft = async (id: string) => {
    await supabase.from('applications').update({ status: 'skipped' }).eq('id', id);
    advance();
  };

  const handleSwipeRight = async (id: string) => {
    await supabase.from('applications').update({ status: 'applied' }).eq('id', id);
    advance();
  };

  const visible = applications.slice(topIdx, topIdx + 3);
  const remaining = applications.length - topIdx;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Lottie animationData={loaderDots} loop autoplay style={{ width: 64, height: 32 }} />
        <p className="text-[var(--text2)] text-sm">Loading queue…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto px-4 py-8 select-none">
      {/* Nav */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-[var(--accent)] text-sm font-medium">← Back</Link>
        <span className="text-[var(--text2)] text-sm">
          {remaining > 0 ? `${remaining} left` : 'Done'}
        </span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-1">Review</h1>
      <p className="text-[var(--text2)] text-sm mb-8">Swipe right to apply · swipe left to skip</p>

      {/* Card stack */}
      {remaining > 0 ? (
        <div className="relative w-full" style={{ height: '62vh' }}>
          {visible.map((app, i) => (
            <div
              key={app.id}
              className="absolute inset-0"
              style={{
                transform: `scale(${1 - i * 0.04}) translateY(${i * 14}px)`,
                zIndex: visible.length - i,
                transition: 'transform 0.3s ease',
              }}
            >
              <SwipeCard
                application={app}
                onSwipeLeft={handleSwipeLeft}
                onSwipeRight={handleSwipeRight}
                isTop={i === 0}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
               style={{ background: 'var(--surface)' }}>✓</div>
          <h2 className="text-xl font-semibold">All caught up</h2>
          <p className="text-[var(--text2)] text-sm">No more jobs in the queue.</p>
          <Link
            href="/"
            className="mt-4 px-6 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Run pipeline again
          </Link>
        </div>
      )}

      {/* Bottom buttons */}
      {remaining > 0 && (
        <div className="flex items-center justify-center gap-10 mt-8">
          <button
            onClick={() => handleSwipeLeft(visible[0]?.id)}
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition-transform active:scale-90"
            style={{ background: 'rgba(255,69,58,0.15)', border: '1.5px solid var(--red)', color: 'var(--red)' }}
            aria-label="Skip"
          >
            ✕
          </button>
          <button
            onClick={() => handleSwipeRight(visible[0]?.id)}
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition-transform active:scale-90"
            style={{ background: 'rgba(48,209,88,0.15)', border: '1.5px solid var(--green)', color: 'var(--green)' }}
            aria-label="Mark applied"
          >
            ✓
          </button>
        </div>
      )}
    </div>
  );
}
