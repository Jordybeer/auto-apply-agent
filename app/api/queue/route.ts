import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

const VALID_STATUSES = ['saved', 'skipped'] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('applications')
    .select(`id, status, match_score, reasoning, jobs ( title, company, url, source, description, location )`)
    .eq('user_id', user.id)
    .eq('status', 'draft')
    // nullsFirst: false — unscored jobs sort to bottom, not top
    .order('match_score', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data || []).map((app: any) => ({
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
    // Only act on draft rows — prevent accidental state regression
    .eq('status', 'draft');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
