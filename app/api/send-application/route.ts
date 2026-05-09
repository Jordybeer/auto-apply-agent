import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { sendViaGmail } from '@/lib/gmail-smtp';
import { slog } from '@/lib/logger';
import { isPremium } from '@/lib/require-premium';
import { captureServer } from '@/lib/posthog-server';

export const maxDuration = 30;

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  return matches / longer.length;
}


export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const premium = await isPremium(user.id);
    if (!premium) {
      captureServer(user.id, 'paywall_hit', { feature: 'send_application' });
      return NextResponse.json(
        { error: 'Sollicitaties versturen is alleen beschikbaar voor Premium-gebruikers.' },
        { status: 403 },
      );
    }

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

    if (typeof subject !== 'string' || subject.length > 200) {
      return NextResponse.json({ error: 'Onderwerp te lang (max 200 tekens).' }, { status: 400 });
    }
    if (typeof body !== 'string' || body.length > 10_000) {
      return NextResponse.json({ error: 'Bericht te lang (max 10.000 tekens).' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'Ongeldig e-mailadres.' }, { status: 400 });
    }

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, status, cover_letter_draft, jobs ( title, company )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    if (['applied', 'in_progress'].includes(app.status as string)) {
      return NextResponse.json(
        { error: 'Deze sollicitatie is al eerder verstuurd.' },
        { status: 409 },
      );
    }

    const { data: settings, error: settingsErr } = await supabase
      .from('user_settings')
      .select('full_name, email_signature, gmail_address, gmail_app_password')
      .eq('user_id', user.id)
      .single();

    if (settingsErr) {
      void slog.error('send-application', 'user_settings query fout', { error: settingsErr.message }, user.id);
      return NextResponse.json(
        { error: 'Kon gebruikersinstellingen niet ophalen.' },
        { status: 500 },
      );
    }

    const gmailAddress = (settings?.gmail_address as string | null)?.trim() || '';
    const gmailAppPass = (settings?.gmail_app_password as string | null)?.trim() || '';
    if (!gmailAddress || !gmailAppPass) {
      return NextResponse.json(
        { error: 'Stel eerst je Gmail-adres en app-wachtwoord in via Instellingen → E-mail.' },
        { status: 400 },
      );
    }

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
      void slog.warn('send-application', 'CV ophalen voor bijlage mislukt', { error: String(cvErr) }, user.id);
    }

    await sendViaGmail({
      gmailAddress,
      appPassword:        gmailAppPass,
      to,
      subject,
      body,
      fromName:           settings?.full_name ?? null,
      signature:          settings?.email_signature ?? null,
      attachmentPdf:      cvPdf,
      attachmentFilename: 'cv.pdf',
    });

    const draft = (app.cover_letter_draft as string) || '';
    const letterEdited = draft.length > 0 && body !== draft;
    const editRatio = draft.length > 0 ? Math.round((1 - similarity(draft, body)) * 100) : null;
    if (editRatio !== null) {
      void slog.info('feedback', 'Brief edit ratio', { application_id, edit_ratio: editRatio, was_edited: letterEdited }, user.id);
    }

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
      void slog.error('send-application', 'Status bijwerken naar applied mislukt', { error: updateErr.message }, user.id);
    }

    const jobMeta = app.jobs as { title?: string; company?: string } | null;
    captureServer(user.id, 'application_sent', {
      application_id,
      job_title: jobMeta?.title,
      company: jobMeta?.company,
      letter_edited: letterEdited,
      edit_ratio: editRatio,
      has_cv_attachment: !!cvPdf,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('send-application', 'Route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
