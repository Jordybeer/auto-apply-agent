import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';


export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('applications')
    .select(`id, status, jobs ( title, company, url, source, description )`)
    .eq('status', 'draft')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data || []).map((app: any) => ({
    ...app,
    jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs,
  }));

  return NextResponse.json({ applications: normalized });
}

export async function PATCH(req: Request) {
  const { id, status } = await req.json();
  const patch: Record<string, any> = { status };
  if (status === 'applied') patch.applied_at = new Date().toISOString();
const supabase = await createClient();

  const { error } = await supabase
    .from('applications')
    .update(patch)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
