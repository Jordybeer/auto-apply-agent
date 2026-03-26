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

const MAX_DESCRIPTION_CHARS = 6000;

// Returns true if the job description explicitly requires a driver's license
export function requiresDriverLicense(description: string): boolean {
  const lower = description.toLowerCase();
  const patterns = [
    "rijbewijs", "rijbewijs b", "geldig rijbewijs",
    "driver's license", "driver license", "driving license",
    "permis de conduire", "führerschein",
    "own transport", "eigen vervoer", "eigen wagen",
  ];
  return patterns.some((p) => lower.includes(p));
}

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
Je bent een professionele sollicitatiebrief-schrijver en vacature-analist.

VACATURE
Titel: ${jobTitle}
Bedrijf: ${company}
Beschrijving: ${descriptionTruncated}

${profileContext}

============================
STAP 1 — MATCH SCORE (0-100)
============================
Bereken een eerlijke match_score op basis van onderstaande rubric. Wees streng en realistisch.

RUBRIC (totaal 100 punten):

A. Functie-type match (30 punten):
  - IT helpdesk / servicedesk / support / applicatiebeheer = 25-30 pts
  - Gemengde IT-rol (deels support, deels dev) = 15-20 pts
  - Pure software development / backend / devops = 0-10 pts
  - Niet-IT functie = 0 pts

B. Skill-overlap (40 punten):
  Vergelijk de eisen in de vacature met de vaardigheden in het CV.
  - 8+ relevante skills matchen = 35-40 pts
  - 5-7 matchen = 25-34 pts
  - 3-4 matchen = 15-24 pts
  - 1-2 matchen = 5-14 pts
  - 0 matchen = 0 pts
  Relevante skills: ticketsystemen (Jira, ServiceNow, Zendesk), OS (Windows, Linux), netwerken, Active Directory, scripting, hardware support, klantencontact, ITIL.

C. Senioriteitsniveau (15 punten):
  - Junior / starter / geen ervaring vereist = 13-15 pts
  - 1-3 jaar ervaring vereist = 10-12 pts
  - 3-5 jaar vereist = 6-9 pts
  - 5+ jaar / senior / lead = 0-5 pts

D. Harde disqualificaties (-10 punten elk, minimum score = 0):
  - Rijbewijs vereist = -10 pts (kandidaat heeft geen rijbewijs)
  - Specifieke diploma's die ontbreken in het CV = -10 pts
  - Taalvereiste die niet in CV staat = -10 pts

============================
STAP 2 — MOTIVATIEBRIEF
============================
REGELS:
- Begin ALTIJD met: "${greeting}"
- Schrijf precies 3 alinea's in het NEDERLANDS
- VERBODEN: "ik ben een harde werker", "ik ben gemotiveerd", "ik kijk ernaar uit", "ik ben ervan overtuigd"
- Alinea 1: noem een SPECIFIEKE ervaring of project uit het CV direct relevant voor "${jobTitle}" bij "${company}"
- Alinea 2: noem 2-3 CONCRETE vaardigheden of tools uit het CV (bijv. ticketsystemen, OS, netwerken) en link ze aan de vacature-eisen
- Alinea 3: één zin motivatie voor "${company}" specifiek, dan krachtige afsluiting — geen herhalingen
- Maximaal 250 woorden totaal

============================
STAP 3 — CV BULLETS
============================
Genereer 3-4 CV bullet points in het NEDERLANDS gericht op support, ticketing, klanttevredenheid.
Elk bullet met een meetbaar resultaat indien mogelijk.

============================
OUTPUT
============================
Reageer uitsluitend met geldig JSON:
{
  "match_score": 85,
  "reasoning": "Één zin die de score verklaart met concrete reden(en).",
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
    temperature: 0.3,
    stream: false,
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
  return parsed;
}
