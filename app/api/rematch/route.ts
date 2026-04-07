import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { evaluateJob, GroqRateLimitError } from '@/lib/openai';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactPerson } from '@/lib/scrape-contact';
import { locationBonus } from '@/lib/location-score';

export const maxDuration = 60;

interface JobRow {
  title: string;
  company: string;
  description: string | null;
  url: string | null;
  location: string | null;
}

type EvalResult = Awaited<ReturnType<typeof evaluateJob>>;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { application_id } = await request.json();
    if (!application_id) return NextResponse.json({ error: 'application_id required' }, { status: 400 });

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, job_id, status, jobs ( title, company, description, url, location )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key')
      .eq('user_id', user.id)
      .single();

    // Pass user key if present; evaluateJob falls back to GROQ_API_KEY env var when undefined.
    const groqKey: string | undefined = settings?.groq_api_key || undefined;
    const job = (Array.isArray(app.jobs) ? app.jobs[0] : app.jobs) as JobRow | null;

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
    } catch (cvErr: unknown) {
      const msg = cvErr instanceof Error ? cvErr.message : 'Unknown error';
      console.warn('CV extraction failed:', msg);
    }

    let contactPerson = '';
    if (job?.url) {
      contactPerson = await scrapeContactPerson(job.url);
    }

    let ev: EvalResult;
    try {
      ev = await evaluateJob(
        job?.description || '',
        job?.title || '',
        job?.company || '',
        groqKey,
        cvText,
        contactPerson || undefined,
      );
    } catch (err: unknown) {
      if (err instanceof GroqRateLimitError) {
        return NextResponse.json(
          { error: err.message, code: 'RATE_LIMIT' },
          { status: 429 },
        );
      }
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('Groq rematch failed:', msg);
      return NextResponse.json({ error: 'Groq generatie mislukt: ' + msg }, { status: 500 });
    }

    // Apply location proximity bonus (0–10 pts) on top of AI score, cap at 100.
    const bonus = locationBonus(job?.location, job?.description);
    const rawScore: number = typeof ev.match_score === 'number' ? ev.match_score : 0;
    const finalScore = Math.min(100, rawScore + bonus);

    // Append location bonus bullet to reasoning breakdown if bonus > 0.
    const bullets: string[] = Array.isArray(ev.resume_bullets_draft) ? ev.resume_bullets_draft : [];
    if (bonus > 0) {
      bullets.push(`Locatie-bonus: dicht bij Stabroek/Kapellen/Hoevenen — +${bonus} pts`);
    }

    await supabase
      .from('applications')
      .update({
        match_score:          finalScore,
        reasoning:            ev.reasoning            ?? '',
        cover_letter_draft:   ev.cover_letter_draft   ?? '',
        resume_bullets_draft: bullets,
      })
      .eq('id', application_id)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      match_score:          finalScore,
      reasoning:            ev.reasoning            ?? '',
      cover_letter_draft:   ev.cover_letter_draft   ?? '',
      resume_bullets_draft: bullets,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('rematch route error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
