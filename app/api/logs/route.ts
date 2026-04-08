import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { ADMIN_USER_ID } from '@/lib/env';

export const maxDuration = 15;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limit  = Math.min(Number(searchParams.get('limit')  ?? 200), 500);
  const level  = searchParams.get('level');   // optional filter
  const source = searchParams.get('source');  // optional filter
  const before = searchParams.get('before');  // ISO cursor for pagination

  const service = createServiceClient();
  let query = service
    .from('system_logs')
    .select('id, level, source, message, meta, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (level)  query = query.eq('level', level);
  if (source) query = query.eq('source', source);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [] });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { searchParams } = new URL(request.url);
  const olderThanDays = Number(searchParams.get('older_than_days') ?? 7);
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();

  const { error } = await service.from('system_logs').delete().lt('created_at', cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
