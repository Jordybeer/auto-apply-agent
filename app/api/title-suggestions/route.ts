import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { slog } from '@/lib/logger';
import Anthropic from '@anthropic-ai/sdk';

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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ suggestions: [] }, { status: 401 });

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ suggestions: [] });
  }

  const usedTitles = topUsed.map((t) => sanitizePromptInput(t.title).slice(0, 100));

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
    const client = new Anthropic({ apiKey: anthropicKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: 'Je bent een API die uitsluitend geldige JSON arrays teruggeeft. Geen markdown, geen uitleg.',
      messages: [{ role: 'user', content: prompt }],
    });
    const content = msg.content[0].type === 'text' ? msg.content[0].text : '[]';
    const raw: unknown = JSON.parse(content.match(/\[[\s\S]*\]|\{[\s\S]*\}/)?.[0] ?? '[]');
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
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    void slog.error('title-suggestions', 'Fout bij genereren suggesties', { error: msg }, user.id);
    return NextResponse.json({ suggestions: [] });
  }
}
