import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Verboden' }, { status: 403 });
  }

  const { tier } = await req.json() as { tier: 'free' | 'premium' };
  if (!['free', 'premium'].includes(tier)) {
    return NextResponse.json({ error: 'Ongeldig tier' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error: upsertError } = await service.from('subscriptions').upsert({
    user_id:             user.id,
    tier,
    status:              tier === 'premium' ? 'active' : 'canceled',
    provider:            null,
    current_period_end:  null,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('[set-tier] upsert failed:', upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (tier === 'premium') {
    await service.from('user_settings')
      .update({ scored_today: 0 })
      .eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true, tier });
}
