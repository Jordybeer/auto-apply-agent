import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { assertSafeUrl } from '@/lib/url-guard';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscription = await request.json();
  if (typeof subscription?.endpoint !== 'string') {
    return NextResponse.json({ error: 'Invalid subscription: missing endpoint' }, { status: 400 });
  }
  try { assertSafeUrl(subscription.endpoint); } catch {
    return NextResponse.json({ error: 'Invalid subscription endpoint' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: user.id, subscription }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
