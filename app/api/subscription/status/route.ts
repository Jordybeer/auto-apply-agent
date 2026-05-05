import { createClient } from '@/lib/supabase-request';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ is_premium: false });

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier, status, provider')
    .eq('user_id', user.id)
    .single();

  const is_premium = sub?.tier === 'premium' && ['active', 'trialing'].includes(sub?.status ?? '');

  return NextResponse.json({ is_premium, provider: sub?.provider ?? null });
}
