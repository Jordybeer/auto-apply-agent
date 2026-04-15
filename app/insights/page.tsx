import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';
import { InsightsClient } from './InsightsClient';

export type DailyBucket = {
  day:   string;
  count: number;
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

function fmtDayLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('nl-BE', { day: 'numeric', timeZone: 'UTC' });
}

type AppRow = {
  status:      string;
  match_score: number | null;
  created_at:  string;
  jobs: { title: string | null }[] | null;
};

const DAYS = 14;

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (DAYS - 1));
  cutoff.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('applications')
    .select('status, match_score, created_at, jobs(title)')
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

  const dayBuckets = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dayBuckets.set(d.toISOString().slice(0, 10), 0);
  }

  const COUNTED = new Set(['saved', 'applied', 'in_progress', 'rejected']);
  for (const r of rows) {
    if (!COUNTED.has(r.status)) continue;
    const key = r.created_at.slice(0, 10);
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }

  const dailyActivity: DailyBucket[] = [...dayBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isoDate, count]) => ({ day: fmtDayLabel(isoDate), count }));

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
      dailyActivity={dailyActivity}
      funnel={funnel}
      topUsed={topUsed}
      suggestedUnused={[]}
    />
  );
}
