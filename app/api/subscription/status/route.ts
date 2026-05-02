import { createClient } from '@/lib/supabase-request';
import { NextResponse } from 'next/server';

const FREE_DAILY_LIMIT = 5;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ is_premium: false, scored_today: 0, limit: FREE_DAILY_LIMIT });

  const [{ data: sub }, { data: settings }] = await Promise.all([
    supabase.from('subscriptions').select('tier, status, provider').eq('user_id', user.id).single(),
    supabase.from('user_settings').select('scored_today, scored_today_reset_at').eq('user_id', user.id).single(),
  ]);

  const is_premium = sub?.tier === 'premium' && ['active', 'trialing'].includes(sub?.status ?? '');

  const today = new Date().toISOString().slice(0, 10);
  const resetDate = settings?.scored_today_reset_at?.slice(0, 10);
  const scored_today = resetDate === today ? (settings?.scored_today ?? 0) : 0;

  return NextResponse.json({ is_premium, scored_today, limit: FREE_DAILY_LIMIT, provider: sub?.provider ?? null });
}
