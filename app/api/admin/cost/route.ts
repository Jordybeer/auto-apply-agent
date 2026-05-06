import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { ADMIN_USER_ID } from '@/lib/env';

export const maxDuration = 15;

// USD per million tokens
const PRICES: Record<string, { input: number; output: number; cache_write: number; cache_read: number }> = {
  'claude-haiku-4-5':          { input: 1.00, output:  5.00, cache_write: 1.25, cache_read: 0.10 },
  'claude-haiku-4-5-20251001': { input: 1.00, output:  5.00, cache_write: 1.25, cache_read: 0.10 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00, cache_write: 3.75, cache_read: 0.30 },
  'claude-opus-4-7':           { input: 5.00, output: 25.00, cache_write: 6.25, cache_read: 0.50 },
};

function tokenCost(model: string, input: number, output: number, cacheWrite: number, cacheRead: number): number {
  const p = PRICES[model] ?? PRICES['claude-sonnet-4-6'];
  return (input * p.input + output * p.output + cacheWrite * p.cache_write + cacheRead * p.cache_read) / 1_000_000;
}

interface TokenRow {
  meta: Record<string, unknown> | null;
}

interface ModelTotals {
  model: string;
  input: number;
  output: number;
  cache_write: number;
  cache_read: number;
  calls: number;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.id !== ADMIN_USER_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');

  const service = createServiceClient();
  let q = service
    .from('system_logs')
    .select('meta')
    .eq('source', 'llm_usage');
  if (since) q = q.gte('created_at', since);

  const { data } = await q;
  const rows: TokenRow[] = data ?? [];

  // Aggregate by model
  const byModel = new Map<string, ModelTotals>();
  for (const row of rows) {
    const m = row.meta;
    if (!m) continue;
    const model      = String(m.model ?? 'unknown');
    const input      = Number(m.input_tokens ?? 0);
    const output     = Number(m.output_tokens ?? 0);
    const cacheWrite = Number(m.cache_creation_input_tokens ?? 0);
    const cacheRead  = Number(m.cache_read_input_tokens ?? 0);
    const existing   = byModel.get(model) ?? { model, input: 0, output: 0, cache_write: 0, cache_read: 0, calls: 0 };
    byModel.set(model, {
      model,
      input:       existing.input       + input,
      output:      existing.output      + output,
      cache_write: existing.cache_write + cacheWrite,
      cache_read:  existing.cache_read  + cacheRead,
      calls:       existing.calls       + 1,
    });
  }

  const breakdown = Array.from(byModel.values()).map(t => ({
    label:     t.model,
    calls:     t.calls,
    input_tokens:  t.input,
    output_tokens: t.output,
    total: tokenCost(t.model, t.input, t.output, t.cache_write, t.cache_read),
  }));

  const total = breakdown.reduce((s, b) => s + b.total, 0);
  return NextResponse.json({ breakdown, total, since: since ?? null, rows: rows.length });
}
