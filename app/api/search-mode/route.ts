import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import type { SearchMode, StudentJobPrefs, PivotPrefs } from '@/lib/search-mode';

const VALID_MODES: SearchMode[] = ['career', 'student', 'pivot'];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('search_mode, student_job_prefs, pivot_prefs')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116')
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    search_mode:       (data?.search_mode       ?? 'career') as SearchMode,
    student_job_prefs: (data?.student_job_prefs ?? null)     as StudentJobPrefs | null,
    pivot_prefs:       (data?.pivot_prefs       ?? null)     as PivotPrefs | null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // -- Validate search_mode --
  if (body.search_mode !== undefined) {
    if (!VALID_MODES.includes(body.search_mode))
      return NextResponse.json({ error: 'Ongeldige zoekmodus.' }, { status: 400 });
  }

  // -- Validate student_job_prefs --
  if (body.student_job_prefs !== null && body.student_job_prefs !== undefined) {
    const p = body.student_job_prefs as Record<string, unknown>;
    if (
      typeof p !== 'object' ||
      typeof p.max_hours_per_week !== 'number' ||
      p.max_hours_per_week < 1 || p.max_hours_per_week > 40 ||
      typeof p.flexible_schedule !== 'boolean' ||
      !Array.isArray(p.sectors) ||
      p.sectors.some((s: unknown) => typeof s !== 'string' || (s as string).length > 80) ||
      !['hoger_onderwijs', 'secundair', 'andere'].includes(p.student_status as string)
    ) {
      return NextResponse.json({ error: 'Ongeldige studentenjob-voorkeuren.' }, { status: 400 });
    }
  }

  // -- Validate pivot_prefs --
  if (body.pivot_prefs !== null && body.pivot_prefs !== undefined) {
    const p = body.pivot_prefs as Record<string, unknown>;
    if (
      typeof p !== 'object' ||
      !Array.isArray(p.target_sectors) ||
      !Array.isArray(p.transferable_skills) ||
      typeof p.open_to_retraining !== 'boolean'
    ) {
      return NextResponse.json({ error: 'Ongeldige sectorwissel-voorkeuren.' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (body.search_mode       !== undefined) patch.search_mode       = body.search_mode;
  if (body.student_job_prefs !== undefined) patch.student_job_prefs = body.student_job_prefs;
  if (body.pivot_prefs       !== undefined) patch.pivot_prefs       = body.pivot_prefs;

  const { error } = await supabase
    .from('user_settings')
    .upsert(patch, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
