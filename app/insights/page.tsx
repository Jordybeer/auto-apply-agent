import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JobTitleInsightsClient } from './InsightsClient';

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: applications } = await supabase
    .from('applications')
    .select('status, jobs(title)')
    .eq('user_id', user.id)
    .in('status', ['saved', 'applied', 'queued']);

  // Tally weighted counts per normalized title
  const counts = new Map<string, { weight: number; count: number }>();
  for (const app of applications ?? []) {
    const raw = ((app.jobs as any)?.title ?? '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const weight = app.status === 'applied' ? 2 : 1;
    const prev = counts.get(key) ?? { weight: 0, count: 0 };
    counts.set(key, { weight: prev.weight + weight, count: prev.count + 1 });
  }

  const topUsed = [...counts.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 5)
    .map(([title, { weight, count }]) => ({ title, weight, count }));

  return <JobTitleInsightsClient topUsed={topUsed} />;
}
