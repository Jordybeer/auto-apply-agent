import Groq from 'groq-sdk';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import { requireServerEnv } from '@/lib/env';

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

export function hasRemoteWork(description: string): boolean {
  const lower = description.toLowerCase();
  const patterns = [
    'thuiswerk', 'thuis werken', 'thuiswerken',
    'telewerk', 'tele-werk', 'telewerken',
    'hybride werk', 'hybride werken', 'hybride functie',
    'remote', 'volledig remote', 'deels remote',
    'werk vanuit huis', 'werken vanuit huis',
    'flexibel werken', 'flexibele werkplek',
    'work from home', 'working from home', 'wfh',
    'remote work', 'remote working', 'fully remote',
    'hybrid work', 'hybrid working', 'hybrid role',
    'home office', 'flexible working',
    'télétravail', 'travail à distance', 'travail hybride',
  ];
  return patterns.some((p) => lower.includes(p));
}

/**
 * Strips markdown formatting from a plain-text string.
 * Groq occasionally emits bold/italic/bullet syntax inside JSON string values.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')   // **bold**
    .replace(/\*(.+?)\*/gs, '$1')        // *italic*
    .replace(/^#{1,6}\s+/gm, '')         // ## headings
    .replace(/^[-*+]\s+/gm, '')          // - bullet points
    .replace(/^>\s*/gm, '')              // > blockquotes
    .replace(/`([^`]+)`/g, '$1');        // `inline code`
}

/**
 * Normalises paragraph structure:
 * - Collapses hard-wrapped single newlines within a paragraph into spaces
 * - Ensures exactly one blank line between paragraphs
 */
function normalizeParagraphs(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^[ \t]+/gm, '')
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/**
 * Post-processing filter: scans the generated cover letter and replaces
 * known AI-cliché sentence endings / closings that slip through the prompt.
 * This is a safety net — the prompt should prevent them, but this catches
 * any variants the model generates by paraphrasing.
 */
function filterCoverLetter(letter: string): string {
  let out = letter;

  // Forbidden closing variants — replace with neutral direct invite
  const closingPatterns: [RegExp, string][] = [
    [/ik kijk (er)?naar uit[^.!?]*/gi,          'Graag vertel ik meer tijdens een gesprek'],
    [/kijk (er)?naar uit[^.!?]*/gi,             'Graag vertel ik meer tijdens een gesprek'],
    [/ik zie (er)?naar uit[^.!?]*/gi,           'Graag vertel ik meer tijdens een gesprek'],
    [/ik hoop (op|van harte)[^.!?]*/gi,         'Graag vertel ik meer tijdens een gesprek'],
    [/ik sta open voor[^.!?]*/gi,               'Wanneer kan ik langskomen'],
    [/aarzel niet[^.!?]*/gi,                    'Wanneer kan ik langskomen'],
    [/niet te zögern[^.!?]*/gi,                 'Wanneer kan ik langskomen'],
  ];
  for (const [pattern, replacement] of closingPatterns) {
    out = out.replace(pattern, replacement);
  }

  // Forbidden phrase fragments — these should not appear anywhere
  // NOTE: order matters — more specific patterns first
  const bannedFragments: [RegExp, string][] = [
    [/de combinatie van/gi,                          'De rol combineert'],
    // "aantrekt" variants: "trekt mij/me aan", "wat me/mij aantrekt", "wat aantrekt"
    [/trekt (mij|me) aan/gi,                         'past precies bij wat ik zoek'],
    [/trok (mij|me) aan/gi,                          'paste precies bij wat ik zocht'],
    [/(mij|me) aantrekt/gi,                          'precies bij mij past'],
    [/wat aantrekt/gi,                               'wat precies past'],
    // "spreekt aan" variants
    [/spreekt (mij|me) aan/gi,                       'past precies bij wat ik zoek'],
    [/sprak (mij|me) aan/gi,                         'paste precies bij wat ik zocht'],
    // legacy single-word forms kept for safety
    [/spreekt mij aan/gi,                            'past precies bij wat ik zoek'],
    [/trekt mij aan/gi,                              'past precies bij wat ik zoek'],
    [/trok mij aan/gi,                               'paste precies bij wat ik zocht'],
    [/mijn ervaring met/gi,                          'Vanuit mijn werk bij'],
    [/mijn vaardigheden in/gi,                       'Vanuit mijn werk bij'],
    [/heeft me laten zien hoe belangrijk/gi,         'leerde mij concreet'],
    [/heeft mij laten zien hoe belangrijk/gi,        'leerde mij concreet'],
  ];
  for (const [pattern, replacement] of bannedFragments) {
    out = out.replace(pattern, replacement);
  }

  return out;
}

export async function evaluateJob(
  jobDescription: string,
  jobTitle: string,
  company: string,
  groqApiKey?: string,
  cvText?: string,
  contactPerson?: string,
  keywords?: string,
  city?: string,
) {
  const apiKey = groqApiKey ?? requireServerEnv('GROQ_API_KEY');
  const groq = new Groq({ apiKey });

  const profileContext = cvText
    ? `CV van de kandidaat:\n${cvText}`
    : `Geen CV beschikbaar — beoordeel op basis van functietitel en vacaturetekst.`;

  const descriptionTruncated = truncateAtSentence(jobDescription, MAX_DESCRIPTION_CHARS);
  const wfhDetected = hasRemoteWork(jobDescription);

  const safeName = (contactPerson ?? '')
    .replace(/[^\p{L}\p{N} '\-\.]/gu, '')
    .trim()
    .slice(0, 80);
  const greeting = safeName ? `Beste ${safeName},` : `Beste HR-verantwoordelijke,`;

  const targetRoles = keywords?.trim() || 'niet opgegeven';
  const targetCity  = city?.trim()     || 'niet opgegeven';

  const wfhNote = wfhDetected
    ? 'OPMERKING: deze vacature vermeldt EXPLICIET thuiswerk / remote / hybride werken.'
    : '';
  const wfhBonusLine = wfhDetected
    ? '→ Deze vacature HEEFT thuiswerk/remote/hybride vermeld — voeg +5 pts toe aan Locatie.'
    : '→ Deze vacature vermeldt GEEN thuiswerk/remote/hybride.';
  const wfhReasoningBullet = wfhDetected
    ? '"Locatie-bonus: remote/hybride vermeld — +5 pts"'
    : '';

  const prompt = `
Je bent een ervaren carrièrecoach die een eerlijke match-score berekent en een persoonlijke sollicitatiebrief schrijft.
Je schrijft alsof je de kandidaat bent — direct, zelfverzekerd, menselijk. Schrijf voor e-mail: compact, geen lange lappen tekst.

=== KANDIDAATPROFIEL ===
Doelfuncties / zoekwoorden: ${targetRoles}
Voorkeurslocatie: ${targetCity}
${profileContext}

=== VACATURE ===
Functietitel: ${jobTitle}
Bedrijf: ${company}
${wfhNote ? wfhNote + '\n' : ''}Vacaturetekst:
${descriptionTruncated}

============================
STAP 1 — MATCH SCORE (0-100)
============================
Bereken een eerlijke match_score. Wees streng en realistisch — de meeste vacatures scoren 40-70.

INTERPRETATIE:
- 85–100: uitzonderlijk sterke match
- 70–84: duidelijke match met kleine hiaten
- 50–69: gemiddeld passend
- 30–49: zwakke match
- 0–29: vrijwel geen match

RUBRIC (totaal 100 punten):

A. Functie-match met doelprofiel (35 punten):
  Vergelijk de vacature met de doelfuncties/zoekwoorden van de kandidaat.
  Sterke overlap = 28–35 | Gedeeltelijke overlap = 15–27 | Weinig overlap = 5–14 | Geen match = 0–4

B. Skill-overlap (35 punten):
  Vergelijk expliciet gevraagde vaardigheden/tools met het CV.
  80%+ match = 28–35 | 60–79% = 20–27 | 40–59% = 12–19 | <40% = 0–11

C. Ervaringsniveau (15 punten):
  Past het gevraagde niveau bij het CV? Goed passend = 12–15 | Enigszins = 7–11 | Slecht passend = 0–6

D. Locatie (15 punten):
  Vergelijk vacaturelocatie met voorkeurslocatie van kandidaat.
  In/nabij voorkeurslocatie = 12–15 | Elders in regio = 6–11 | Ver of onduidelijk = 0–5
  ${wfhBonusLine}

E. Harde disqualificaties (-10 pts elk, min. 0):
  - Vereist rijbewijs maar kandidaat heeft er geen
  - Ontbrekende diploma's of taalvereisten

============================
STAP 2 — MOTIVATIEBRIEF
============================
Schrijf een motivatiebrief die klinkt als een échte mens, niet als AI.
Max 150 woorden. Elke alinea max 2-3 zinnen.

VOOR JE BEGINT — analyseer eerst de vacature grondig:
1. Wat zijn de 2-3 concrete taken/verantwoordelijkheden die het zwaarst wegen?
2. Welke tools, systemen of vaardigheden worden expliciet gevraagd?
3. Wat zegt de vacaturetekst over de sector of het team?
Verwerk deze antwoorden actief in de brief — niet als checklist maar als vloeiende context.

STRUCTUUR (3 korte alinea's, max 150 woorden totaal, altijd in het NEDERLANDS):

--- ALINEA 1 ---
Begin NOOIT met het woord "Ik".
Open met één concrete observatie over de vacature of het bedrijf — niet over jezelf.
Zin 2: koppel direct één specifieke werkervaring uit het CV aan die observatie.
Zin 3 (optioneel): leg uit wat die ervaring concreet opleverde — geen "dit maakt mij geschikt" maar een resultaat of context.

FOUT: "Mijn ervaring als Software Support Engineer heeft me laten zien hoe belangrijk het is om..."
GOED: "Technische problemen oplossen terwijl garagisten op hun software wachten — bij Carfac was dit dagelijkse realiteit."

--- ALINEA 2 ---
ELKE ZIN = een actie die je uitvoerde + de tool/skill + het resultaat of de context.
Geen eigenschappen, geen opsommingen.

FOUT: "Ik heb ervaring met Jira en ServiceNow."
GOED: "Bij Microsoft verwerkte ik 30+ tickets per dag via ServiceNow en schreef ik reproductiestappen voor het dev-team."

--- ALINEA 3 ---
Zin 1: Noem één specifiek aspect van DEZE rol of sector dat jou aanspreekt, vanuit de vacaturetekst.
  Begin met het aspect zelf, NIET met "Ik" of met de bedrijfsnaam.
  Formaat: "[Aspect uit de vacature] — [waarom dat jou past in max 8 woorden]."
Zin 2: Directe uitnodiging tot gesprek. Geen "ik kijk ernaar uit", geen "ik hoop".
  Opties: "Wanneer kan ik langskomen?" / "Graag vertel ik meer tijdens een gesprek." / "Mag ik u bellen om een moment in te plannen?"

ABSOLUUT VERBODEN overal in de brief:
✗ "ik kijk (er)naar uit" / "ik zie ernaar uit" / "kijk uit naar"
✗ "ik hoop" / "ik ben ervan overtuigd" / "ik geloof dat"
✗ "de combinatie van" / "spreekt mij aan" / "spreekt me aan" / "trekt mij aan" / "trekt me aan" / "aantrekt"
✗ "mijn ervaring met" / "mijn vaardigheden in" / "mijn achtergrond in"
✗ "heb ik ervaring opgedaan" / "heb ik gewerkt met" / "ben ik vertrouwd met"
✗ "heeft me laten zien hoe belangrijk" / "maakt mij een goede kandidaat"
✗ "Bovendien" / "Tevens" / "Daarnaast" als eerste woord
✗ "Met veel interesse" / "Hierbij solliciteer ik" / "Graag stel ik mezelf voor"

Begin de brief ALTIJD met: "${greeting}\n\n"

============================
STAP 3 — SCORE BREAKDOWN
============================
Maak 3–5 bullets in het NEDERLANDS die uitleggen waarom de score is wat hij is.
Gebruik GEEN markdown, alleen platte tekstregels per bullet.
Voorbeeld formaat: "Functie-match: sterke overlap met doelprofiel — 30/35 pts"
${wfhReasoningBullet ? wfhReasoningBullet + '\n' : ''}
============================
OUTPUT — uitsluitend geldig JSON:
{
  "match_score": 72,
  "reasoning": "Één zin die de totale score samenvat met concrete redenen.",
  "cover_letter_draft": "${greeting}\n\n...",
  "resume_bullets_draft": [
    "Functie-match: sterke overlap met doelprofiel — 30/35 pts",
    "Skill-overlap: 7 van 9 gevraagde tools aanwezig in CV — 27/35 pts",
    "Ervaringsniveau: past goed bij gevraagd profiel — 13/15 pts",
    "Locatie: vacature in voorkeursregio — 12/15 pts"
  ]
}`;

  const response = await groqWithRetry(groq, {
    messages: [
      {
        role: 'system',
        content:
          'Je bent een carrièrecoach die uitsluitend geldige JSON teruggeeft. ' +
          'Schrijf motivatiebrieven die klinken als een echte, zelfverzekerde mens — nooit als AI-template. ' +
          'Schrijf compact voor e-mail: max 150 woorden, korte zinnen, geen academische constructies. ' +
          'Wissel zinslengte af: sommige zinnen zijn kort en direct, andere iets langer met context. ' +
          'Vermijd herhaling van "ik" aan het begin van opeenvolgende zinnen. ' +
          'Alinea 1 begint NOOIT met "Ik" — start vanuit de vacature of de situatie van de eindgebruiker. ' +
          'Alinea 2: elke zin = actie + tool + resultaat/context. Nooit een eigenschap of opsomming. ' +
          'Alinea 3 zin 1: begin met een aspect van de rol, NIET met de bedrijfsnaam of "Ik". ' +
          'Alinea 3 zin 2: directe uitnodiging — "Wanneer kan ik langskomen?" of vergelijkbaar. ' +
          'Verboden sluitingen: "ik kijk ernaar uit", "kijk uit naar", "ik zie ernaar uit", "ik hoop". ' +
          'Verboden overal: "aantrekt", "trekt mij aan", "trekt me aan", "spreekt mij aan", "spreekt me aan", ' +
          '"de combinatie van", "mijn ervaring met", "heeft me laten zien". ' +
          'Geef nooit markdown of conversatietekst terug buiten het JSON-object.',
      },
      { role: 'user', content: prompt },
    ],
    model: GROQ_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.45,
    stream: false,
  });

  const raw = JSON.parse(response.choices[0]?.message?.content || '{}');

  const coverLetter = typeof raw.cover_letter_draft === 'string'
    ? normalizeParagraphs(stripMarkdown(filterCoverLetter(raw.cover_letter_draft)))
    : '';

  const bullets = Array.isArray(raw.resume_bullets_draft)
    ? raw.resume_bullets_draft.map((b: unknown) =>
        typeof b === 'string' ? stripMarkdown(b).trim() : b
      )
    : [];

  return {
    match_score:          typeof raw.match_score === 'number'  ? raw.match_score          : 0,
    reasoning:            typeof raw.reasoning   === 'string'  ? stripMarkdown(raw.reasoning).trim() : '',
    cover_letter_draft:   coverLetter,
    resume_bullets_draft: bullets,
  };
}
