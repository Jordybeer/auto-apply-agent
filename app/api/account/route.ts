import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const BUCKET = 'resumes';

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { confirm?: string } = {};
  try { body = await request.json(); } catch {}
  const expected = (user.email ?? '').trim().toLowerCase();
  const got = (body.confirm ?? '').trim().toLowerCase();
  if (!expected || got !== expected) {
    return NextResponse.json({ error: 'Bevestiging komt niet overeen.' }, { status: 400 });
  }

  const admin = createServiceClient();

  // Storage doesn't cascade — list + remove the user's resume folder first.
  const { data: files } = await admin.storage.from(BUCKET).list(user.id);
  if (files && files.length) {
    const paths = files.map((f) => `${user.id}/${f.name}`);
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
    if (rmErr) {
      void slog.warn('account', 'Storage cleanup mislukt', { error: rmErr.message }, user.id);
    }
  }

  // Cascades through every user_id FK (jobs, applications, user_settings, push_subscriptions);
  // system_logs.user_id is SET NULL so historical logs survive without identifying you.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    await slog.error('account', 'Account verwijderen mislukt', { error: delErr.message }, user.id);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  await slog.info('account', 'Account verwijderd', { email: user.email ?? null });
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
