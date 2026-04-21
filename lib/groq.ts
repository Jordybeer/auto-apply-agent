import Groq from 'groq-sdk';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import { requireServerEnv } from '@/lib/env';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { locationBonus } from '@/lib/location-score';
import { slog } from '@/lib/logger';

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

export async function callGroq(
  payload: ChatCompletionCreateParamsNonStreaming,
  apiKey?: string,
): Promise<ChatCompletion> {
  const key = apiKey ?? requireServerEnv('GROQ_API_KEY');
  const groq = new Groq({ apiKey: key });
  return groqWithRetry(groq, payload);
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
      void slog.warn('groq', `Rate limit — retry ${attempt + 1}/${maxRetries} in ${wait}ms`, { attempt, wait });
      await sleep(wait);
    }
  }
  throw new GroqRateLimitError(lastErr);
}

function parseJsonLenient(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }
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

  const closingPatterns: [RegExp, string][] = [
    [/ik kijk (er)?naar uit[^.!?]*/gi,          'Graag vertel ik meer tijdens een gesprek'],
    [/kijk (er)?naar uit[^.!?]*/gi,             'Graag vertel ik meer tijdens een gesprek'],
    [/ik zie (er)?naar uit[^.!?]*/gi,           'Graag vertel ik meer tijdens een gesprek'],
    [/ik hoop (op|van harte)[^.!?]*/gi,         'Graag vertel ik meer tijdens een gesprek'],
    [/ik sta open voor[^.!?]*/gi,               'Wanneer kan ik langskomen'],
    [/aarzel niet[^.!?]*/gi,                    'Wanneer kan ik langskomen'],
  ];
  for (const [pattern, replacement] of closingPatterns) {
    out = out.replace(pattern, replacement);
  }

  const bannedFragments: [RegExp, string][] = [
    [/de combinatie van/gi,                          'De rol combineert'],
    [/trekt (mij|me) aan/gi,                         'past precies bij wat ik zoek'],
    [/trok (mij|me) aan/gi,                          'paste precies bij wat ik zocht'],
    [/(mij|me) aantrekt/gi,                          'precies bij mij past'],
    [/wat aantrekt/gi,                               'wat precies past'],
    [/spreekt (mij|me) aan/gi,                       'past precies bij wat ik zoek'],
    [/sprak (mij|me) aan/gi,                         'paste precies bij wat ik zocht'],
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

export interface ScoreResult {
  match_score: number;
  reasoning: string;
  resume_bullets_draft: string[];
}

export interface LetterResult {
  cover_letter_draft: string;
}

export type EvalResult = ScoreResult & LetterResult;

export interface CvStructuredInput {
  skills?: string[];
  tools?: string[];
  languages?: string[];
  experience_summary?: string;
  experience_years?: number | null;
  education?: string;
  job_titles?: string[];
}

function formatCvContext(cvText?: string, cvStructured?: CvStructuredInput | null): string {
  if (cvText) {
    return `CV van de kandidaat:\n<user_input>${sanitizePromptInput(cvText)}</user_input>`;
  }
  if (cvStructured && (cvStructured.skills?.length || cvStructured.experience_summary)) {
    const parts: string[] = [];
    if (cvStructured.job_titles?.length) parts.push(`Recente functies: ${cvStructured.job_titles.join(', ')}`);
    if (cvStructured.experience_years != null) parts.push(`Jaren ervaring: ${cvStructured.experience_years}`);
    if (cvStructured.experience_summary) parts.push(`Samenvatting: ${cvStructured.experience_summary}`);
    if (cvStructured.skills?.length) parts.push(`Vaardigheden: ${cvStructured.skills.join(', ')}`);
    if (cvStructured.tools?.length) parts.push(`Tools/software: ${cvStructured.tools.join(', ')}`);
    if (cvStructured.languages?.length) parts.push(`Talen: ${cvStructured.languages.join(', ')}`);
    if (cvStructured.education) parts.push(`Opleiding: ${cvStructured.education}`);
    return `Gestructureerd profiel van de kandidaat:\n${parts.join('\n')}`;
  }
  return 'Geen CV beschikbaar — beoordeel op basis van functietitel en vacaturetekst.';
}

function prepareJobContext(
  jobDescription: string,
  jobTitle: string,
  company: string,
  cvText?: string,
  keywords?: string,
  cvStructured?: CvStructuredInput | null,
) {
  const profileContext = formatCvContext(cvText, cvStructured);
  const descriptionTruncated = truncateAtSentence(
    sanitizePromptInput(jobDescription),
    MAX_DESCRIPTION_CHARS,
  );
  const targetRoles = sanitizePromptInput(keywords?.trim()) || 'niet opgegeven';
  const safeTitle   = sanitizePromptInput(jobTitle).slice(0, 200);
  const safeCompany = sanitizePromptInput(company).slice(0, 200);
  return { profileContext, descriptionTruncated, targetRoles, safeTitle, safeCompany };
}

export async function scoreJob(
  jobDescription: string,
  jobTitle: string,
  company: string,
  groqApiKey?: string,
  cvText?: string,
  keywords?: string,
  location?: string,
  cvStructured?: CvStructuredInput | null,
): Promise<ScoreResult> {
  const apiKey = groqApiKey ?? requireServerEnv('GROQ_API_KEY');
  const groq = new Groq({ apiKey });
  const ctx = prepareJobContext(jobDescription, jobTitle, company, cvText, keywords, cvStructured);

  const prompt = `=== KANDIDAATPROFIEL ===
Doelfuncties: ${ctx.targetRoles}
${ctx.profileContext}

=== VACATURE ===
Functietitel: ${ctx.safeTitle}
Bedrijf: ${ctx.safeCompany}
${ctx.descriptionTruncated}

=== MATCH SCORE (0–80, wordt geschaald naar 0–100) ===
Rubric — wees streng, meeste vacatures scoren 30–55:

A. Functie-match (35 pts): overlap vacature ↔ doelfuncties
  32–35 = bijna perfecte match | 22–31 = duidelijke overlap | 10–21 = gedeeltelijk | 0–9 = weinig/geen

B. Skill-overlap (25 pts): gevraagde tools/vaardigheden ↔ CV
  22–25 = 80%+ aanwezig | 16–21 = 60–79% | 9–15 = 40–59% | 0–8 = <40%

C. Ervaringsniveau (20 pts): gevraagd niveau ↔ CV-niveau
  17–20 = goed passend | 11–16 = enigszins | 0–10 = slecht passend

D. Disqualificaties: −10 per harde mismatch (rijbewijs vereist maar niet aanwezig, ontbrekend diploma/taalvereiste). Min. 0.

Locatie wordt APART berekend — NIET meenemen in de score.

=== OUTPUT (alleen JSON, geen markdown) ===
{
  "match_score": 48,
  "reasoning": "Één samenvattende zin met concrete redenen.",
  "resume_bullets_draft": [
    "Functie-match: gedeeltelijke overlap met doelprofiel — 20/35 pts",
    "Skill-overlap: 4 van 7 gevraagde tools aanwezig — 16/25 pts",
    "Ervaringsniveau: enigszins passend — 12/20 pts"
  ]
}`;

  const response = await groqWithRetry(groq, {
    messages: [
      { role: 'system', content: 'Je bent een strenge carrièrecoach. Geef uitsluitend geldige JSON terug. Geen markdown, geen uitleg buiten het JSON-object.' },
      { role: 'user', content: prompt },
    ],
    model: GROQ_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    stream: false,
  });

  const raw = parseJsonLenient(response.choices[0]?.message?.content || '{}');

  const llmScore = typeof raw.match_score === 'number' ? Math.max(0, Math.min(80, Math.round(raw.match_score))) : 0;
  const scaled = Math.round((llmScore / 80) * 100);
  const locBonus = locationBonus(location, jobDescription);
  const finalScore = Math.min(100, scaled + locBonus);

  const bullets: string[] = Array.isArray(raw.resume_bullets_draft)
    ? raw.resume_bullets_draft.filter((b: unknown): b is string => typeof b === 'string').map(b => stripMarkdown(b).trim())
    : [];
  if (locBonus > 0) {
    bullets.push(`Locatie-bonus: +${locBonus} pts (deterministische berekening)`);
  }

  return {
    match_score: finalScore,
    reasoning:   typeof raw.reasoning === 'string' ? stripMarkdown(raw.reasoning).trim() : '',
    resume_bullets_draft: bullets,
  };
}

export async function draftCoverLetter(
  jobDescription: string,
  jobTitle: string,
  company: string,
  groqApiKey?: string,
  cvText?: string,
  contactPerson?: string,
  keywords?: string,
  cvStructured?: CvStructuredInput | null,
): Promise<LetterResult> {
  const apiKey = groqApiKey ?? requireServerEnv('GROQ_API_KEY');
  const groq = new Groq({ apiKey });
  const ctx = prepareJobContext(jobDescription, jobTitle, company, cvText, keywords, cvStructured);

  const safeName = (contactPerson ?? '')
    .replace(/[^\p{L}\p{N} '\-\.]/gu, '')
    .trim()
    .slice(0, 80);
  const greeting = safeName ? `Beste ${safeName},` : `Beste HR-verantwoordelijke,`;

  const systemMessage =
    'Je bent een carrièrecoach. Geef uitsluitend geldige JSON terug. Geen markdown, geen uitleg buiten het JSON-object.\n\n' +
    'Cover letter regels (altijd Nederlands, max 150 woorden, 3 alinea\'s):\n' +
    'Alinea 1: begin NOOIT met "Ik" — open vanuit de vacature of klantcontext. Koppel in zin 2 een concrete werkervaring.\n' +
    'Alinea 2: elke zin = actie + tool/skill + resultaat. Nooit een eigenschap of opsomming.\n' +
    'Alinea 3 zin 1: begin met een aspect van de rol (niet "Ik" of bedrijfsnaam). Formaat: "[aspect] — [waarom dat past, max 8 woorden]." ' +
    'Zin 2: directe uitnodiging, opties: "Wanneer kan ik langskomen?" / "Graag vertel ik meer tijdens een gesprek."\n\n' +
    'Absoluut verboden in de brief: kijk ernaar uit, zie ernaar uit, ik hoop, de combinatie van, spreekt mij aan, trekt mij aan, aantrekt, ' +
    'mijn ervaring met, mijn vaardigheden in, heeft me laten zien, Bovendien/Tevens/Daarnaast als eerste woord, Met veel interesse, Hierbij solliciteer ik.\n\n' +
    'Schrijfstijl: compact voor e-mail, afwisselende zinslengtes, nooit twee opeenvolgende zinnen die beginnen met "Ik".';

  const prompt = `=== KANDIDAATPROFIEL ===
Doelfuncties: ${ctx.targetRoles}
${ctx.profileContext}

=== VACATURE ===
Functietitel: ${ctx.safeTitle}
Bedrijf: ${ctx.safeCompany}
${ctx.descriptionTruncated}

=== MOTIVATIEBRIEF ===
Schrijf de brief. Begin met: "${greeting}\\n\\n"
Analyseer eerst de vacature: wat zijn de 2–3 zwaarste taken, welke tools worden expliciet gevraagd, wat zegt de tekst over het team? Verwerk dit actief.

=== OUTPUT (alleen JSON) ===
{
  "cover_letter_draft": "${greeting}\\n\\n..."
}`;

  const response = await groqWithRetry(groq, {
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt },
    ],
    model: GROQ_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.5,
    stream: false,
  });

  const raw = parseJsonLenient(response.choices[0]?.message?.content || '{}');

  return {
    cover_letter_draft: typeof raw.cover_letter_draft === 'string'
      ? normalizeParagraphs(stripMarkdown(filterCoverLetter(raw.cover_letter_draft as string)))
      : '',
  };
}

export async function evaluateJob(
  jobDescription: string,
  jobTitle: string,
  company: string,
  groqApiKey?: string,
  cvText?: string,
  contactPerson?: string,
  keywords?: string,
  _city?: string,
): Promise<EvalResult> {
  const score = await scoreJob(jobDescription, jobTitle, company, groqApiKey, cvText, keywords);
  const letter = await draftCoverLetter(jobDescription, jobTitle, company, groqApiKey, cvText, contactPerson, keywords);
  return { ...score, ...letter };
}
