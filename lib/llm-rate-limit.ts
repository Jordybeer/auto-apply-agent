const MAX_LLM_CALLS_PER_DAY = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkLlmRateLimit(userId: string, supabase: any): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: remaining } = await supabase.rpc('try_claim_llm_call', {
    p_user_id: userId,
    p_today: today,
    p_max_calls: MAX_LLM_CALLS_PER_DAY,
  });

  if (remaining === -1 || remaining === null) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining };
}
