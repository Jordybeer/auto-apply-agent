import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('applications')
    .select(`id, status, applied_at, jobs ( title, company, url, source )`)
    .eq('status', 'applied')
    .order('applied_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data || []).map((app: any) => ({
    ...app,
    jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs,
  }));

  return NextResponse.json({ applications: normalized });
}
