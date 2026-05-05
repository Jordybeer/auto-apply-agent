import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scoreJobPremium, draftCoverLetterPremium } from '@/lib/anthropic';
import { extractCvText } from '@/lib/parse-cv';
import { scrapeContactPerson } from '@/lib/scrape-contact';
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
      .select('cv_text, keywords')
      .eq('user_id', user.id)
      .single();

    const job = (Array.isArray(app.jobs) ? app.jobs[0] : app.jobs) as { title?: string; company?: string; description?: string; url?: string; location?: string } | null;

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

    let scoreResult: { score: number; reasoning: string } | undefined;
    let coverLetter = '';
    try {
      scoreResult = await scoreJobPremium({
        jobDescription: desc,
        cvText,
        keywords: (settings?.keywords as string[] | null) ?? [],
        location: job?.location || '',
      });
      const { allowed } = await checkLlmRateLimit(user.id, supabase);
      if (allowed) {
        coverLetter = await draftCoverLetterPremium({
          jobDescription: desc,
          cvText,
          jobTitle: title,
          company: comp,
        });
        void contactPerson;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      return NextResponse.json({ error: 'Generatie mislukt: ' + msg }, { status: 500 });
    }

    const ev = {
      match_score: scoreResult.score,
      reasoning: scoreResult.reasoning,
      cover_letter_draft: coverLetter,
      resume_bullets_draft: [] as string[],
    };

    await supabase
      .from('applications')
      .update({
        match_score:          ev.match_score          ?? 0,
        reasoning:            ev.reasoning            ?? '',
        cover_letter_draft:   ev.cover_letter_draft   ?? '',
        resume_bullets_draft: ev.resume_bullets_draft ?? [],
      })
      .eq('id', application_id)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      match_score:          ev.match_score          ?? 0,
      reasoning:            ev.reasoning            ?? '',
      cover_letter_draft:   ev.cover_letter_draft   ?? '',
      resume_bullets_draft: ev.resume_bullets_draft ?? [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('rematch', 'Rematch route fout', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
