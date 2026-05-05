import Anthropic from '@anthropic-ai/sdk';

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

const FREE_DAILY_LIMIT = 5;

export async function checkAndIncrementScoredToday(
  supabase: ReturnType<typeof import('@/lib/supabase-service').createServiceClient>,
  userId: string,
  premium: boolean,
): Promise<{ allowed: boolean }> {
  if (premium) return { allowed: true };

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('user_settings')
    .select('scored_today, scored_today_reset_at')
    .eq('user_id', userId)
    .single();

  const resetDate = (data?.scored_today_reset_at as string | null | undefined)?.slice(0, 10);
  const current = resetDate === today ? ((data?.scored_today as number | null | undefined) ?? 0) : 0;

  if (current >= FREE_DAILY_LIMIT) return { allowed: false };

  await supabase
    .from('user_settings')
    .update({ scored_today: current + 1, scored_today_reset_at: new Date().toISOString() })
    .eq('user_id', userId);

  return { allowed: true };
}

const HAIKU  = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

export async function scoreJobPremium(params: {
  jobDescription: string;
  cvText: string;
  keywords: string[];
  location: string;
}): Promise<{ score: number; reasoning: string }> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not configured');
  const systemPrompt = `Je bent een Belgische HR-expert. Beoordeel hoe goed een kandidaat past bij een vacature op schaal 0-100. Antwoord ALLEEN met JSON: {"score": number, "reasoning": "string (max 80 woorden)"}`;
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 256,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Vacature:\n${params.jobDescription.slice(0, 3000)}\n\nCV:\n${params.cvText.slice(0, 2000)}\n\nKeywords: ${params.keywords.join(', ')}\nLocatie: ${params.location}`,
    }],
  });
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
  return { score: Number(parsed.score ?? 50), reasoning: String(parsed.reasoning ?? '') };
}

export async function draftCoverLetterPremium(params: {
  jobDescription: string;
  cvText: string;
  jobTitle: string;
  company: string;
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
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}
