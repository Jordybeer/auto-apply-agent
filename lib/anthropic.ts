import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

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
