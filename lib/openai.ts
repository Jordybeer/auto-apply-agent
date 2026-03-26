import Groq from 'groq-sdk';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

async function groqWithRetry(
  groq: Groq,
  payload: ChatCompletionCreateParamsNonStreaming,
  maxRetries = 4,
): Promise<ChatCompletion> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await groq.chat.completions.create(payload) as ChatCompletion;
    } catch (err: any) {
      lastErr = err;
      const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.toLowerCase().includes('rate limit');
      if (!is429) throw err;
      const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
      await sleep(wait);
    }
  }
  throw lastErr;
}

const MAX_DESCRIPTION_CHARS = 3000;

export async function evaluateJob(
  jobDescription: string,
  jobTitle: string,
  company: string,
  groqApiKey?: string,
  cvText?: string,
  contactPerson?: string,
) {
  const apiKey = groqApiKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('No Groq API key available.');

  const groq = new Groq({ apiKey });

  const profileContext = cvText
    ? `CV van de gebruiker (plain text):\n${cvText}`
    : `Geen CV beschikbaar — gebruik algemene IT support criteria.`;

  // Cap description to avoid crowding out CV context
  const descriptionTruncated = jobDescription.slice(0, MAX_DESCRIPTION_CHARS);

  const greeting = contactPerson
    ? `Beste ${contactPerson},`
    : `Beste HR-verantwoordelijke,`;

  const contactLine = contactPerson
    ? `De motivatiebrief moet beginnen met "${greeting}" en de naam "${contactPerson}" mag ook elders in de brief voorkomen waar dat natuurlijk aanvoelt.`
    : `De motivatiebrief begint met "${greeting}".`;

  const prompt = `
Je bent een expert AI job application assistent die gepersonaliseerde sollicitatiebrieven schrijft.

Vacature:
Titel: ${jobTitle}
Bedrijf: ${company}
Beschrijving: ${descriptionTruncated}

${profileContext}

INSTRUCTIES:
1. Bereken een match_score (0-100). Hogere score voor interne IT/helpdesk/service desk rollen. Penaliseer pure software development zwaar (onder 40).
2. Schrijf een reasoning zin die uitlegt waarom de score zo is.
3. Schrijf een gepersonaliseerde motivatiebrief van 3 alinea's in het NEDERLANDS:
   - Gebaseerd op het CV van de kandidaat
   - Verwijs specifiek naar het bedrijf "${company}" en de functie "${jobTitle}"
   - Benadruk relevante ervaringen en vaardigheden uit het CV die aansluiten bij de vacaturebeschrijving
   - Gebruik een professionele maar enthousiaste toon
   - ${contactLine}
4. Genereer 3-4 CV bullet points in het NEDERLANDS gericht op interne support, ticketing, klanttevredenheid.

Reageer uitsluitend met geldig JSON:
{
  "match_score": 85,
  "reasoning": "...",
  "cover_letter_draft": "${greeting}\\n\\n...",
  "resume_bullets_draft": ["..."]
}`;

  const response = await groqWithRetry(groq, {
    messages: [
      { role: 'system', content: 'You are an API that exclusively returns valid JSON objects. Never return markdown or conversational text.' },
      { role: 'user', content: prompt },
    ],
    model: 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' },
    temperature: 0.4,
    stream: false,
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
  return parsed;
}
