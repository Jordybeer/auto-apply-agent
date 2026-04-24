import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { sendViaResend } from '@/lib/resend';
import { slog } from '@/lib/logger';

export const maxDuration = 10;

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: 'Geen e-mailadres bekend.' }, { status: 400 });

  const { data: settings, error: settingsErr } = await supabase
    .from('user_settings')
    .select('full_name, email_signature')
    .eq('user_id', user.id)
    .single();

  if (settingsErr && settingsErr.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Kon instellingen niet ophalen.' }, { status: 500 });
  }

  try {
    await sendViaResend({
      to:        user.email,
      subject:   'Test — JobAgent e-mail werkt correct',
      body:      'Dit is een testbericht van JobAgent.\n\nAls je dit ziet, is je e-mailconfiguratie correct ingesteld.',
      fromName:  settings?.full_name ?? null,
      signature: settings?.email_signature ?? null,
    });
    void slog.info('settings-email-test', 'Test e-mail verzonden', { to: user.email }, user.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    void slog.error('settings-email-test', 'Test e-mail mislukt', { error: msg }, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
