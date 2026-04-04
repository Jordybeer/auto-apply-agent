import Groq from 'groq-sdk';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import { requireServerEnv } from '@/lib/env';

// llama-3.3-70b-versatile: replaces decommissioned deepseek-r1-distill-llama-70b.
export const GROQ_MODEL = 'llama-3.3-70b-versatile';

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

export class GroqRateLimitError extends Error {
  constructor(cause?: unknown) {
    super('Groq rate limit bereikt. Probeer het over enkele seconden opnieuw.');
    this.name = 'GroqRateLimitError';
    if (cause) this.cause = cause;
  }
}

export class GroqAuthError extends Error {
  constructor(cause?: unknown) {
    super('Ongeldige Groq API-sleutel. Controleer je sleutel via Instellingen.');
    this.name = 'GroqAuthError';
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

function is401(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  const status  = e['status'];
  const message = typeof e['message'] === 'string' ? e['message'] : '';
  return (
    status === 401 ||
    message.includes('401') ||
    message.toLowerCase().includes('invalid api key') ||
    message.toLowerCase().includes('authentication') ||
    message.toLowerCase().includes('unauthorized')
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
      if (is401(err)) throw new GroqAuthError(err);
      if (!is429(err)) throw err;
      const wait = 2000 * Math.pow(2, attempt);
      console.warn(`Groq rate limit — retry ${attempt + 1}/${maxRetries} in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new GroqRateLimitError(lastErr);
}

const MAX_DESCRIPTION_CHARS = 6000;

/**
 * Truncate at the last sentence boundary before the char limit
 * to avoid cutting mid-sentence and confusing the model.
 */
function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('.\n'),
  );
  return lastEnd > maxChars * 0.6 ? slice.slice(0, lastEnd + 1) : slice;
}

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

/**
 * Returns true when the vacancy explicitly mentions remote / WFH / hybrid work.
 * Used to inject a pre-check hint into the prompt so the model awards the bonus reliably.
 */
export function hasRemoteWork(description: string): boolean {
  const lower = description.toLowerCase();
  const patterns = [
    // Dutch
    'thuiswerk', 'thuis werken', 'thuiswerken',
    'telewerk', 'tele-werk', 'telewerken',
    'hybride werk', 'hybride werken', 'hybride functie',
    'remote', 'volledig remote', 'deels remote',
    'werk vanuit huis', 'werken vanuit huis',
    'flexibel werken', 'flexibele werkplek',
    // English
    'work from home', 'working from home', 'wfh',
    'remote work', 'remote working', 'fully remote',
    'hybrid work', 'hybrid working', 'hybrid role',
    'home office', 'flexible working',
    // French
    'télétravail', 'travail à distance', 'travail hybride',
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
  // Prefer caller-supplied key (user's own key stored in DB), fall back to server env var.
  const apiKey = groqApiKey ?? requireServerEnv('GROQ_API_KEY');

  const groq = new Groq({ apiKey });

  const profileContext = cvText
    ? `CV van de kandidaat:\n${cvText}`
    : `Geen CV beschikbaar — gebruik algemene IT support / helpdesk criteria.`;

  const descriptionTruncated = truncateAtSentence(jobDescription, MAX_DESCRIPTION_CHARS);

  // Pre-detect WFH so we can tell the model explicitly — prevents it from missing
  // subtle phrasings and ensures the bonus is awarded consistently.
  const wfhDetected = hasRemoteWork(jobDescription);

  const safeName = (contactPerson ?? '')
    .replace(/[^\p{L}\p{N} '\-\.]/gu, '')
    .trim()
    .slice(0, 80);
  const greeting = safeName ? `Beste ${safeName},` : `Beste HR-verantwoordelijke,`;

  const wfhNote = wfhDetected
    ? 'OPMERKING: deze vacature vermeldt EXPLICIET thuiswerk / remote / hybride werken.'
    : '';
  const wfhBonusLine = wfhDetected
    ? '\u2192 Deze vacature HEEFT thuiswerk/remote/hybride vermeld \u2014 voeg +5 pts toe.'
    : '\u2192 Deze vacature vermeldt GEEN thuiswerk/remote/hybride \u2014 bonus NIET toekennen.';
  const wfhReasoningBullet = wfhDetected
    ? '"Thuiswerk-bonus: remote/hybride vermeld \u2014 +5 pts"'
    : '';

  const prompt = `
Je bent een ervaren carrièrecoach die een echte, persoonlijke sollicitatiebrief schrijft voor een specifieke vacature.
Je schrijft alsof je de kandidaat bent — direct, zelfverzekerd, menselijk. Schrijf voor e-mail: compact, geen lange lappen tekst.

=== VACATURE ===
Functietitel: ${jobTitle}
Bedrijf: ${company}
${wfhNote ? wfhNote + '\n' : ''}Vacaturetekst:
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
  BONUS thuiswerk/remote/hybride: +5 pts indien de vacature dit expliciet vermeldt.
  ${wfhBonusLine}

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
Max 150 woorden. Elke alinea max 2-3 zinnen. Geen lange academische constructies.

VOOR JE BEGINT — analyseer eerst de vacature grondig:
1. Wat zijn de 2-3 concrete taken/verantwoordelijkheden die het zwaarst wegen?
2. Welke tools, systemen of vaardigheden worden expliciet gevraagd?
3. Wat zegt de vacaturetekst over de cultuur of het team?
Verwerk deze antwoorden actief in de brief — niet als checklist maar als vloeiende context.

STRUCTUUR (3 korte alinea's, max 150 woorden totaal, altijd in het NEDERLANDS):

Alinea 1 — Haak + jouw sterkste relevante ervaring (2-3 zinnen).
Begin NOOIT met het woord "Ik". Open met iets specifieks uit DEZE vacature of het bedrijf.
Koppel direct één concrete ervaring uit het CV aan wat het bedrijf nodig heeft.
Verklaar WAAROM die ervaring relevant is, niet alleen dát het relevant is.

Alinea 2 — Twee concrete skills/tools exact zoals ze in de vacaturetekst staan (2-3 zinnen).
SCHRIJF GEEN OPSOMMING. Geen "vaardigheden in X en Y" of "ervaring met X en Y".
Schrijf in plaats daarvan een zin als: "Bij [bedrijf uit CV] loste ik dagelijks [concreet probleem] op via [tool uit vacature]."
De tool/skill moet voorkomen in een actieve zin die beschrijft WAT je ermee deed, niet dat je het hebt.

Alinea 3 — Waarom dit bedrijf of deze rol specifiek + uitnodiging tot gesprek (max 2 zinnen).
Baseer op iets concreets uit de vacaturetekst: de sector, het team, een specifieke verantwoordelijkheid.
Geen generieke afsluiting. De tweede zin is een directe, korte uitnodiging tot gesprek — geen "ik kijk ernaar uit".

ABSOLUUT VERBODEN in de hele brief:
"ik ben een harde werker" | "ik ben gemotiveerd" | "ik kijk ernaar uit" | "ik ben ervan overtuigd"
"passie voor" | "team player" | "ik ben leergierig" | "ik ben flexibel"
"Bovendien" | "Tevens" | "Daarnaast" als eerste woord van een zin
"Met veel interesse" | "Hierbij solliciteer ik" | "Graag stel ik mezelf voor"
"zoals blijkt uit" | "dit stelt mij in staat" | "mijn achtergrond in"
"ik heb de afgelopen jaren" | "een gedreven professional" | "dit sluit naadloos aan"
"mijn vaardigheden in" | "mijn ervaring met" | "maken mij een goede fit"
"een sterke kandidaat" | "ik nodig u uit" | "ik geloof dat"
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
${wfhReasoningBullet ? wfhReasoningBullet + '\n' : ''}
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
          'Schrijf compact voor e-mail: korte zinnen, geen academische constructies, max 150 woorden. ' +
          'Gebruik gevarieerde zinslengte: wissel korte, directe zinnen af met iets langere. ' +
          'Vermijd herhaling van het woord "ik" aan het begin van opeenvolgende zinnen. ' +
          'Begin alinea 1 nooit met "Ik" — kies een zin die start vanuit de vacature of het bedrijf. ' +
          'Alinea 2 bevat NOOIT een opsomming van vaardigheden — beschrijf altijd een concrete actie met de tool. ' +
          'Alinea 3 is specifiek voor dit bedrijf of deze rol — geen generieke afsluitingszinnen. ' +
          'Vermijd robotachtige verbindingswoorden zoals "Bovendien", "Tevens" en "Daarnaast" als zinopener. ' +
          'Elke brief moet inhoudelijk reageren op de specifieke vacaturetekst, niet op de functietitel alleen. ' +
          'Geef nooit markdown of conversatietekst terug buiten het JSON-object.',
      },
      { role: 'user', content: prompt },
    ],
    model: GROQ_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.82,
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
