import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scrapeJobDescription, resolveRedirect } from '@/lib/scrape-job-description';
import { assertSafeUrl } from '@/lib/url-guard';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { slog } from '@/lib/logger';
import { scoreJob, type CvStructuredInput } from '@/lib/groq';
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
        .select('groq_api_key, cv_text, cv_structured, keywords, city, radius, free_analyse_used')
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

    const groqKey = (settings?.groq_api_key as string | null)?.trim() || process.env.GROQ_API_KEY || '';

    const jinaKey = process.env.JINA_API_KEY;
    if (!jinaKey) {
      await slog.warn('analyse', 'Jina API-sleutel niet ingesteld', {}, user.id);
    }

    const cvText = settings?.cv_text ?? '';
    const keywords = inlineKeywords ?? (settings?.keywords ?? []).join(', ');
    const city     = inlineCity     ?? (settings?.city ?? '');

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

    // Second: score via Groq (deterministic pipeline stays on Groq)
    const cvStruct   = (settings?.cv_structured as CvStructuredInput | null) || undefined;
    const userCity   = (settings?.city as string | null) || null;
    const userRadius = typeof settings?.radius === 'number' ? settings.radius : null;
    const scoreResult = await scoreJob(jobDescription, jobTitle, jobCompany, groqKey, cvText, keywords, undefined, cvStruct, userCity, userRadius);

    // Third: detailed analysis (pluspunten, aandachtspunten, advies) via Sonnet
    const analysisRaw = await anthropicText(
      anthropic,
      'Je bent een eerlijke Belgische loopbaancoach. Output: alleen JSON.',
      `Vacature: ${jobTitle} bij ${jobCompany}\nMatch-score: ${scoreResult.match_score}/100\nRedenering: ${scoreResult.reasoning}\n\nGeef:\n1. 3 pluspunten (wat past goed)\n2. 2 aandachtspunten (risico's)\n3. 1 zin advies (solliciteren ja/nee?)\n\nVacature:\n${sanitizePromptInput(jobDescription).slice(0, 3000)}\n\nJSON: {"pluspunten": [...], "aandachtspunten": [...], "advies": "..."}`,
      512,
    );
    let detailedAnalysis: Record<string, unknown> = { pluspunten: [], aandachtspunten: [], advies: '' };
    try { detailedAnalysis = JSON.parse(analysisRaw.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch {}

    // Extract per-criterion scores from bullets: "Label: X.X/Y — reden"
    const parseBullet = (bullet: string): { score: number; max: number; toelichting: string } => {
      const m = bullet.match(/:\s*([\d.]+)\/([\d.]+)\s*(?:—\s*(.*))?/);
      if (m) return { score: parseFloat(m[1]), max: parseFloat(m[2]), toelichting: (m[3] ?? bullet).trim() };
      // Skill coverage bullets: "Vereiste skills: X% aanwezig"
      const pct = bullet.match(/(\d+)%\s*aanwezig/i);
      if (pct) return { score: parseInt(pct[1], 10), max: 100, toelichting: bullet };
      return { score: 0, max: 0, toelichting: bullet };
    };

    const bullets = scoreResult.resume_bullets_draft || [];
    const find = (prefix: string) => bullets.find((b: string) => b.toLowerCase().startsWith(prefix.toLowerCase())) ?? '';

    const verdict = `${scoreResult.reasoning || 'Match niet eenduidig'} Score: ${scoreResult.match_score}/100.`;
    const analysis = {
      titel: jobTitle,
      bedrijf: jobCompany,
      overall_score: scoreResult.match_score,
      verdict,
      scores: {
        functie:   parseBullet(find('Functie-match')),
        ervaring:  parseBullet(find('Ervaring')),
        sector:    parseBullet(find('Sector')),
        taal:      parseBullet(find('Taal')),
        contract:  parseBullet(find('Contract')),
        groei:     parseBullet(find('Groei')),
        skills:    parseBullet(find('Vereiste skills')),
      },
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
