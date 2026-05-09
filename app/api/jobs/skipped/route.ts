import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export const dynamic = 'force-dynamic';

const VALID_PERIODS = ['today', '7days', '30days'] as const;
type Period = (typeof VALID_PERIODS)[number];

function sinceDate(period: Period): string {
  const d = new Date();
  if (period === 'today') {
    d.setHours(0, 0, 0, 0);
  } else if (period === '7days') {
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get('period') ?? '30days';

  if (!VALID_PERIODS.includes(periodParam as Period)) {
    return NextResponse.json({ error: 'Ongeldig tijdsperiode.' }, { status: 400 });
  }

  const period = periodParam as Period;
  const since  = sinceDate(period);

  // Find applications that are skipped or rejected within the chosen period
  const { data: apps, error: appsError } = await supabase
    .from('applications')
    .select('job_id')
    .eq('user_id', user.id)
    .in('status', ['skipped', 'rejected'])
    .gte('updated_at', since);

  if (appsError) return NextResponse.json({ error: appsError.message }, { status: 500 });

  const jobIds = [...new Set((apps ?? []).map((r) => r.job_id).filter(Boolean))];

  if (jobIds.length === 0) return NextResponse.json({ deleted: 0 });

  // Delete applications first (FK constraint)
  const { error: delAppsErr } = await supabase
    .from('applications')
    .delete()
    .eq('user_id', user.id)
    .in('job_id', jobIds);

  if (delAppsErr) return NextResponse.json({ error: delAppsErr.message }, { status: 500 });

  // Delete the jobs so they can re-enter via upsert on next scrape
  const { error: delJobsErr, count } = await supabase
    .from('jobs')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .in('id', jobIds);

  if (delJobsErr) return NextResponse.json({ error: delJobsErr.message }, { status: 500 });

  return NextResponse.json({ deleted: count ?? jobIds.length });
}
