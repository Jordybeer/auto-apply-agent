import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { token, platform = 'ios' } = body as { token?: string; platform?: string };
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('device_tokens')
    .upsert({ user_id: user.id, token, platform }, { onConflict: 'user_id,token' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { token } = body as { token?: string };

  const query = supabase.from('device_tokens').delete().eq('user_id', user.id);
  if (token) query.eq('token', token);
  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
