import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';
import { InsightsClient } from './InsightsClient';

export type WeeklyBucket = {
  week:    string;
  count:   number;
};

export type FunnelData = {
  saved:      number;
  applied:    number;
  inProgress: number;
  rejected:   number;
};

export type TopUsedItem = {
  title:  string;
  weight: number;
  count:  number;
};

function isoMonday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('nl-BE', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

type AppRow = {
  status:      string;
  match_score: number | null;
  created_at:  string;
  jobs: { title: string | null; matched_tags: string[] | null }[] | null;
};

const WEEKS = 8;

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - WEEKS * 7);

  const { data } = await supabase
    .from('applications')
    .select('status, match_score, created_at, jobs(title, matched_tags)')
    .eq('user_id', user.id)
    .gte('created_at', cutoff.toISOString());

  const rows = (data ?? []) as unknown as AppRow[];

  let totalApplied  = 0;
  let inProgress    = 0;
  let rejected      = 0;
  let saved         = 0;
  let scoreSum      = 0;
  let scoreCount    = 0;
  let responded     = 0;

  for (const r of rows) {
    if (r.status === 'applied')     { totalApplied++; }
    if (r.status === 'in_progress') { inProgress++; responded++; }
    if (r.status === 'rejected')    { rejected++;    responded++; }
    if (r.status === 'saved')       { saved++; }
    if (r.match_score !== null)     { scoreSum += r.match_score; scoreCount++; }
  }

  const allApplied  = totalApplied + inProgress + rejected;
  const responseRate = allApplied > 0 ? Math.round((responded / allApplied) * 100) : 0;

  const kpis = {
    totalApplied: allApplied,
    avgScore:     scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
    responseRate,
    activeCount:  inProgress,
  };

  const funnel: FunnelData = {
    saved,
    applied:    allApplied,
    inProgress,
    rejected,
  };

  const weekBuckets = new Map<string, number>();
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekBuckets.set(isoMonday(d), 0);
  }

  for (const r of rows) {
    const key = isoMonday(new Date(r.created_at));
    if (weekBuckets.has(key)) weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + 1);
  }

  const weeklyActivity: WeeklyBucket[] = [...weekBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isoDate, count]) => ({ week: fmtWeekLabel(isoDate), count }));

  const titleCounts = new Map<string, { weight: number; count: number }>();
  for (const r of rows) {
    const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
    const raw = (job?.title ?? '').trim();
    if (!raw) continue;
    const key    = raw.toLowerCase();
    const weight = r.status === 'applied' ? 2 : 1;
    const prev   = titleCounts.get(key) ?? { weight: 0, count: 0 };
    titleCounts.set(key, { weight: prev.weight + weight, count: prev.count + 1 });
  }

  const topUsed: TopUsedItem[] = [...titleCounts.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 5)
    .map(([title, { weight, count }]) => ({ title, weight, count }));

  return (
    <InsightsClient
      kpis={kpis}
      weeklyActivity={weeklyActivity}
      funnel={funnel}
      topUsed={topUsed}
      suggestedUnused={[]}
    />
  );
}
