import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scrapeJobDescription, resolveRedirect } from '@/lib/scrape-job-description';
import { assertSafeUrl } from '@/lib/url-guard';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { slog } from '@/lib/logger';
import { scoreJobPremium } from '@/lib/anthropic';
import { isPremium } from '@/lib/require-premium';
import Anthropic from '@anthropic-ai/sdk';

const SONNET = 'claude-sonnet-4-6';

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY niet geconfigureerd.');
  return new Anthropic({ apiKey: key });
}

async function anthropicText(client: Anthropic, system: string, user: string, maxTokens = 512): Promise<string> {
  const msg = await client.messages.create({
    model: SONNET,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}

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

    const [premium, { data: settings }] = await Promise.all([
      isPremium(user.id),
      supabase
        .from('user_settings')
        .select('cv_text, keywords, city, free_analyse_used')
        .eq('user_id', user.id)
        .single(),
    ]);

    if (!premium) {
      if (settings?.free_analyse_used) {
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

    const cvText = settings?.cv_text ?? '';
    const keywords = inlineKeywords ?? (settings?.keywords ?? []).join(', ');
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

    // First: extract job title & company using Sonnet
    const extractedRaw = await anthropicText(
      anthropic,
      'Je extraheert job-informatie uit vacatures. Output: alleen JSON met keys "titel" en "bedrijf".',
      `Extraheer functietitel en bedrijfsnaam:\n\n${sanitizePromptInput(jobDescription).slice(0, 2000)}\n\nJSON: {"titel": "...", "bedrijf": "..."}`,
      128,
    );
    let extracted: Record<string, string> = { titel: 'Onbekend', bedrijf: 'Onbekend' };
    try { extracted = JSON.parse(extractedRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch {}

    const jobTitle   = (extracted.titel  ?? 'Onbekend').slice(0, 100);
    const jobCompany = (extracted.bedrijf ?? 'Onbekend').slice(0, 100);

    // Second: score via Haiku
    const scoreResult = await scoreJobPremium({
      jobDescription,
      cvText,
      keywords: keywords ? keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [],
      location: '',
    });

    // Third: detailed analysis (pluspunten, aandachtspunten, advies) via Sonnet
    const analysisRaw = await anthropicText(
      anthropic,
      'Je bent een eerlijke Belgische loopbaancoach. Output: alleen JSON.',
      `Vacature: ${jobTitle} bij ${jobCompany}\nMatch-score: ${scoreResult.score}/100\nRedenering: ${scoreResult.reasoning}\n\nGeef:\n1. 3 pluspunten (wat past goed)\n2. 2 aandachtspunten (risico's)\n3. 1 zin advies (solliciteren ja/nee?)\n\nVacature:\n${sanitizePromptInput(jobDescription).slice(0, 3000)}\n\nJSON: {"pluspunten": [...], "aandachtspunten": [...], "advies": "..."}`,
      512,
    );
    let detailedAnalysis: Record<string, unknown> = { pluspunten: [], aandachtspunten: [], advies: '' };
    try { detailedAnalysis = JSON.parse(analysisRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch {}

    const verdict = `${scoreResult.reasoning || 'Match niet eenduidig'} Score: ${scoreResult.score}/100.`;
    const analysis = {
      titel: jobTitle,
      bedrijf: jobCompany,
      overall_score: scoreResult.score,
      verdict,
      scores: {} as Record<string, { score: number; max: number; toelichting: string }>,
      pluspunten: Array.isArray(detailedAnalysis.pluspunten) ? detailedAnalysis.pluspunten.slice(0, 3) : [],
      aandachtspunten: Array.isArray(detailedAnalysis.aandachtspunten) ? detailedAnalysis.aandachtspunten.slice(0, 2) : [],
      advies: detailedAnalysis.advies ?? '',
    };

    if (!premium) {
      await supabase.from('user_settings').update({ free_analyse_used: true }).eq('user_id', user.id);
    }

    await slog.info('analyse', 'Analyse voltooid', { url: resolvedUrl, score: analysis.overall_score }, user.id);
    return NextResponse.json({ success: true, analysis, url: resolvedUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    await slog.error('analyse', 'Analyse route fout', { error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
