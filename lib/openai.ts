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
Bereken een eerlijke match_score op basis van onderstaande rubric. Wees streng en realistisch en gebruik het volledige bereik 0–100 in plaats van alles rond 80–90 te clusteren.

INTERPRETATIE VAN SCORE:
- 85–100: uitzonderlijk sterke match (top 10%)
- 70–84: duidelijke match met enkele hiaten
- 50–69: twijfelgeval / gemiddeld passend
- 30–49: zwakke match
- 0–29: vrijwel geen match

RUBRIC (totaal 100 punten):

A. Functie-type match (30 punten):
  - IT helpdesk / servicedesk / support / applicatiebeheer = 22–30 pts
  - Gemengde IT-rol (deels support, deels dev) = 12–21 pts
  - Pure software development / backend / devops = 0–10 pts
  - Niet-IT functie = 0 pts
  OPGELET: Geef GEEN hoge score alleen omdat het woord "support" of "helpdesk" in de titel staat — kijk altijd naar de volledige beschrijving.
  BONUS: Indien de vacature thuiswerk / remote / hybride / "(optioneel) thuis werken" vermeldt: +3 pts (kleine bonus, max totaal blijft 100).

B. Skill-overlap (40 punten):
  Vergelijk de eisen in de vacature met de vaardigheden in het CV.
  - 8+ relevante skills matchen = 34–40 pts
  - 5–7 matchen = 24–33 pts
  - 3–4 matchen = 14–23 pts
  - 1–2 matchen = 4–13 pts
  - 0 matchen = 0–3 pts
  Relevante skills: ticketsystemen (Jira, ServiceNow, Zendesk), OS (Windows, Linux), netwerken, Active Directory, scripting, hardware support, klantencontact, ITIL.

C. Senioriteitsniveau (15 punten):
  - Junior / starter / geen ervaring vereist = 13–15 pts
  - 1–3 jaar ervaring vereist = 9–12 pts
  - 3–5 jaar vereist = 5–8 pts
  - 5+ jaar / senior / lead = 0–4 pts

D. Harde disqualificaties (-10 punten elk, minimum score = 0):
  - Rijbewijs vereist = -10 pts (kandidaat heeft geen rijbewijs)
  - Specifieke diploma's die ontbreken in het CV = -10 pts
  - Taalvereiste die niet in CV staat = -10 pts

Zorg dat de uiteindelijke match_score de som van A + B + C + eventuele bonussen + eventuele minpunten weerspiegelt, maar nooit boven 100 gaat en nooit onder 0.

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
STAP 3 — SCORE BREAKDOWN (BULLETS)
============================
Maak 3–4 BULLET POINTS in het NEDERLANDS die uitleggen WAAROM de score is wat hij is op basis van de rubric.
Gebruik GEEN markdown (geen "- " of "* "), alleen platte tekstregels.
Voorbeelden van bullets:
- "Functie-type match: IT helpdesk — 25/30 pts"
- "Skill-overlap: 6 van 8 gevraagde skills gevonden — 28/40 pts"
- "Senioriteit: vacature zoekt starter, CV past goed — 14/15 pts"
- "Bonus: thuiswerk mogelijk — +3 pts"

Zorg dat elke bullet precies één aspect van de rubric uitlegt (A, B, C of bonus/disqualifiers) met concrete getallen.

============================
OUTPUT
============================
Reageer uitsluitend met geldig JSON:
{
  "match_score": 85,
  "reasoning": "Één zin die de totale score samenvat met concrete reden(en).",
  "cover_letter_draft": "${greeting}\\n\\n...",
  "resume_bullets_draft": [
    "Functie-type match: IT helpdesk — 25/30 pts",
    "Skill-overlap: 6 van 8 gevraagde skills gevonden — 28/40 pts",
    "Senioriteit: vacature zoekt starter, CV past goed — 14/15 pts",
    "Bonus: thuiswerk mogelijk — +3 pts"
  ]
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
