import { Suspense } from 'react';
import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';
import AnalyseClient from './AnalyseClient';

export default async function AnalysePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <Suspense>
      <AnalyseClient />
    </Suspense>
  );
}
