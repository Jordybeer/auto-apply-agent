import { createServiceClient } from '@/lib/supabase-service';

export async function isPremium(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('tier, status, current_period_end')
    .eq('user_id', userId)
    .single();
  if (!data) return false;
  if (data.tier !== 'premium') return false;
  if (!['active', 'trialing'].includes(data.status)) return false;
  if (data.current_period_end && new Date(data.current_period_end) < new Date()) return false;
  return true;
}
