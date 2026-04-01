import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body === null || typeof body.note !== 'string') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const note = body.note.trim().slice(0, 2000); // max 2000 chars

  const { error } = await supabase
    .from('applications')
    .update({ note })
    .eq('id', params.id)
    .eq('user_id', user.id); // RLS double-check

  if (error) {
    console.error('[note PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
