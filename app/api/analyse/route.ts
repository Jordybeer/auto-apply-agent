import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scrapeJobDescription } from '@/lib/scrape-job-description';
import Groq from 'groq-sdk';

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

    // Optional inline overrides from the client form
    const inlineKeywords: string | undefined = body?.keywords?.trim() || undefined;
    const inlineCity: string | undefined     = body?.city?.trim()     || undefined;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('cv_text, keywords, city')
      .eq('user_id', user.id)
      .single();

    const cvText = settings?.cv_text ?? '';
    // Inline overrides take precedence over stored profile values
    const keywords = inlineKeywords ?? (settings?.keywords ?? []).join(', ');
    const city     = inlineCity     ?? (settings?.city ?? '');

    let jobDescription = '';
    try {
      jobDescription = await scrapeJobDescription(jobUrl);
    } catch {
      jobDescription = '';
    }

    if (!jobDescription || jobDescription.trim().length < 80) {
      return NextResponse.json(
        { error: 'Kon de vacaturetekst niet ophalen. Controleer de URL of probeer opnieuw.' },
        { status: 422 }
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `Je bent een eerlijke en scherpe loopbaancoach die Nederlandstalige sollicitanten helpt.
Je analyseert hoe goed een vacature past bij het profiel van de gebruiker.
Wees direct, persoonlijk en specifiek. Vermijd vage uitspraken.
Je output is altijd in het Nederlands (nl-BE).`;

    const userPrompt = `## Profiel van de gebruiker

Zoekwoorden / functies: ${keywords || 'niet opgegeven'}
Stad: ${city || 'niet opgegeven'}

### CV / profieltekst
${cvText ? cvText.slice(0, 3000) : 'Geen CV beschikbaar.'}

---

## Vacaturetekst (geschraapt van ${jobUrl})

${jobDescription.slice(0, 4000)}

---

Analyseer hoe goed deze vacature past bij dit profiel. Geef je antwoord in onderstaand JSON-formaat (enkel JSON, geen markdown omheen):

{
  "titel": "<functietitel uit de vacature>",
  "bedrijf": "<bedrijfsnaam uit de vacature>",
  "overall_score": <geheel getal 0-100>,
  "verdict": "<1 krachtige zin: past het of niet en waarom>",
  "scores": {
    "vaardigheden": { "score": <0-100>, "toelichting": "<max 2 zinnen>" },
    "ervaring": { "score": <0-100>, "toelichting": "<max 2 zinnen>" },
    "locatie": { "score": <0-100>, "toelichting": "<max 2 zinnen>" },
    "groeipotentieel": { "score": <0-100>, "toelichting": "<max 2 zinnen>" },
    "cultuur": { "score": <0-100>, "toelichting": "<max 2 zinnen>" }
  },
  "pluspunten": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "aandachtspunten": ["<bullet 1>", "<bullet 2>"],
  "advies": "<persoonlijk, concreet advies van 2-4 zinnen over of ze moeten solliciteren en hoe>"
}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'AI-antwoord kon niet worden gelezen.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, analysis, url: jobUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
