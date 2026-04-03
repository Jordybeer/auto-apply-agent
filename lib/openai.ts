import Groq from 'groq-sdk';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';

// llama-3.3-70b-versatile: replaces decommissioned deepseek-r1-distill-llama-70b.
// Better fluency and natural tone for cover letter generation.
// Slightly higher temperature (0.72) than the old reasoning model (0.6) to restore
// creative variation without sacrificing JSON reliability.
export const GROQ_MODEL = 'llama-3.3-70b-versatile';

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// Sentinel so callers can distinguish rate-limit exhaustion from other errors.
export class GroqRateLimitError extends Error {
  constructor(cause?: unknown) {
    super('Groq rate limit bereikt. Probeer het zo opnieuw.');
    this.name = 'GroqRateLimitError';
    if (cause) this.cause = cause;
  }
}

function is429(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  const status  = e['status'];
  const message = typeof e['message'] === 'string' ? e['message'] : '';
  return (
    status === 429 ||
    message.includes('429') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('rate_limit')
  );
}

async function groqWithRetry(
  groq: Groq,
  payload: ChatCompletionCreateParamsNonStreaming,
  maxRetries = 4,
): Promise<ChatCompletion> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await groq.chat.completions.create(payload) as ChatCompletion;
    } catch (err: unknown) {
      lastErr = err;
      if (!is429(err)) throw err;
      const wait = 2000 * Math.pow(2, attempt);
      console.warn(`Groq rate limit — retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
      await sleep(wait);
    }
  }
  // All retries exhausted — throw a typed error so routes can return 429.
  throw new GroqRateLimitError(lastErr);
}

const MAX_DESCRIPTION_CHARS = 6000;

export function requiresDriverLicense(description: string): boolean {
  const lower = description.toLowerCase();
  const patterns = [
    'rijbewijs', 'rijbewijs b', 'geldig rijbewijs',
    "driver's license", 'driver license', 'driving license',
    'permis de conduire', 'führerschein',
    'own transport', 'eigen vervoer', 'eigen wagen',
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
    : `Geen CV beschikbaar — gebruik algemene IT support / helpdesk criteria.`;

  const descriptionTruncated = jobDescription.slice(0, MAX_DESCRIPTION_CHARS);

  const safeName = (contactPerson ?? '')
    .replace(/[^\p{L}\p{N} '\-\.]/gu, '')
    .trim()
    .slice(0, 80);
  const greeting = safeName ? `Beste ${safeName},` : `Beste HR-verantwoordelijke,`;

  const prompt = `
Je bent een ervaren carrièrecoach die een echte, persoonlijke sollicitatiebrief schrijft voor een specifieke vacature.
Je schrijft alsof je de kandidaat bent — direct, zelfverzekerd, menselijk.

=== VACATURE ===
Functietitel: ${jobTitle}
Bedrijf: ${company}
Vacaturetekst:
${descriptionTruncated}

=== KANDIDAAT ===
${profileContext}

============================
STAP 1 — MATCH SCORE (0-100)
============================
Bereken een eerlijke match_score op basis van onderstaande rubric. Wees streng en realistisch.

INTERPRETATIE:
- 85–100: uitzonderlijk sterke match (top 10%)
- 70–84: duidelijke match met kleine hiaten
- 50–69: gemiddeld passend
- 30–49: zwakke match
- 0–29: vrijwel geen match

RUBRIC (totaal 100 punten):

A. Functie-type match (30 punten):
  - IT helpdesk / servicedesk / support / applicatiebeheer = 22–30 pts
  - Gemengde IT-rol (deels support, deels dev) = 12–21 pts
  - Pure software development / backend / devops = 0–10 pts
  - Niet-IT functie = 0 pts
  BONUS: thuiswerk / remote / hybride vermeld in vacature: +3 pts

B. Skill-overlap (40 punten):
  Vergelijk vacature-eisen met CV-vaardigheden.
  8+ matchen = 34–40 | 5–7 = 24–33 | 3–4 = 14–23 | 1–2 = 4–13 | 0 = 0–3
  Relevante skills: ticketsystemen (Jira, ServiceNow, Zendesk), Windows/Linux, netwerken, Active Directory, scripting, hardware, klantencontact, ITIL.

C. Senioriteitsniveau (15 punten):
  Junior/starter = 13–15 | 1–3 jaar = 9–12 | 3–5 jaar = 5–8 | 5+ jaar/senior = 0–4

D. Harde disqualificaties (-10 pts elk, min. 0):
  - Rijbewijs vereist maar kandidaat heeft er geen
  - Specifieke diploma's ontbreken
  - Taalvereiste niet aanwezig in CV

============================
STAP 2 — MOTIVATIEBRIEF
============================
Schrijf een motivatiebrief die klinkt als een échte mens, niet als AI.

VOOR JE BEGINT — analyseer eerst de vacature grondig:
1. Wat zijn de 2-3 concrete taken/verantwoordelijkheden die het zwaarst wegen?
2. Welke tools, systemen of vaardigheden worden expliciet gevraagd?
3. Wat zegt de vacaturetekst over de cultuur of het team?
Verwerk deze antwoorden actief in de brief — niet als checklist maar als vloeiende context.

STRUCTUUR (3 alinea's, max 230 woorden, altijd in het NEDERLANDS):

Alinea 1 — Openingszin die direct inspeelt op iets specifieks uit DEZE vacature
(vermijd generieke openers zoals "Met veel interesse" of "Hierbij solliciteer ik").
Koppel daarna één concrete ervaring of project uit het CV aan wat het bedrijf nodig heeft.
Verklaar expliciet WAAROM die ervaring relevant is voor deze specifieke rol, niet alleen dát het relevant is.

Alinea 2 — Diepere aansluiting op de vacature-inhoud.
Pak 2 concrete eisen of verantwoordelijkheden rechtstreeks uit de vacaturetekst en toon hoe het CV daar direct op aansluit.
Gebruik de namen van tools/systemen zoals ze in de vacature staan (kopieer ze niet blind, maar toon dat je ze herkent).

Alinea 3 — Waarom dit bedrijf/team, niet een willekeurig ander.
Baseer dit op iets concreets uit de vacaturetekst (cultuur, missie, teamgrootte, sector).
Sluit af met één krachtige zin die uitnodigt tot gesprek — geen clichés.

ABSOLUUT VERBODEN in de hele brief:
"ik ben een harde werker" | "ik ben gemotiveerd" | "ik kijk ernaar uit" | "ik ben ervan overtuigd"
"passie voor" | "team player" | "ik ben leergierig" | "ik ben flexibel"
Elke zin die ook in een brief voor een ANDERE vacature zou kunnen staan.

Begin de brief ALTIJD met: "${greeting}\n\n"

============================
STAP 3 — SCORE BREAKDOWN
============================
Maak 3–4 bullets in het NEDERLANDS die uitleggen waarom de score is wat hij is.
Gebruik GEEN markdown, alleen platte tekstregels per bullet.
Voorbeelden:
"Functie-type match: IT helpdesk — 25/30 pts"
"Skill-overlap: 6 van 8 gevraagde skills gevonden — 28/40 pts"
"Senioriteit: vacature zoekt starter — 14/15 pts"

============================
OUTPUT — uitsluitend geldig JSON:
{
  "match_score": 85,
  "reasoning": "Één zin die de totale score samenvat met concrete redenen.",
  "cover_letter_draft": "${greeting}\n\n...",
  "resume_bullets_draft": [
    "Functie-type match: IT helpdesk — 25/30 pts",
    "Skill-overlap: 6 van 8 gevraagde skills gevonden — 28/40 pts",
    "Senioriteit: vacature zoekt starter — 14/15 pts"
  ]
}`;

  const response = await groqWithRetry(groq, {
    messages: [
      {
        role: 'system',
        content:
          'Je bent een carrièrecoach die uitsluitend geldige JSON teruggeeft. ' +
          'Schrijf motivatiebrieven die klinken als een echte, zelfverzekerde mens — nooit als AI-template. ' +
          'Gebruik gevarieerde zinslengte: wissel korte, directe zinnen af met iets langere. ' +
          'Vermijd herhaling van het woord "ik" aan het begin van opeenvolgende zinnen. ' +
          'Elke brief moet inhoudelijk reageren op de specifieke vacaturetekst, niet op de functietitel alleen. ' +
          'Geef nooit markdown of conversatietekst terug buiten het JSON-object.',
      },
      { role: 'user', content: prompt },
    ],
    model: GROQ_MODEL,
    response_format: { type: 'json_object' },
    // 0.72: hoger dan de vorige 0.6 (destijds verlaagd voor DeepSeek-R1 reasoning-stabiliteit).
    // llama-3.3-70b-versatile is een instructiemodel zonder chain-of-thought — hogere
    // temperature geeft meer creatieve variatie zonder JSON-betrouwbaarheid te schaden.
    temperature: 0.72,
    stream: false,
  });

  const raw = JSON.parse(response.choices[0]?.message?.content || '{}');
  return {
    match_score:          typeof raw.match_score === 'number'  ? raw.match_score          : 0,
    reasoning:            typeof raw.reasoning   === 'string'  ? raw.reasoning            : '',
    cover_letter_draft:   typeof raw.cover_letter_draft === 'string' ? raw.cover_letter_draft : '',
    resume_bullets_draft: Array.isArray(raw.resume_bullets_draft)    ? raw.resume_bullets_draft : [],
  };
}
