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
      return NextResponse.json(
        { error: 'application_id, to, subject and body are required' },
        { status: 400 },
      );
    }

    // Verify the application belongs to this user and fetch job URL.
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, status, jobs ( title, company, url )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    // Safely unwrap the joined jobs row — Supabase can return an array or object.
    const rawJob = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs;
    const jobUrl: string | null =
      rawJob != null && typeof rawJob === 'object' && 'url' in rawJob
        ? (rawJob as { url: string | null }).url
        : null;

    // Fetch the stored Gmail refresh token + user display name + signature.
    const { data: settings, error: settingsErr } = await supabase
      .from('user_settings')
      .select('gmail_refresh_token, full_name, email_signature')
      .eq('user_id', user.id)
      .single();

    if (settingsErr) {
      console.error('user_settings query error:', settingsErr);
      return NextResponse.json(
        { error: 'Kon gebruikersinstellingen niet ophalen.' },
        { status: 500 },
      );
    }

    if (!settings?.gmail_refresh_token) {
      return NextResponse.json(
        { error: 'Gmail niet verbonden. Log opnieuw in met Google om e-mails te kunnen versturen.' },
        { status: 403 },
      );
    }

    // Try to fetch the user's CV PDF from storage.
    let cvPdf: Buffer | null = null;
    try {
      const { data: signedData } = await supabase.storage
        .from('resumes')
        .createSignedUrl(`${user.id}/cv.pdf`, 60);
      if (signedData?.signedUrl) {
        const pdfRes = await fetch(signedData.signedUrl);
        if (pdfRes.ok) {
          cvPdf = Buffer.from(await pdfRes.arrayBuffer());
        }
      }
    } catch (cvErr) {
      console.warn('Could not fetch CV for email attachment:', cvErr);
    }

    await sendViaGmail({
      refreshToken:       settings.gmail_refresh_token,
      fromName:           settings.full_name ?? undefined,
      to,
      subject,
      body,
      jobUrl,
      signature:          settings.email_signature ?? null,
      attachmentPdf:      cvPdf,
      attachmentFilename: 'cv.pdf',
    });

    // Mark as applied + record the sent email address + attachment flag.
    const { error: updateErr } = await supabase
      .from('applications')
      .update({
        status:         'applied',
        applied_at:     new Date().toISOString(),
        contact_email:  to,
        sent_via_email: true,
      })
      .eq('id', application_id)
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('Failed to mark application as applied:', updateErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-application error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
