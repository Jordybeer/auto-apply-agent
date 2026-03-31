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

export function requiresDriverLicense(description: string): boolean {
  const lower = description.toLowerCase();
  const patterns = [
    'rijbewijs', 'rijbewijs b', 'geldig rijbewijs',
    "driver's license", 'driver license', 'driving license',
    'permis de conduire', 'f\u00fchrerschein',
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
    : `Geen CV beschikbaar \u2014 gebruik algemene IT support / helpdesk criteria.`;

  const descriptionTruncated = jobDescription.slice(0, MAX_DESCRIPTION_CHARS);
  const greeting = contactPerson ? `Beste ${contactPerson},` : `Beste HR-verantwoordelijke,`;

  const prompt = `
Je bent een ervaren carri\u00e8recoach die een echte, persoonlijke sollicitatiebrief schrijft voor een specifieke vacature.
Je schrijft alsof je de kandidaat bent \u2014 direct, zelfverzekerd, menselijk.

=== VACATURE ===
Functietitel: ${jobTitle}
Bedrijf: ${company}
Vacaturetekst:
${descriptionTruncated}

=== KANDIDAAT ===
${profileContext}

============================
STAP 1 \u2014 MATCH SCORE (0-100)
============================
Bereken een eerlijke match_score op basis van onderstaande rubric. Wees streng en realistisch.

INTERPRETATIE:
- 85\u2013100: uitzonderlijk sterke match (top 10%)
- 70\u201384: duidelijke match met kleine hiaten
- 50\u201369: gemiddeld passend
- 30\u201349: zwakke match
- 0\u201329: vrijwel geen match

RUBRIC (totaal 100 punten):

A. Functie-type match (30 punten):
  - IT helpdesk / servicedesk / support / applicatiebeheer = 22\u201330 pts
  - Gemengde IT-rol (deels support, deels dev) = 12\u201321 pts
  - Pure software development / backend / devops = 0\u201310 pts
  - Niet-IT functie = 0 pts
  BONUS: thuiswerk / remote / hybride vermeld in vacature: +3 pts

B. Skill-overlap (40 punten):
  Vergelijk vacature-eisen met CV-vaardigheden.
  8+ matchen = 34\u201340 | 5\u20137 = 24\u201333 | 3\u20134 = 14\u201323 | 1\u20132 = 4\u201313 | 0 = 0\u20133
  Relevante skills: ticketsystemen (Jira, ServiceNow, Zendesk), Windows/Linux, netwerken, Active Directory, scripting, hardware, klantencontact, ITIL.

C. Senioriteitsniveau (15 punten):
  Junior/starter = 13\u201315 | 1\u20133 jaar = 9\u201312 | 3\u20135 jaar = 5\u20138 | 5+ jaar/senior = 0\u20134

D. Harde disqualificaties (-10 pts elk, min. 0):
  - Rijbewijs vereist maar kandidaat heeft er geen
  - Specifieke diploma's ontbreken
  - Taalvereiste niet aanwezig in CV

============================
STAP 2 \u2014 MOTIVATIEBRIEF
============================
Schrijf een motivatiebrief die klinkt als een \u00e9chte mens, niet als AI.

VOOR JE BEGINT \u2014 analyseer eerst de vacature grondig:
1. Wat zijn de 2-3 concrete taken/verantwoordelijkheden die het zwaarst wegen?
2. Welke tools, systemen of vaardigheden worden expliciet gevraagd?
3. Wat zegt de vacaturetekst over de cultuur of het team?
Verwerk deze antwoorden actief in de brief \u2014 niet als checklist maar als vloeiende context.

STRUCTUUR (3 alinea's, max 230 woorden, altijd in het NEDERLANDS):

Alinea 1 \u2014 Openingszin die direct inspeelt op iets specifieks uit DEZE vacature
(vermijd generieke openers zoals "Met veel interesse" of "Hierbij solliciteer ik").
Koppel daarna \u00e9\u00e9n concrete ervaring of project uit het CV aan wat het bedrijf nodig heeft.
Verklaar expliciet WAAROM die ervaring relevant is voor deze specifieke rol, niet alleen d\u00e1t het relevant is.

Alinea 2 \u2014 Diepere aansluiting op de vacature-inhoud.
Pak 2 concrete eisen of verantwoordelijkheden rechtstreeks uit de vacaturetekst en toon hoe het CV daar direct op aansluit.
Gebruik de namen van tools/systemen zoals ze in de vacature staan (kopieer ze niet blind, maar toon dat je ze herkent).

Alinea 3 \u2014 Waarom dit bedrijf/team, niet een willekeurig ander.
Baseer dit op iets concreets uit de vacaturetekst (cultuur, missie, teamgrootte, sector).
Sluit af met \u00e9\u00e9n krachtige zin die uitnodigt tot gesprek \u2014 geen clich\u00e9s.

ABSOLUUT VERBODEN in de hele brief:
"ik ben een harde werker" | "ik ben gemotiveerd" | "ik kijk ernaar uit" | "ik ben ervan overtuigd"
"passie voor" | "team player" | "ik ben leergierig" | "ik ben flexibel"
Elke zin die ook in een brief voor een ANDERE vacature zou kunnen staan.

Begin de brief ALTIJD met: "${greeting}\\n\\n"

============================
STAP 3 \u2014 SCORE BREAKDOWN
============================
Maak 3\u20134 bullets in het NEDERLANDS die uitleggen waarom de score is wat hij is.
Gebruik GEEN markdown, alleen platte tekstregels per bullet.
Voorbeelden:
"Functie-type match: IT helpdesk \u2014 25/30 pts"
"Skill-overlap: 6 van 8 gevraagde skills gevonden \u2014 28/40 pts"
"Senioriteit: vacature zoekt starter \u2014 14/15 pts"

============================
OUTPUT \u2014 uitsluitend geldig JSON:
{
  "match_score": 85,
  "reasoning": "\u00c9\u00e9n zin die de totale score samenvat met concrete redenen.",
  "cover_letter_draft": "${greeting}\\n\\n...",
  "resume_bullets_draft": [
    "Functie-type match: IT helpdesk \u2014 25/30 pts",
    "Skill-overlap: 6 van 8 gevraagde skills gevonden \u2014 28/40 pts",
    "Senioriteit: vacature zoekt starter \u2014 14/15 pts"
  ]
}`;

  const response = await groqWithRetry(groq, {
    messages: [
      {
        role: 'system',
        content:
          'Je bent een carri\u00e8recoach die uitsluitend geldige JSON teruggeeft. ' +
          'Schrijf motivatiebrieven die klinken als een echte, zelfverzekerde mens \u2014 nooit als AI-template. ' +
          'Elke brief moet inhoudelijk reageren op de specifieke vacaturetekst, niet op de functietitel alleen. ' +
          'Geef nooit markdown of conversatietekst terug buiten het JSON-object.',
      },
      { role: 'user', content: prompt },
    ],
    model: 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' },
    temperature: 0.72,
    stream: false,
  });

  // fix: validate response shape so callers always receive the correct types,
  // preventing silent DB writes with wrong column types when Groq returns partial JSON
  const raw = JSON.parse(response.choices[0]?.message?.content || '{}');
  return {
    match_score:          typeof raw.match_score === 'number'  ? raw.match_score          : 0,
    reasoning:            typeof raw.reasoning   === 'string'  ? raw.reasoning            : '',
    cover_letter_draft:   typeof raw.cover_letter_draft === 'string' ? raw.cover_letter_draft : '',
    resume_bullets_draft: Array.isArray(raw.resume_bullets_draft)    ? raw.resume_bullets_draft : [],
  };
}
