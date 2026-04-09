import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-request';
import QueueContent, { type InitialData } from './QueueContent';
import SkeletonCards from '@/components/SkeletonCards';

const APPLIED_STATUSES = ['applied', 'in_progress', 'rejected', 'accepted'] as const;

function normalize(data: any[]): any[] {
  return (data ?? []).map((a: any) => ({
    ...a,
    jobs: Array.isArray(a.jobs) ? a.jobs[0] : a.jobs,
  }));
}

export default async function QueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [queueRes, savedRes, appliedRes] = await Promise.all([
    supabase
      .from('applications')
      .select('id, status, match_score, reasoning, jobs ( title, company, url, source, description, location )')
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .order('match_score', { ascending: false, nullsFirst: false }),
    supabase
      .from('applications')
      .select('id, status, match_score, reasoning, cover_letter_draft, resume_bullets_draft, jobs ( title, company, url, source, description, location )')
      .eq('user_id', user.id)
      .eq('status', 'saved')
      .order('match_score', { ascending: false, nullsFirst: false }),
    supabase
      .from('applications')
      .select('id, status, applied_at, match_score, reasoning, cover_letter_draft, resume_bullets_draft, contact_person, contact_email, note, jobs ( title, company, url, source, location )')
      .eq('user_id', user.id)
      .in('status', [...APPLIED_STATUSES])
      .order('applied_at', { ascending: false }),
  ]);

  const initialData: InitialData = {
    queue:   normalize(queueRes.data   ?? []),
    saved:   normalize(savedRes.data   ?? []),
    applied: normalize(appliedRes.data ?? []),
  };

  return (
    <Suspense fallback={
      <main className="page-shell flex flex-col gap-5">
        <div className="h-11 rounded-2xl" style={{ background: 'var(--surface2)' }} />
        <SkeletonCards count={3} />
      </main>
    }>
      <QueueContent initialData={initialData} />
    </Suspense>
  );
}
