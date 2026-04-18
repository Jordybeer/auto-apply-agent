import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scoreJob, draftCoverLetter, GroqRateLimitError, GroqAuthError } from '@/lib/groq';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactPerson } from '@/lib/scrape-contact';
import { locationBonus } from '@/lib/location-score';
import { checkLlmRateLimit } from '@/lib/llm-rate-limit';
import { slog } from '@/lib/logger';

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
      .select('id, job_id, status, jobs ( title, company, description, url, location )')
      .eq('id', application_id)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key, cv_text, keywords, city')
      .eq('user_id', user.id)
      .single();

    const groqKey: string | undefined = settings?.groq_api_key || process.env.GROQ_API_KEY || undefined;
    if (!groqKey) return NextResponse.json({ error: 'Geen Groq API-sleutel ingesteld.', code: 'AUTH_ERROR' }, { status: 401 });

    const job = (Array.isArray(app.jobs) ? app.jobs[0] : app.jobs) as { title?: string; company?: string; description?: string; url?: string; location?: string } | null;

    // Use cached cv_text — avoids PDF parse on every rematch.
    let cvText: string = (settings?.cv_text as string | null) ?? '';
    if (!cvText) {
      try {
        const { data: signedData } = await supabase.storage
          .from('resumes')
          .createSignedUrl(`${user.id}/cv.pdf`, 60);
        if (signedData?.signedUrl) {
          const pdfRes = await fetch(signedData.signedUrl);
          const buf = Buffer.from(await pdfRes.arrayBuffer());
          cvText = await extractCvText(buf);
          await supabase
            .from('user_settings')
            .upsert({ user_id: user.id, cv_text: cvText }, { onConflict: 'user_id' });
        }
      } catch (cvErr) {
        void slog.warn('rematch', 'CV extractie mislukt', { error: String(cvErr) }, user.id);
      }
    }

    let contactPerson = '';
    if (job?.url) {
      contactPerson = await scrapeContactPerson(job.url);
    }

    const desc = job?.description || '';
    const title = job?.title || '';
    const comp = job?.company || '';
    const kwString = (settings?.keywords as string[] | null)?.join(', ') || undefined;

    let score;
    let letter = { cover_letter_draft: '' };
    try {
      score = await scoreJob(desc, title, comp, groqKey, cvText, kwString);
      const { allowed } = await checkLlmRateLimit(user.id, supabase);
      if (allowed) {
        letter = await draftCoverLetter(desc, title, comp, groqKey, cvText, contactPerson || undefined, kwString);
      }
    } catch (err: unknown) {
      if (err instanceof GroqRateLimitError) {
        return NextResponse.json({ error: err.message, code: 'RATE_LIMIT' }, { status: 429 });
      }
      if (err instanceof GroqAuthError) {
        return NextResponse.json({ error: err.message, code: 'AUTH_ERROR' }, { status: 401 });
      }
      const msg = err instanceof Error ? err.message : 'Unknown';
      return NextResponse.json({ error: 'Groq generatie mislukt: ' + msg }, { status: 500 });
    }
    const ev = { ...score, ...letter };

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
    void slog.error('rematch', 'Rematch route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
