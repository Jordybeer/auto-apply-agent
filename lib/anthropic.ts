import Anthropic from '@anthropic-ai/sdk';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { slog } from '@/lib/logger';
import { buildModePromptContext } from '@/lib/search-mode';
import type { SearchMode, StudentJobPrefs, PivotPrefs } from '@/lib/search-mode';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export interface CvStructuredInput {
  skills?: string[];
  tools?: string[];
  languages?: string[];
  experience_summary?: string;
  experience_years?: number | null;
  education?: string;
  job_titles?: string[];
}

export type EvalResult = {
  match_score: number;
  reasoning: string;
  cover_letter_draft: string;
  resume_bullets_draft: string[];
};

const HAIKU  = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

function logTokens(model: string, usage: Anthropic.Usage, userId?: string) {
  const inputTokens  = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const extra = usage as unknown as Record<string, unknown>;
  const cacheCreation = (extra.cache_creation_input_tokens as number) ?? 0;
  const cacheRead     = (extra.cache_read_input_tokens     as number) ?? 0;

  void slog.debug('llm_usage', 'Token usage', {
    model,
    input_tokens:                inputTokens,
    output_tokens:               outputTokens,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens:     cacheRead,
  }, userId);

  const logger = (globalThis as Record<string, unknown>).__posthogLogger as {
    emit: (log: Record<string, unknown>) => void;
  } | undefined;

  logger?.emit({
    severityNumber: SeverityNumber.INFO,
    severityText: 'INFO',
    body: 'LLM call',
    attributes: {
      'llm.model':         model,
      'llm.input_tokens':  inputTokens,
      'llm.output_tokens': outputTokens,
      'llm.cache_creation_tokens': cacheCreation,
      'llm.cache_read_tokens':     cacheRead,
      'llm.user_id':       userId ?? 'anonymous',
      'service.name':      'jobtide',
    },
  });
}

export async function scoreJobPremium(params: {
  jobDescription: string;
  cvText: string;
  keywords: string[];
  location: string;
  userId?: string;
  searchMode?: SearchMode;
  studentJobPrefs?: StudentJobPrefs | null;
  pivotPrefs?: PivotPrefs | null;
}): Promise<{ score: number; reasoning: string }> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const systemPrompt = `Je bent een Belgische HR-expert. Beoordeel hoe goed een kandidaat past bij een vacature op schaal 0-100. Antwoord ALLEEN met JSON: {"score": number, "reasoning": "string (max 80 woorden)"}`;
  const modeCtx = buildModePromptContext(params.searchMode, params.studentJobPrefs, params.pivotPrefs);
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 256,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Vacature:\n${params.jobDescription.slice(0, 3000)}\n\nCV:\n${params.cvText.slice(0, 2000)}\n\nKeywords: ${params.keywords.join(', ')}\nLocatie: ${params.location}${modeCtx ? `\n\n${modeCtx}` : ''}`,
    }],
  });
  logTokens(HAIKU, msg.usage, params.userId);
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  return { score: Number(parsed.score ?? 50), reasoning: String(parsed.reasoning ?? '') };
}

export async function scoreAndExtractJob(params: {
  jobDescription: string;
  cvText: string;
  keywords: string[];
  location: string;
  userId?: string;
  searchMode?: SearchMode;
  studentJobPrefs?: StudentJobPrefs | null;
  pivotPrefs?: PivotPrefs | null;
}): Promise<{ score: number; reasoning: string; titel: string; bedrijf: string }> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const systemPrompt = `Je bent een Belgische HR-expert. Beoordeel hoe goed een kandidaat past bij een vacature en extraheer de jobtitel en bedrijfsnaam. Antwoord ALLEEN met JSON: {"score": number, "reasoning": "string (max 80 woorden)", "titel": "string", "bedrijf": "string"}`;
  const modeCtx = buildModePromptContext(params.searchMode, params.studentJobPrefs, params.pivotPrefs);
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 300,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Vacature:\n${params.jobDescription.slice(0, 3000)}\n\nCV:\n${params.cvText.slice(0, 2000)}\n\nKeywords: ${params.keywords.join(', ')}\nLocatie: ${params.location}${modeCtx ? `\n\n${modeCtx}` : ''}`,
    }],
  });
  logTokens(HAIKU, msg.usage, params.userId);
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  return {
    score:     Number(parsed.score    ?? 50),
    reasoning: String(parsed.reasoning ?? ''),
    titel:     String(parsed.titel    ?? 'Onbekend').slice(0, 100),
    bedrijf:   String(parsed.bedrijf  ?? 'Onbekend').slice(0, 100),
  };
}

export async function draftCoverLetterPremium(params: {
  jobDescription: string;
  cvText: string;
  jobTitle: string;
  company: string;
  userId?: string;
}): Promise<string> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const systemPrompt = `Je bent een Belgische loopbaancoach. Schrijf een Nederlandse motivatiebrief van max 150 woorden. Geen AI-clichés. Max 3 alinea's. Actiegericht. Antwoord ALLEEN met de brieftekst, geen JSON.`;
  const msg = await client.messages.create({
    model: SONNET,
    max_tokens: 512,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Vacature: ${params.jobTitle} bij ${params.company}\n\n${params.jobDescription.slice(0, 3000)}\n\nCV:\n${params.cvText.slice(0, 2000)}`,
    }],
  });
  logTokens(SONNET, msg.usage, params.userId);
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}
