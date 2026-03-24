import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('applications')
    .select(`id, status, match_score, reasoning, jobs ( title, company, url, source, description )`)
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .order('match_score', { ascending: false });

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
  const patch: Record<string, any> = { status };
  if (status === 'applied') patch.applied_at = new Date().toISOString();

  const { error } = await supabase
    .from('applications')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
