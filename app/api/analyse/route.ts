import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scrapeJobDescription, resolveRedirect } from '@/lib/scrape-job-description';
import { assertSafeUrl } from '@/lib/url-guard';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { slog } from '@/lib/logger';
import { scoreAndExtractJob } from '@/lib/anthropic';
import { isPremium } from '@/lib/require-premium';
import { captureServer } from '@/lib/posthog-server';
import Anthropic from '@anthropic-ai/sdk';

const SONNET = 'claude-sonnet-4-6';
const OPUS   = 'claude-opus-4-7';

const FREE_ANALYSES_PER_WEEK = 2;

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY niet geconfigureerd.');
  return new Anthropic({ apiKey: key });
}

async function anthropicText(
  client: Anthropic, system: string, user: string, maxTokens = 512, model = SONNET, userId?: string,
): Promise<string> {
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  void slog.debug('llm_usage', 'Token usage', {
    model,
    input_tokens:                msg.usage.input_tokens,
    output_tokens:               msg.usage.output_tokens,
    cache_creation_input_tokens: (msg.usage as unknown as Record<string, unknown>).cache_creation_input_tokens ?? 0,
    cache_read_input_tokens:     (msg.usage as unknown as Record<string, unknown>).cache_read_input_tokens     ?? 0,
  }, userId);
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}

export const maxDuration = 180;

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

    const [premium, { data: settings }] = await Promise.all([
      isPremium(user.id),
      supabase
        .from('user_settings')
        .select('cv_text, keywords, city, job_title, years_experience, extra_context, free_analyses_week, free_analyses_week_reset_at')
        .eq('user_id', user.id)
        .single(),
    ]);

    if (!premium) {
      const now        = Date.now();
      const resetAt    = settings?.free_analyses_week_reset_at ? new Date(settings.free_analyses_week_reset_at).getTime() : 0;
      const sameWeek   = (now - resetAt) < 7 * 24 * 60 * 60 * 1000;
      const weekCount  = sameWeek ? (settings?.free_analyses_week ?? 0) : 0;
      if (weekCount >= FREE_ANALYSES_PER_WEEK) {
        captureServer(user.id, 'paywall_hit', { feature: 'analyse' });
        return NextResponse.json({ error: 'paywall' }, { status: 402 });
      }
    }

    let anthropic: Anthropic;
    try { anthropic = getAnthropicClient(); } catch {
      return NextResponse.json({ error: 'Analyse tijdelijk niet beschikbaar.' }, { status: 503 });
    }

    const jinaKey = process.env.JINA_API_KEY;
    if (!jinaKey) {
      await slog.warn('analyse', 'Jina API-sleutel niet ingesteld', {}, user.id);
    }

    const cvText         = settings?.cv_text         ?? '';
    const keywords       = inlineKeywords ?? (settings?.keywords ?? []).join(', ');
    const jobTitle       = settings?.job_title        ?? '';
    const yearsExp       = settings?.years_experience ?? '';
    const extraContext   = settings?.extra_context    ?? '';
    void inlineCity;

    let resolvedUrl = jobUrl;
    if (jobUrl.includes('adzuna.')) {
      resolvedUrl = await resolveRedirect(jobUrl);
    }

    await slog.info('analyse', 'Analyse gestart', { url: resolvedUrl }, user.id);

    let jobDescription = '';
    try {
      jobDescription = await scrapeJobDescription(resolvedUrl);
    } catch (scrapeErr: unknown) {
      const errMsg = scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr);
      await slog.error('analyse', 'Scraping error', { url: resolvedUrl, error: errMsg }, user.id);
      jobDescription = '';
    }

    if (!jobDescription || jobDescription.trim().length < 80) {
      await slog.warn('analyse', 'Vacaturetekst onvoldoende', { url: resolvedUrl, length: jobDescription?.length ?? 0 }, user.id);
      return NextResponse.json(
        { error: 'Kon de vacaturetekst niet ophalen. Zorg ervoor dat je een directe link naar een individuele vacature gebruikt (bijv. jobat.be/nl/jobs/12345), niet een zoekresultatenpagina.' },
        { status: 422 }
      );
    }

    // Score + extract title/company in one Haiku call
    const { score: haikuScore, reasoning: haikuReasoning, titel: extractedTitle, bedrijf: jobCompany } =
      await scoreAndExtractJob({
        jobDescription,
        cvText,
        keywords: keywords ? keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [],
        location: '',
        userId: user.id,
      });
    const scoreResult = { score: haikuScore, reasoning: haikuReasoning };

    // Build candidate context block for Opus
    const candidateLines: string[] = [];
    if (jobTitle)     candidateLines.push(`Functietitel: ${jobTitle}`);
    if (yearsExp)     candidateLines.push(`Ervaring: ${yearsExp}`);
    if (extraContext) candidateLines.push(`Extra context: ${sanitizePromptInput(extraContext).slice(0, 500)}`);
    const candidateContext = candidateLines.length
      ? `\n\nKandidaat context:\n${candidateLines.join('\n')}`
      : '';

    // Deep analysis via Opus
    const sanitizedDesc = sanitizePromptInput(jobDescription);
    const analysisRaw = await anthropicText(
      anthropic,
      'Je bent een senior Belgische loopbaancoach met grondige kennis van de Belgische arbeidsmarkt. Analyseer diepgaand de fit tussen kandidaat en vacature. Output: alleen geldige JSON, geen andere tekst.',
      `Functie: ${extractedTitle} bij ${jobCompany}\nMatch-score: ${scoreResult.score}/100\nScore-analyse: ${scoreResult.reasoning}\n\nCV-samenvatting:\n${sanitizePromptInput(cvText).slice(0, 2000)}${candidateContext}\n\nVacaturetekst:\n${sanitizedDesc.slice(0, 4000)}\n\nJSON:\n{"pluspunten":["4 specifieke redenen waarom kandidaat goed past"],"aandachtspunten":["3 concrete risico's of hiaten"],"advies":"2-3 zinnen: solliciteren ja/nee, wat benadrukken, wat verwachten","salarisschatting":"€X.…–€Y.… bruto/maand (Belgische markt 2025)","vaardigheidsgap":["max 3 vereiste skills die ontbreken in CV, lege array als geen gap"],"gespreksopeners":["2-3 concrete gespreksonderwerpen of vragen voor het gesprek"]}`,
      1024,
      OPUS,
      user.id,
    );
    let detailedAnalysis: Record<string, unknown> = { pluspunten: [], aandachtspunten: [], advies: '', salarisschatting: '', vaardigheidsgap: [], gespreksopeners: [] };
    try { detailedAnalysis = JSON.parse(analysisRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch {}

    const verdict = `${scoreResult.reasoning || 'Match niet eenduidig'} Score: ${scoreResult.score}/100.`;
    const analysis = {
      titel:            extractedTitle,
      bedrijf:          jobCompany,
      overall_score:    scoreResult.score,
      verdict,
      pluspunten:       Array.isArray(detailedAnalysis.pluspunten)      ? (detailedAnalysis.pluspunten      as string[]).slice(0, 4) : [],
      aandachtspunten:  Array.isArray(detailedAnalysis.aandachtspunten) ? (detailedAnalysis.aandachtspunten as string[]).slice(0, 3) : [],
      advies:           typeof detailedAnalysis.advies          === 'string' ? detailedAnalysis.advies          : '',
      salarisschatting: typeof detailedAnalysis.salarisschatting === 'string' ? detailedAnalysis.salarisschatting : '',
      vaardigheidsgap:  Array.isArray(detailedAnalysis.vaardigheidsgap)  ? (detailedAnalysis.vaardigheidsgap  as string[]).slice(0, 3) : [],
      gespreksopeners:  Array.isArray(detailedAnalysis.gespreksopeners)  ? (detailedAnalysis.gespreksopeners  as string[]).slice(0, 3) : [],
    };

    if (!premium) {
      const now       = Date.now();
      const resetAt   = settings?.free_analyses_week_reset_at ? new Date(settings.free_analyses_week_reset_at).getTime() : 0;
      const sameWeek  = (now - resetAt) < 7 * 24 * 60 * 60 * 1000;
      const weekCount = sameWeek ? (settings?.free_analyses_week ?? 0) : 0;
      await supabase.from('user_settings')
        .update({ free_analyses_week: weekCount + 1, free_analyses_week_reset_at: sameWeek ? settings!.free_analyses_week_reset_at : new Date().toISOString() })
        .eq('user_id', user.id);
    }

    captureServer(user.id, 'job_analysed', {
      score: analysis.overall_score,
      company: analysis.bedrijf,
      title: analysis.titel,
      is_premium: premium,
    });

    await slog.info('analyse', 'Analyse voltooid', { url: resolvedUrl, score: analysis.overall_score }, user.id);
    return NextResponse.json({ success: true, analysis, url: resolvedUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    await slog.error('analyse', 'Analyse route fout', { error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
