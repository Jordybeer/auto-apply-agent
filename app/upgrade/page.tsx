import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';
import { UpgradeClient } from './UpgradeClient';

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier, status, current_period_end, trial_end, provider')
    .eq('user_id', user.id)
    .single();

  const isPremium = sub?.tier === 'premium' && ['active', 'trialing'].includes(sub?.status ?? '');
  const params = await searchParams;
  const justUpgraded = params.success === '1';

  return <UpgradeClient isPremium={isPremium} justUpgraded={justUpgraded} sub={sub ?? null} />;
}
