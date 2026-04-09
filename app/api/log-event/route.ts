import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { slog } from '@/lib/logger';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { source = 'page', message, meta } = body;
  if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

  await slog.info(source, message, meta ?? undefined, user.id);
  return NextResponse.json({ ok: true });
}
