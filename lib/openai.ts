import Groq from 'groq-sdk';

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

async function groqWithRetry(
  groq: Groq,
  payload: Parameters<typeof groq.chat.completions.create>[0],
  maxRetries = 4,
) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await groq.chat.completions.create(payload);
    } catch (err: any) {
      lastErr = err;
      const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.toLowerCase().includes('rate limit');
      if (!is429) throw err; // non-rate-limit errors bubble up immediately
      // Exponential backoff: 2s, 4s, 8s, 16s
      const wait = 2000 * Math.pow(2, attempt);
      await sleep(wait);
    }
  }
  throw lastErr;
}

export async function evaluateJob(
  jobDescription: string,
  jobTitle: string,
  company: string,
  groqApiKey?: string,
  cvText?: string,
) {
  const apiKey = groqApiKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('No Groq API key available.');

  const groq = new Groq({ apiKey });

  const profileContext = cvText
    ? `CV van de gebruiker (plain text):\n${cvText}`
    : `Geen CV beschikbaar \u2014 gebruik algemene IT support criteria.`;

  const prompt = `
Je bent een expert AI job application assistent.

Vacature:
Titel: ${jobTitle}
Bedrijf: ${company}
Beschrijving: ${jobDescription}

${profileContext}

INSTRUCTIES:
1. Bereken een match_score (0-100). Hogere score voor interne IT/helpdesk/service desk rollen. Penaliseer pure software development zwaar (onder 40).
2. Schrijf een reasoning zin die uitlegt waarom de score zo is.
3. Schrijf een gepersonaliseerde motivatiebrief van 3 alinea's in het NEDERLANDS, gebaseerd op het CV.
4. Genereer 3-4 CV bullet points in het NEDERLANDS gericht op interne support, ticketing, klanttevredenheid.

Reageer uitsluitend met geldig JSON:
{
  "match_score": 85,
  "reasoning": "...",
  "cover_letter_draft": "Beste Hiring Manager...",
  "resume_bullets_draft": ["..."]
}`;

  const response = await groqWithRetry(groq, {
    messages: [
      { role: 'system', content: 'You are an API that exclusively returns valid JSON objects. Never return markdown or conversational text.' },
      { role: 'user', content: prompt },
    ],
    model: 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
  return parsed;
}
