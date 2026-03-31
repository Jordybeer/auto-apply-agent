import { Suspense } from 'react';
import QueueContent from './QueueContent';
import SkeletonCards from '@/components/SkeletonCards';

export default function QueuePage() {
  return (
    <Suspense fallback={
      <main className="page-shell flex flex-col gap-5">
        <div className="h-11 rounded-2xl" style={{ background: 'var(--surface2)' }} />
        <SkeletonCards count={3} />
      </main>
    }>
      <QueueContent />
    </Suspense>
  );
}
