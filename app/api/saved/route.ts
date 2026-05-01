import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase-request';

const getCachedSaved = unstable_cache(
  async (userId: string) => {
    const { createServiceClient } = await import('@/lib/supabase-service');
    const admin = createServiceClient();
    const { data } = await admin
      .from('applications')
      .select('id, status, match_score, reasoning, cover_letter_draft, resume_bullets_draft, jobs(title, company, url, source, description, location)')
      .eq('user_id', userId)
      .eq('status', 'saved')
      .order('match_score', { ascending: false });
    return data ?? [];
  },
  ['saved-applications'],
  { revalidate: 30 },
);

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await getCachedSaved(user.id);

  type AppRow = (typeof data)[number];
  const normalized = data.map((app: AppRow) => ({
    ...app,
    jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs,
  }));

  return NextResponse.json({ applications: normalized });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { application_id?: string };
  if (!body.application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

  const { error } = await supabase
    .from('applications')
    .update({ status: 'skipped' })
    .eq('id', body.application_id)
    .eq('user_id', user.id)
    .eq('status', 'saved');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
