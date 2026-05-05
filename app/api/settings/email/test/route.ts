import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { sendViaGmail } from '@/lib/gmail-smtp';
import { slog } from '@/lib/logger';
import { isPremium } from '@/lib/require-premium';

export const maxDuration = 10;

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const premium = await isPremium(user.id);
  if (!premium) return NextResponse.json({ error: 'Testmails zijn alleen beschikbaar voor Premium-gebruikers.' }, { status: 403 });

  const { data: settings, error: settingsErr } = await supabase
    .from('user_settings')
    .select('full_name, email_signature, gmail_address, gmail_app_password')
    .eq('user_id', user.id)
    .single();

  if (settingsErr && settingsErr.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Kon instellingen niet ophalen.' }, { status: 500 });
  }

  const gmailAddress = (settings?.gmail_address as string | null)?.trim() || '';
  const gmailAppPass = (settings?.gmail_app_password as string | null)?.trim() || '';
  if (!gmailAddress || !gmailAppPass) {
    return NextResponse.json({ error: 'Stel eerst je Gmail-adres en app-wachtwoord in.' }, { status: 400 });
  }

  try {
    await sendViaGmail({
      gmailAddress,
      appPassword: gmailAppPass,
      to:          gmailAddress,
      subject:     'Test — JobTide e-mail werkt correct',
      body:        'Dit is een testbericht van JobTide.\n\nAls je dit ziet, is je Gmail-configuratie correct ingesteld.',
      fromName:    settings?.full_name ?? null,
      signature:   settings?.email_signature ?? null,
    });
    void slog.info('settings-email-test', 'Test e-mail verzonden', { to: gmailAddress }, user.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    void slog.error('settings-email-test', 'Test e-mail mislukt', { error: msg }, user.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
