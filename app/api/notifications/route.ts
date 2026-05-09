import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const lastSeenAt = url.searchParams.get('lastSeenAt');

  const [notifResult, queueResult, newResult] = await Promise.all([
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'draft'),
    // Count drafts newer than lastSeenAt (only when client provides a timestamp)
    lastSeenAt
      ? supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'draft')
          .gt('created_at', lastSeenAt)
      : Promise.resolve({ count: null, error: null }),
  ]);

  if (notifResult.error) return NextResponse.json({ error: notifResult.error.message }, { status: 500 });

  const unread = (notifResult.data ?? []).filter((n) => !n.read_at).length;
  const queueCount = queueResult.count ?? 0;
  // No lastSeenAt = user has never visited /queue.
  // Treat the entire queue as "new" so the green badge appears on first load.
  const newCount = lastSeenAt ? (newResult.count ?? 0) : queueCount;

  return NextResponse.json({ notifications: notifResult.data ?? [], unread, queueCount, newCount });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body.action !== 'read-all') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
