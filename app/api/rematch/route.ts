import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob } from '@/lib/openai';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactPerson } from '@/lib/scrape-contact';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, job_id, status, jobs ( title, company, description, url )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key')
      .eq('user_id', user.id)
      .single();

    const groqKey = settings?.groq_api_key || '';
    const job: any = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs;

    let cvText = '';
    try {
      const { data: signedData } = await supabase.storage
        .from('resumes')
        .createSignedUrl(`${user.id}/cv.pdf`, 60);
      if (signedData?.signedUrl) {
        const pdfRes = await fetch(signedData.signedUrl);
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        cvText = await extractCvText(buf);
      }
    } catch (cvErr) {
      console.warn('CV extraction failed:', cvErr);
    }

    let contactPerson = '';
    if (job?.url) {
      contactPerson = await scrapeContactPerson(job.url);
    }

    let ev: Record<string, any> = { match_score: 0, reasoning: '' };

    if (groqKey) {
      try {
        ev = await evaluateJob(
          job?.description || '',
          job?.title || '',
          job?.company || '',
          groqKey,
          cvText,
          contactPerson || undefined,
        );
      } catch (err: any) {
        console.warn('Groq rematch failed:', err?.message ?? err);
        return NextResponse.json({ error: 'Groq evaluation failed: ' + (err?.message ?? 'Unknown') }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'No Groq API key configured' }, { status: 400 });
    }

    await supabase
      .from('applications')
      .update({ match_score: ev.match_score ?? 0, reasoning: ev.reasoning ?? '' })
      .eq('id', application_id)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      match_score: ev.match_score ?? 0,
      reasoning: ev.reasoning ?? '',
    });
  } catch (err: any) {
    console.error('rematch route error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
