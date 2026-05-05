import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';
import { UpgradeClient } from './UpgradeClient';

export const dynamic = 'force-dynamic';

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('tier, status, current_period_end, trial_end, provider')
    .eq('user_id', user.id)
    .single();

  const { data: settings } = await supabase
    .from('user_settings')
    .select('onetime_premium_until')
    .eq('user_id', user.id)
    .single();

  const onetimeActive =
    settings?.onetime_premium_until != null &&
    new Date(settings.onetime_premium_until) > new Date();

  const isPremium =
    (sub?.tier === 'premium' && ['active', 'trialing'].includes(sub?.status ?? ''))
    || onetimeActive;

  const isAdmin      = user.id === process.env.ADMIN_USER_ID;
  const params       = await searchParams;
  const justUpgraded = params.success === '1';

  return <UpgradeClient isPremium={isPremium} justUpgraded={justUpgraded} sub={sub ?? null} isAdmin={isAdmin} />;
}
