import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    // Fetch the application — enforce user_id ownership
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, job_id, status, cover_letter_draft, resume_bullets_draft, match_score, reasoning, jobs ( title, company, description )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (app.status !== 'saved') return NextResponse.json({ error: 'Application is not in saved status' }, { status: 400 });

    // Fetch Groq key
    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key')
      .eq('user_id', user.id)
      .single();

    const groqKey = settings?.groq_api_key || '';
    if (!groqKey) return NextResponse.json(
      { error: 'Geen Groq API key ingesteld. Voeg er een toe via Instellingen.' },
      { status: 400 }
    );

    // Fetch CV text from storage
    let cvText = '';
    try {
      const { data: signedData } = await supabase.storage
        .from('resumes')
        .createSignedUrl(`${user.id}/cv.pdf`, 60);
      if (signedData?.signedUrl) {
        const pdfRes = await fetch(signedData.signedUrl);
        const buf = await pdfRes.arrayBuffer();
        const raw = Buffer.from(buf).toString('latin1');
        const matches = raw.match(/\(([^\)]{2,200})\)/g) || [];
        cvText = matches.map((m) => m.slice(1, -1)).join(' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
      }
    } catch { /* no CV — Groq uses general criteria */ }

    const job: any = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs;
    const ev = await evaluateJob(
      job?.description || '',
      job?.title || '',
      job?.company || '',
      groqKey,
      cvText,
    );

    // Save result back; do NOT mark applied yet — user confirms in the modal
    const { error: updateErr } = await supabase
      .from('applications')
      .update({
        match_score: ev.match_score ?? 0,
        reasoning: ev.reasoning ?? '',
        cover_letter_draft: ev.cover_letter_draft ?? '',
        resume_bullets_draft: ev.resume_bullets_draft ?? [],
      })
      .eq('id', application_id)
      .eq('user_id', user.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      ok: true,
      match_score: ev.match_score ?? 0,
      reasoning: ev.reasoning ?? '',
      cover_letter_draft: ev.cover_letter_draft ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
    });
  } catch (err: any) {
    console.error('apply route error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// PATCH: save edited drafts and mark as applied
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id, cover_letter_draft, resume_bullets_draft } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    const { error } = await supabase
      .from('applications')
      .update({
        cover_letter_draft,
        resume_bullets_draft,
        status: 'applied',
        applied_at: new Date().toISOString(),
      })
      .eq('id', application_id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
