import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

const APPLIED_STATUSES = ['applied', 'in_progress', 'rejected'];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('applications')
    .select(`id, status, applied_at, match_score, reasoning, cover_letter_draft, resume_bullets_draft, jobs ( title, company, url, source )`)
    .eq('user_id', user.id)
    .in('status', APPLIED_STATUSES)
    .order('applied_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data || []).map((app: any) => ({
    ...app,
    jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs,
  }));

  return NextResponse.json({ applications: normalized });
}

// PATCH: update status of an applied application
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { application_id, status } = await request.json();
  if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });
  if (!APPLIED_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const { error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', application_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: remove an applied application (set back to skipped)
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { application_id } = await request.json();
  if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

  const { error } = await supabase
    .from('applications')
    .update({ status: 'skipped' })
    .eq('id', application_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
