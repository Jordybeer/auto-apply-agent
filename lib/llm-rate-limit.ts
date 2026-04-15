const MAX_LLM_CALLS_PER_DAY = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkLlmRateLimit(userId: string, supabase: any): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from('user_settings')
    .select('llm_calls_today, llm_last_call_date')
    .eq('user_id', userId)
    .single();

  const isNewDay = !data?.llm_last_call_date || data.llm_last_call_date !== today;
  const current  = isNewDay ? 0 : (data?.llm_calls_today ?? 0);

  if (current >= MAX_LLM_CALLS_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }

  await supabase
    .from('user_settings')
    .update({ llm_calls_today: current + 1, llm_last_call_date: today })
    .eq('user_id', userId);

  return { allowed: true, remaining: MAX_LLM_CALLS_PER_DAY - current - 1 };
}
