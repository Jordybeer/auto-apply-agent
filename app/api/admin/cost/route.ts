import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { ADMIN_USER_ID } from '@/lib/env';

export const maxDuration = 15;

// Approximate costs in USD
const COSTS = {
  haiku_per_job:    0.002,   // pipeline scoring via Haiku
  haiku_score:      0.002,   // premium manual score (Haiku)
  sonnet_letter:    0.011,   // premium cover letter (Sonnet)
  sonnet_analyse:   0.013,   // analyse page — 2 Sonnet calls combined
  sonnet_cv_parse:  0.004,   // CV structured extraction (Sonnet)
};

interface CostBreakdown {
  label: string;
  count: number;
  unit_cost: number;
  total: number;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since'); // ISO date, optional

  const service = createServiceClient();
  const base = () => {
    const q = service.from('system_logs').select('meta, message');
    return since ? q.gte('created_at', since) : q;
  };

  const [processRows, premiumScoreRows, premiumLetterRows, analyseRows, cvRows] = await Promise.all([
    base().eq('source', 'process').ilike('message', '%Verwerking voltooid%'),
    base().eq('source', 'apply').ilike('message', '%Premium score voltooid%'),
    base().eq('source', 'apply').ilike('message', '%Premium brief gegenereerd%'),
    base().eq('source', 'analyse').ilike('message', '%Analyse voltooid%'),
    base().eq('source', 'cv').ilike('message', '%Structured CV%'),
  ]);

  // Sum job counts from meta.inserted for pipeline scoring
  const pipelineJobs = (processRows.data ?? []).reduce((sum, row) => {
    const inserted = (row.meta as Record<string, unknown> | null)?.inserted;
    return sum + (typeof inserted === 'number' ? inserted : 1);
  }, 0);

  const breakdown: CostBreakdown[] = [
    { label: 'Pipeline scoring (Haiku)',     count: pipelineJobs,                          unit_cost: COSTS.haiku_per_job,   total: pipelineJobs * COSTS.haiku_per_job },
    { label: 'Handmatige score (Haiku)',     count: premiumScoreRows.data?.length ?? 0,    unit_cost: COSTS.haiku_score,     total: (premiumScoreRows.data?.length ?? 0) * COSTS.haiku_score },
    { label: 'Motivatiebrief (Sonnet)',      count: premiumLetterRows.data?.length ?? 0,   unit_cost: COSTS.sonnet_letter,   total: (premiumLetterRows.data?.length ?? 0) * COSTS.sonnet_letter },
    { label: 'Vacature analyse (Sonnet)',    count: analyseRows.data?.length ?? 0,         unit_cost: COSTS.sonnet_analyse,  total: (analyseRows.data?.length ?? 0) * COSTS.sonnet_analyse },
    { label: 'CV verwerking (Sonnet)',       count: cvRows.data?.length ?? 0,              unit_cost: COSTS.sonnet_cv_parse, total: (cvRows.data?.length ?? 0) * COSTS.sonnet_cv_parse },
  ];

  const total = breakdown.reduce((s, b) => s + b.total, 0);
  return NextResponse.json({ breakdown, total, since: since ?? null });
}
