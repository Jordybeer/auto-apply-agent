import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';
import { JobTitleInsightsClient } from './InsightsClient';

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: applications } = await supabase
    .from('applications')
    .select('status, jobs(title, matched_tags)')
    .eq('user_id', user.id)
    .in('status', ['saved', 'applied', 'draft']);

  const titleCounts = new Map<string, { weight: number; count: number }>();
  const tagCounts   = new Map<string, { hits: number; applied: number }>();

  for (const app of applications ?? []) {
    const job = app.jobs as { title?: string; matched_tags?: string[] } | null;
    if (!job) continue;
    const weight = app.status === 'applied' ? 2 : 1;

    const raw = (job.title ?? '').trim();
    if (raw) {
      const key  = raw.toLowerCase();
      const prev = titleCounts.get(key) ?? { weight: 0, count: 0 };
      titleCounts.set(key, { weight: prev.weight + weight, count: prev.count + 1 });
    }

    for (const tag of job.matched_tags ?? []) {
      const prev = tagCounts.get(tag) ?? { hits: 0, applied: 0 };
      tagCounts.set(tag, {
        hits:    prev.hits + 1,
        applied: prev.applied + (app.status === 'applied' ? 1 : 0),
      });
    }
  }

  const topUsed = [...titleCounts.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 5)
    .map(([title, { weight, count }]) => ({ title, weight, count }));

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1].hits - a[1].hits)
    .slice(0, 10)
    .map(([tag, { hits, applied }]) => ({ tag, hits, applied }));

  return <JobTitleInsightsClient topUsed={topUsed} topTags={topTags} />;
}
