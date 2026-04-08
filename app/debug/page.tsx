import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-request';
import { ADMIN_USER_ID } from '@/lib/env';
import DebugConsole from './DebugConsole';

export default async function DebugPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.id !== ADMIN_USER_ID) {
    redirect('/settings');
  }

  const { data } = await supabase
    .from('user_settings')
    .select('keywords')
    .eq('user_id', user.id)
    .single();

  return <DebugConsole initialKeywords={data?.keywords ?? []} />;
}
