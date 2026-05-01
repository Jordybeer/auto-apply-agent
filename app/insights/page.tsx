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

export type SourceBucket = { source: string; count: number };
export type FunnelStep   = { label: string; count: number };
export type ScrapeBucket = { day: string; count: number };

function fmtDayLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('nl-BE', { day: 'numeric', timeZone: 'UTC' });
}

type AppRow = {
  status:      string;
  match_score: number | null;
  created_at:  string;
  jobs: { title: string | null; source: string | null }[] | null;
};

const DAYS = 14;

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (DAYS - 1));
  cutoff.setUTCHours(0, 0, 0, 0);

  const sevenDaysCutoff = new Date();
  sevenDaysCutoff.setUTCDate(sevenDaysCutoff.getUTCDate() - 6);
  sevenDaysCutoff.setUTCHours(0, 0, 0, 0);

  const [{ data }, { data: jobsData }] = await Promise.all([
    supabase
      .from('applications')
      .select('status, match_score, created_at, jobs(title, source)')
      .eq('user_id', user.id)
      .gte('created_at', cutoff.toISOString()),
    supabase
      .from('jobs')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysCutoff.toISOString()),
  ]);

  const rows     = (data ?? []) as unknown as AppRow[];
  const jobsRows = (jobsData ?? []) as { created_at: string }[];

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

  const allApplied   = totalApplied + inProgress + rejected;
  const responseRate = allApplied > 0 ? Math.round((responded / allApplied) * 100) : 0;

  const allScores = rows
    .filter(r => r.match_score !== null)
    .map(r => r.match_score!)
    .sort((a, b) => a - b);
  const medianScore = allScores.length > 0
    ? allScores.length % 2 === 1
      ? allScores[Math.floor(allScores.length / 2)]
      : Math.round((allScores[allScores.length / 2 - 1] + allScores[allScores.length / 2]) / 2)
    : 0;

  const weekCutoffIso = sevenDaysCutoff.toISOString();
  let matchesThisWeek = 0;
  const sourceCounts = new Map<string, number>();

  for (const r of rows) {
    if ((r.match_score ?? 0) >= 7 && r.created_at >= weekCutoffIso) matchesThisWeek++;
    const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs;
    const src = job?.source ?? 'onbekend';
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }

  const bySource: SourceBucket[] = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));

  const conversionFunnel: FunnelStep[] = [
    { label: 'Gescraped',      count: jobsRows.length },
    { label: 'Score ≥7',       count: rows.filter(r => (r.match_score ?? 0) >= 7).length },
    { label: 'Opgeslagen',     count: saved },
    { label: 'Gesolliciteerd', count: allApplied },
  ];

  const scrapeMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    scrapeMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of jobsRows) {
    const key = r.created_at.slice(0, 10);
    if (scrapeMap.has(key)) scrapeMap.set(key, (scrapeMap.get(key) ?? 0) + 1);
  }
  const scrapeVolume: ScrapeBucket[] = [...scrapeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isoDate, count]) => ({ day: fmtDayLabel(isoDate), count }));

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
      matchesThisWeek={matchesThisWeek}
      medianScore={medianScore}
      bySource={bySource}
      conversionFunnel={conversionFunnel}
      scrapeVolume={scrapeVolume}
    />
  );
}
