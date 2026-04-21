import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { assertSafeUrl } from '@/lib/url-guard';
import { slog } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      void slog.warn('analyse/save', 'Auth failed', { authError });
      return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
    }

    const body = await request.json();
    const { url, titel, bedrijf, overall_score } = body;
    if (!url || !titel || !bedrijf) {
      void slog.warn('analyse/save', 'Missing required fields', { has_url: !!url, has_titel: !!titel, has_bedrijf: !!bedrijf });
      return NextResponse.json({ error: 'url, titel en bedrijf zijn verplicht.' }, { status: 400 });
    }
    if (typeof url !== 'string' || typeof titel !== 'string' || typeof bedrijf !== 'string') {
      void slog.warn('analyse/save', 'Invalid input types');
      return NextResponse.json({ error: 'Ongeldige invoer.' }, { status: 400 });
    }
    if (url.length > 2048 || titel.length > 200 || bedrijf.length > 200) {
      void slog.warn('analyse/save', 'Input too long', { url_len: url.length, titel_len: titel.length, bedrijf_len: bedrijf.length });
      return NextResponse.json({ error: 'Invoer te lang.' }, { status: 400 });
    }
    try { assertSafeUrl(url); } catch (e) {
      void slog.warn('analyse/save', 'Unsafe URL', { url, error: e instanceof Error ? e.message : 'unknown' });
      return NextResponse.json({ error: 'Ongeldige URL.' }, { status: 400 });
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
      void slog.error('analyse/save', 'Job upsert failed', { jobErr: jobErr?.message, user_id: user.id });
      return NextResponse.json({ error: jobErr?.message ?? 'Job opslaan mislukt.' }, { status: 500 });
    }

    // Insert application (ignore conflict — already saved/applied)
    const { error: appErr } = await supabase
      .from('applications')
      .upsert(
        { user_id: user.id, job_id: jobRow.id, match_score: overall_score ?? null, status: 'saved' },
        { onConflict: 'user_id,job_id', ignoreDuplicates: true }
      );

    if (appErr) {
      void slog.error('analyse/save', 'Application upsert failed', { appErr: appErr.message, job_id: jobRow.id });
      return NextResponse.json({ error: appErr.message }, { status: 500 });
    }

    void slog.info('analyse/save', 'Job saved successfully', { job_id: jobRow.id, titel, bedrijf });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    void slog.error('analyse/save', 'Uncaught error', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      void slog.warn('analyse/save', 'DELETE: Auth failed');
      return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
    }

    const { url } = await request.json();
    if (!url) {
      void slog.warn('analyse/save', 'DELETE: Missing url');
      return NextResponse.json({ error: 'url is verplicht.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('user_id', user.id)
      .eq('source_id', url);

    if (error) {
      void slog.error('analyse/save', 'DELETE: Job delete failed', { error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    void slog.info('analyse/save', 'Job deleted successfully', { user_id: user.id });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    void slog.error('analyse/save', 'DELETE: Uncaught error', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
