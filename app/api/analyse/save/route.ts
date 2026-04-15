import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });

    const body = await request.json();
    const { url, titel, bedrijf, overall_score } = body;
    if (!url || !titel || !bedrijf) {
      return NextResponse.json({ error: 'url, titel en bedrijf zijn verplicht.' }, { status: 400 });
    }

    // Upsert job
    const { data: jobRow, error: jobErr } = await supabase
      .from('jobs')
      .upsert(
        { user_id: user.id, source_id: url, source: 'analyse', title: titel, company: bedrijf, url },
        { onConflict: 'user_id,source_id' }
      )
      .select('id')
      .single();

    if (jobErr || !jobRow) {
      return NextResponse.json({ error: jobErr?.message ?? 'Job opslaan mislukt.' }, { status: 500 });
    }

    // Insert application (ignore conflict — already saved/applied)
    const { error: appErr } = await supabase
      .from('applications')
      .upsert(
        { user_id: user.id, job_id: jobRow.id, match_score: overall_score ?? null, status: 'saved' },
        { onConflict: 'user_id,job_id', ignoreDuplicates: false }
      );

    if (appErr) {
      return NextResponse.json({ error: appErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
