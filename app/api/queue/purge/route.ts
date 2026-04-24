import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { slog } from '@/lib/logger';

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'draft');

  if (error) {
    void slog.error('queue-purge', 'Purge mislukt', { error: error.message }, user.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void slog.info('queue-purge', 'Draft queue gewist', {}, user.id);
  return NextResponse.json({ ok: true });
}
