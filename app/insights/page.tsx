import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';
import { InsightsClient } from './InsightsClient';

// ── Shared types ─────────────────────────────────────────────────────────
export type KPIs = {
  totalQueued:   number;
  totalSaved:    number;
  totalApplied:  number;
  avgMatchScore: number;
};

export type WeeklyBucket = {
  weekLabel: string; // "Apr 7"
  queued:    number;
  saved:     number;
  applied:   number;
};

export type FunnelStage = {
  stage: 'queued' | 'saved' | 'applied';
  count: number;
};

export type TopUsedItem = {
  title:  string;
  weight: number;
  count:  number;
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Return the ISO Monday (YYYY-MM-DD) for any date. */
function isoMonday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

/** Format a YYYY-MM-DD string as "Apr 7". */
function fmtWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('nl-BE', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── Page ─────────────────────────────────────────────────────────────────

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

  // ── KPIs ───────────────────────────────────────────────────────────────
  let totalQueued  = 0;
  let totalSaved   = 0;
  let totalApplied = 0;
  let scoreSum     = 0;
  let scoreCount   = 0;

  for (const r of rows) {
    if (r.status === 'queued')  totalQueued++;
    if (r.status === 'saved')   totalSaved++;
    if (r.status === 'applied') totalApplied++;
    if (r.match_score !== null) { scoreSum += r.match_score; scoreCount++; }
  }

  const kpis: KPIs = {
    totalQueued,
    totalSaved,
    totalApplied,
    avgMatchScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
  };

  // ── Funnel ─────────────────────────────────────────────────────────────
  const funnel: FunnelStage[] = [
    { stage: 'queued',  count: totalQueued  },
    { stage: 'saved',   count: totalSaved   },
    { stage: 'applied', count: totalApplied },
  ];

  // ── Weekly activity (last WEEKS weeks, all buckets present) ───────────
  const weekBuckets = new Map<string, { queued: number; saved: number; applied: number }>();

  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekBuckets.set(isoMonday(d), { queued: 0, saved: 0, applied: 0 });
  }

  for (const r of rows) {
    const key = isoMonday(new Date(r.created_at));
    const bucket = weekBuckets.get(key);
    if (!bucket) continue;
    if (r.status === 'queued')  bucket.queued++;
    if (r.status === 'saved')   bucket.saved++;
    if (r.status === 'applied') bucket.applied++;
  }

  const weeklyActivity: WeeklyBucket[] = [...weekBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isoDate, counts]) => ({ weekLabel: fmtWeekLabel(isoDate), ...counts }));

  // ── Top used job titles (weighted: applied = 2, others = 1) ───────────
  const titleCounts = new Map<string, { weight: number; count: number }>();

  for (const r of rows) {
    if (r.status !== 'queued' && r.status !== 'saved' && r.status !== 'applied') continue;
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
    />
  );
}
