import { NextRequest, NextResponse } from 'next/server';
import { requireServerEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase-request';
import { GROQ_MODEL, callGroq, GroqRateLimitError, GroqAuthError } from '@/lib/groq';
import { checkLlmRateLimit } from '@/lib/llm-rate-limit';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TopUsedItem = { title: string; weight: number; count?: number };
type RequestBody = { topUsed?: TopUsedItem[] };

function extractStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const candidate =
      obj['suggestions'] ?? obj['titles'] ?? obj['result'] ?? Object.values(obj)[0];
    if (Array.isArray(candidate)) {
      return candidate.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

export async function POST(req: NextRequest) {
  const body     = (await req.json()) as RequestBody;
  const topUsed  = body.topUsed ?? [];

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ suggestions: [] }, { status: 401 });

  const { allowed } = await checkLlmRateLimit(user.id, supabase);
  if (!allowed) return NextResponse.json({ error: 'Daglimiet bereikt. Probeer morgen opnieuw.' }, { status: 429 });

  const { data: settings } = await supabase
    .from('user_settings')
    .select('suggested_titles, suggestions_generated_at')
    .eq('user_id', user.id)
    .single();

  if (
    Array.isArray(settings?.suggested_titles) &&
    settings.suggestions_generated_at &&
    Date.now() - new Date(settings.suggestions_generated_at as string).getTime() < CACHE_TTL_MS
  ) {
    return NextResponse.json({ suggestions: settings.suggested_titles as string[] });
  }

  let apiKey: string;
  try {
    apiKey = requireServerEnv('GROQ_API_KEY');
  } catch {
    return NextResponse.json({ suggestions: [] });
  }

  const usedTitles = topUsed.map((t) => t.title);

  const prompt = `Je bent een career coach gespecialiseerd in de Belgische jobmarkt.

De kandidaat heeft recentelijk gesolliciteerd op of bewaard:
${usedTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Genereer exact 5 jobtitels die:
- STERK gerelateerd zijn aan de bovenstaande functies (zelfde sector, aanpalende skills)
- NIET exact voorkomen in de bovenstaande lijst
- Realistisch zoekbaar zijn op Belgische jobsites (Jobat, Indeed BE, LinkedIn BE)
- Mogelijk MEER of ANDERE resultaten opleveren (synoniemen, Engelstalige equivalenten, bredere/niche varianten)
- Passen bij een junior-tot-medior profiel

Geef alleen een JSON-array van 5 strings. Geen uitleg, geen markdown.
Voorbeeld: ["ICT Helpdeskmedewerker", "Service Desk Analyst", "IT Ondersteuner", "Technisch Coördinator", "Applicatiebeheerder"]`;

  try {
    const response = await callGroq({
      messages: [
        {
          role:    'system',
          content: 'Je bent een API die uitsluitend geldige JSON arrays teruggeeft. Geen markdown, geen uitleg.',
        },
        { role: 'user', content: prompt },
      ],
      model:           GROQ_MODEL,
      response_format: { type: 'json_object' },
      temperature:     0.5,
      stream:          false,
    }, apiKey);

    const raw: unknown = JSON.parse(response.choices[0]?.message?.content ?? '{}');
    const arr = extractStringArray(raw).slice(0, 5);

    await supabase
      .from('user_settings')
      .upsert(
        {
          user_id:                  user.id,
          suggested_titles:         arr,
          suggestions_generated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    return NextResponse.json({ suggestions: arr });
  } catch (err: unknown) {
    if (err instanceof GroqRateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    if (err instanceof GroqAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ suggestions: [] });
  }
}
