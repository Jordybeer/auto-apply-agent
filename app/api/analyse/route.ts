import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scrapeJobDescription } from '@/lib/scrape-job-description';
import { assertSafeUrl } from '@/lib/url-guard';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { slog } from '@/lib/logger';
import { GROQ_MODEL, callGroq, scoreJob, GroqRateLimitError, GroqAuthError, type CvStructuredInput } from '@/lib/groq';
import { checkLlmRateLimit } from '@/lib/llm-rate-limit';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });

    const body = await request.json();
    const jobUrl: string = body?.url?.trim();
    if (!jobUrl || !/^https?:\/\//i.test(jobUrl)) {
      return NextResponse.json({ error: 'Ongeldige URL.' }, { status: 400 });
    }
    try { assertSafeUrl(jobUrl); } catch {
      return NextResponse.json({ error: 'Ongeldige URL.' }, { status: 400 });
    }

    const inlineKeywords: string | undefined = body?.keywords?.trim() || undefined;
    const inlineCity: string | undefined     = body?.city?.trim()     || undefined;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('groq_api_key, cv_text, cv_structured, keywords, city, radius')
      .eq('user_id', user.id)
      .single();

    const groqKey = (settings?.groq_api_key as string | null)?.trim() || process.env.GROQ_API_KEY || '';
    if (!groqKey) return NextResponse.json({ error: 'Geen Groq API-sleutel ingesteld.' }, { status: 401 });

    const jinaKey = process.env.JINA_API_KEY;
    if (!jinaKey) {
      await slog.warn('analyse', 'Jina API-sleutel niet ingesteld', {}, user.id);
    }

    const { allowed } = await checkLlmRateLimit(user.id, supabase);
    if (!allowed) return NextResponse.json({ error: 'Daglimiet bereikt. Probeer morgen opnieuw.' }, { status: 429 });
    const cvText = settings?.cv_text ?? '';
    const keywords = inlineKeywords ?? (settings?.keywords ?? []).join(', ');
    const city     = inlineCity     ?? (settings?.city ?? '');

    await slog.info('analyse', 'Analyse gestart', { url: jobUrl }, user.id);

    let jobDescription = '';
    try {
      jobDescription = await scrapeJobDescription(jobUrl);
    } catch (scrapeErr: unknown) {
      const errMsg = scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr);
      await slog.error('analyse', 'Scraping error', { url: jobUrl, error: errMsg }, user.id);
      jobDescription = '';
    }

    if (!jobDescription || jobDescription.trim().length < 80) {
      await slog.warn('analyse', 'Vacaturetekst onvoldoende', { url: jobUrl, length: jobDescription?.length ?? 0 }, user.id);
      return NextResponse.json(
        { error: 'Kon de vacaturetekst niet ophalen. Zorg ervoor dat je een directe link naar een individuele vacature gebruikt (bijv. jobat.be/nl/jobs/12345), niet een zoekresultatenpagina.' },
        { status: 422 }
      );
    }

    // First: extract job title & company using LLM
    const extractionCompletion = await callGroq({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'Je extraheert job-informatie uit vacatures. Output: alleen JSON.' },
        {
          role: 'user',
          content: `Extraheer uit deze vacaturetekst de functietitel en bedrijfsnaam.\n\n${sanitizePromptInput(jobDescription).slice(0, 2000)}\n\nJSON: {"titel": "...", "bedrijf": "..."}`,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }, groqKey);

    const extractedRaw = extractionCompletion.choices[0]?.message?.content ?? '{}';
    let extracted: Record<string, string> = { titel: '', bedrijf: '' };
    try {
      extracted = JSON.parse(extractedRaw);
    } catch {
      const cleaned = extractedRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      try {
        extracted = JSON.parse(cleaned);
      } catch {
        extracted = { titel: 'Onbekend', bedrijf: 'Onbekend' };
      }
    }

    const jobTitle = (extracted.titel ?? 'Onbekend').slice(0, 100);
    const jobCompany = (extracted.bedrijf ?? 'Onbekend').slice(0, 100);

    // Second: use scoreJob for consistent scoring
    const cvStruct = (settings?.cv_structured as CvStructuredInput | null) || undefined;
    const userCity = (settings?.city as string | null) || null;
    const userRadius = typeof settings?.radius === 'number' ? settings.radius : null;
    const scoreResult = await scoreJob(jobDescription, jobTitle, jobCompany, groqKey, cvText, keywords, undefined, cvStruct, userCity, userRadius);

    // Third: get detailed analysis (pros, cons, advice) using the score as context
    const analysisCompletion = await callGroq({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'Je bent een eerlijke loopbaancoach. Output: alleen JSON.' },
        {
          role: 'user',
          content: `Vacature: ${jobTitle} bij ${jobCompany}\nMatch-score: ${scoreResult.match_score}/100\nRedenering: ${scoreResult.reasoning}\n\nGa de vacaturetekst na en geef:\n1. 3 pluspunten (wat past goed)\n2. 2 aandachtspunten (wat is lastig/risico)\n3 korte advies (1 zin: solliciteren ja/nee?)\n\nVacature:\n${sanitizePromptInput(jobDescription).slice(0, 3000)}\n\nJSON: {"pluspunten": [...], "aandachtspunten": [...], "advies": "..."}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }, groqKey);

    const analysisRaw = analysisCompletion.choices[0]?.message?.content ?? '{}';
    let detailedAnalysis: Record<string, unknown> = { pluspunten: [], aandachtspunten: [], advies: '' };
    try {
      detailedAnalysis = JSON.parse(analysisRaw);
    } catch {
      const cleaned = analysisRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      try {
        detailedAnalysis = JSON.parse(cleaned);
      } catch {
        detailedAnalysis = { pluspunten: [], aandachtspunten: [], advies: '' };
      }
    }

    // Extract component scores from bullets (handles multiple formats)
    const parseScore = (bullet: string): { score: number; toelichting: string } => {
      let score = 0;
      let toelichting = bullet;

      // Format 1: "Label: description — X/Y pts"
      const match1 = bullet.match(/—\s*(\d+)\/\d+\s*pts/i);
      if (match1) {
        score = parseInt(match1[1], 10);
        toelichting = bullet.replace(/\s*—\s*\d+\/\d+\s*pts/, '').trim();
      } else {
        // Format 2: "Label: X% aanwezig (Y/Z)" - extract as percentage
        const match2 = bullet.match(/(\d+)%\s*aanwezig/i);
        if (match2) {
          // Convert percentage to 0-25 scale for skills
          score = Math.round((parseInt(match2[1], 10) / 100) * 25);
          toelichting = bullet;
        }
      }

      return { score, toelichting };
    };

    const bullets = scoreResult.resume_bullets_draft || [];
    const functieMatch = bullets.find((b: string) => b.includes('Functie-match')) || '';
    const skilMatch = bullets.find((b: string) => b.includes('Vereiste skills') || b.includes('Skill')) || '';
    const ervaringMatch = bullets.find((b: string) => b.includes('Ervaringsniveau')) || '';

    const verdict = `${scoreResult.reasoning || 'Match niet eenduidig'} Score: ${scoreResult.match_score}/100.`;
    const analysis = {
      titel: jobTitle,
      bedrijf: jobCompany,
      overall_score: scoreResult.match_score,
      verdict,
      scores: {
        functie_match: parseScore(functieMatch),
        vaardigheden: parseScore(skilMatch),
        ervaring: parseScore(ervaringMatch),
      },
      pluspunten: Array.isArray(detailedAnalysis.pluspunten) ? detailedAnalysis.pluspunten.slice(0, 3) : [],
      aandachtspunten: Array.isArray(detailedAnalysis.aandachtspunten) ? detailedAnalysis.aandachtspunten.slice(0, 2) : [],
      advies: detailedAnalysis.advies ?? '',
    };

    await slog.info('analyse', 'Analyse voltooid', { url: jobUrl, score: analysis.overall_score }, user.id);
    return NextResponse.json({ success: true, analysis, url: jobUrl });
  } catch (err: unknown) {
    if (err instanceof GroqRateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    if (err instanceof GroqAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    await slog.error('analyse', 'Analyse route fout', { error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
