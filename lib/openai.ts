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
      const wait = 2000 * Math.pow(2, attempt);
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
    ? `CV van de kandidaat:\n${cvText}`
    : `Geen CV beschikbaar — gebruik algemene IT support criteria.`;

  const descriptionTruncated = jobDescription.slice(0, MAX_DESCRIPTION_CHARS);
  const greeting = contactPerson ? `Beste ${contactPerson},` : `Beste HR-verantwoordelijke,`;

  const prompt = `
Je bent een professionele sollicitatiebrief-schrijver. Schrijf een scherpe, concrete motivatiebrief op basis van het CV en de vacature hieronder.

VACATURE
Titel: ${jobTitle}
Bedrijf: ${company}
Beschrijving: ${descriptionTruncated}

${profileContext}

REGELS VOOR DE MOTIVATIEBRIEF:
- Begin ALTIJD met: "${greeting}"
- Schrijf precies 3 alinea's in het NEDERLANDS
- VERBODEN: vage zinnen zoals "ik ben een harde werker", "ik ben gemotiveerd", "ik kijk ernaar uit", "ik ben ervan overtuigd"
- VERBODEN: elke alinea mag NIET hetzelfde idee herhalen als een andere alinea
- Alinea 1: noem een SPECIFIEKE ervaring of project uit het CV dat direct relevant is voor "${jobTitle}" bij "${company}"
- Alinea 2: noem 2-3 CONCRETE vaardigheden of tools uit het CV (bijv. ticketsystemen, OS, netwerken, scripting) en link ze aan de vacature-eisen
- Alinea 3: één zin over motivatie voor "${company}" specifiek, dan afsluiting — kort en krachtig, geen herhalingen
- Maximaal 250 woorden totaal

INSTRUCTIES:
1. Bereken een match_score (0-100). Hogere score voor interne IT/helpdesk/servicedesk. Penaliseer pure software development zwaar (onder 40).
2. Schrijf een reasoning zin.
3. Schrijf de motivatiebrief volgens de regels hierboven.
4. Genereer 3-4 CV bullet points in het NEDERLANDS gericht op support, ticketing, klanttevredenheid — elk bullet met een meetbaar resultaat indien mogelijk.

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
    temperature: 0.6,
    stream: false,
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
  return parsed;
}
