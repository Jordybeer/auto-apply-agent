import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  const { topUsed } = await req.json();
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ suggestions: [] });

  const usedTitles = (topUsed as Array<{ title: string }>).map((t) => t.title);

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
    const groq = new Groq({ apiKey });
    const response = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Je bent een API die uitsluitend geldige JSON arrays teruggeeft. Geen markdown, geen uitleg.' },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.5,
      stream: false,
    });
    const raw = JSON.parse(response.choices[0]?.message?.content || '{}');
    // Model may return { suggestions: [...] } or just an array wrapped in a key
    const arr: string[] = Array.isArray(raw) ? raw : (raw.suggestions ?? raw.titles ?? raw.result ?? Object.values(raw)[0] ?? []);
    return NextResponse.json({ suggestions: arr.slice(0, 5) });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
