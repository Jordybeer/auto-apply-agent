import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title } = await request.json();
  if (typeof title !== 'string' || !title.trim())
    return NextResponse.json({ error: 'Invalid title' }, { status: 400 });

  const clean = title.trim();

  const { data } = await supabase
    .from('user_settings')
    .select('job_titles')
    .eq('user_id', user.id)
    .single();

  const current: string[] = (data as Record<string, unknown>)?.job_titles as string[] ?? [];
  if (!current.includes(clean)) {
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: user.id, job_titles: [...current, clean], updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
