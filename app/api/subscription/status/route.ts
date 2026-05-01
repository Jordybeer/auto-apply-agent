import { createClient } from '@/lib/supabase-request';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ is_premium: false });

  const { data } = await supabase
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', user.id)
    .single();

  const is_premium =
    data?.tier === 'premium' && ['active', 'trialing'].includes(data?.status ?? '');

  return NextResponse.json({ is_premium });
}
