import Anthropic from '@anthropic-ai/sdk';
import { callGroq, GROQ_MODEL } from '@/lib/groq';

export interface CvStructured {
  skills: string[];
  tools: string[];
  languages: string[];
  experience_summary: string;
  experience_years: number | null;
  education: string;
  job_titles: string[];
}

const EMPTY: CvStructured = {
  skills: [],
  tools: [],
  languages: [],
  experience_summary: '',
  experience_years: null,
  education: '',
  job_titles: [],
};

const SYSTEM = `Je extraheert gestructureerde data uit CVs voor een Belgische jobmatching-app. Geef uitsluitend geldige JSON terug, geen markdown.

Regels:
- skills: max 15 kerntechnische vaardigheden (alleen als ze meerdere keren of centraal voorkomen — niet elke zijdelingse vermelding). Normaliseer: "python" → "Python", "MS Excel" → "Excel".
- tools: max 15 concrete software/tools (bv. "Jira", "Azure DevOps", "SAP"). Geen vage termen zoals "Office" zonder specificatie.
- languages: formaat "[taal] ([niveau])" bv. "Nederlands (moedertaal)", "Frans (B2)", "Engels (vloeiend)". Belgische diploma-talen: Nederlands, Frans, Engels, Duits.
- experience_summary: 2-3 zinnen die de rode draad van de werkervaring samenvatten. Syntheseer — kopieer geen tekst.
- experience_years: totaal aantal jaren beroepservaring als getal (niet als string). Null als onduidelijk.
- education: hoogst behaalde diploma + richting + instelling indien vermeld. Belgische types: secundair, graduaat, bachelor (HBO5/PBA), master, doctoraat. Max 200 tekens.
- job_titles: max 5 effectieve functietitels (geen afdeling of domein als titel). Meest recent eerst.`;

function parseRaw(content: string): CvStructured {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch { return EMPTY; }
  const arr = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 15) : [];
  return {
    skills:             arr(raw.skills),
    tools:              arr(raw.tools),
    languages:          arr(raw.languages),
    experience_summary: typeof raw.experience_summary === 'string' ? raw.experience_summary.slice(0, 500) : '',
    experience_years:   typeof raw.experience_years === 'number' ? Math.round(raw.experience_years) : null,
    education:          typeof raw.education === 'string' ? raw.education.slice(0, 200) : '',
    job_titles:         arr(raw.job_titles).slice(0, 5),
  };
}

export async function extractStructuredCv(
  rawText: string,
  groqApiKey?: string,
): Promise<CvStructured> {
  if (!rawText || rawText.trim().length < 50) return EMPTY;

  const userPrompt = `Extraheer de velden uit dit CV:\n\n<user_input>\n${rawText.slice(0, 6000)}\n</user_input>\n\nJSON:`;

  // Sonnet primary
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
      return parseRaw(text);
    } catch { /* fall through to Groq */ }
  }

  // Groq fallback
  try {
    const response = await callGroq({
      messages: [
        { role: 'system', content: 'Je extraheert gestructureerde data uit CVs. Alleen JSON, geen markdown.' },
        { role: 'user', content: userPrompt },
      ],
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      stream: false,
    }, groqApiKey);
    return parseRaw(response.choices[0]?.message?.content || '{}');
  } catch {
    return EMPTY;
  }
}
