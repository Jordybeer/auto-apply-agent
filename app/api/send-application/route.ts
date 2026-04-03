import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { sendViaGmail } from '@/lib/gmail';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id, to, subject, body } = await request.json() as {
      application_id: string;
      to: string;
      subject: string;
      body: string;
    };

    if (!application_id || !to || !subject || !body) {
      return NextResponse.json({ error: 'application_id, to, subject and body are required' }, { status: 400 });
    }

    // Verify the application belongs to this user.
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, status, jobs ( title, company )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    // Fetch the stored Gmail refresh token.
    const { data: settings } = await supabase
      .from('user_settings')
      .select('gmail_refresh_token')
      .eq('user_id', user.id)
      .single();

    if (!settings?.gmail_refresh_token) {
      return NextResponse.json(
        { error: 'Gmail niet verbonden. Log opnieuw in met Google om e-mails te kunnen versturen.' },
        { status: 403 },
      );
    }

    await sendViaGmail({
      refreshToken: settings.gmail_refresh_token,
      to,
      subject,
      body,
    });

    // Mark as applied + record the sent email address.
    await supabase
      .from('applications')
      .update({
        status:           'applied',
        applied_at:       new Date().toISOString(),
        contact_email:    to,
        sent_via_email:   true,
      })
      .eq('id', application_id)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-application error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
