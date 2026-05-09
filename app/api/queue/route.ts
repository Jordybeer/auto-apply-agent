import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { captureServer } from '@/lib/posthog-server';

const VALID_STATUSES = ['saved', 'skipped'] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('applications')
    .select(`id, status, match_score, reasoning, created_at, jobs ( title, company, url, source, description, location )`)
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .order('match_score', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type AppRow = typeof data extends (infer T)[] | null ? T : never;
  const normalized = (data || []).map((app: AppRow) => ({
    ...app,
    jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs,
  }));

  return NextResponse.json({ applications: normalized });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status } = await req.json();

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)
    .in('status', ['draft', 'saved']);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === 'saved') {
    captureServer(user.id, 'job_saved_to_pipeline');
  }

  return NextResponse.json({ ok: true });
}
