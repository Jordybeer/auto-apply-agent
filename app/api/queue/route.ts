import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';

export async function GET() {
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
  const { error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
