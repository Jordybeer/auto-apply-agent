import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_USER_ID } from '@/lib/env';

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = user.id === ADMIN_USER_ID;

  const { data, error } = await supabase
    .from('user_settings')
    .select('adzuna_app_id, adzuna_app_key, groq_api_key, is_onboarded, keywords, city, radius, last_scrape_at, adzuna_calls_today, adzuna_calls_month, last_call_date, auto_apply_threshold')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116')
    return NextResponse.json({ error: error.message }, { status: 500 });

  const groqKey = data?.groq_api_key;

  const response: Record<string, unknown> = {
    groq_api_key:         groqKey ? `${groqKey.slice(0, 6)}...${groqKey.slice(-4)}` : null,
    is_onboarded:         data?.is_onboarded ?? false,
    keywords:             data?.keywords ?? [],
    city:                 data?.city    ?? 'Antwerpen',
    radius:               data?.radius  ?? 30,
    last_scrape_at:       data?.last_scrape_at ?? null,
    auto_apply_threshold: (data as Record<string, unknown>)?.auto_apply_threshold ?? null,
    user: { email: user.email, avatar_url: user.user_metadata?.avatar_url },
    is_admin: isAdmin,
  };

  if (isAdmin) {
    const adzunaId  = data?.adzuna_app_id;
    const adzunaKey = data?.adzuna_app_key;
    response.adzuna_app_id      = adzunaId  ? `${adzunaId.slice(0, 4)}...${adzunaId.slice(-4)}`   : null;
    response.adzuna_app_key     = adzunaKey ? `${adzunaKey.slice(0, 4)}...${adzunaKey.slice(-4)}` : null;

    const today    = new Date().toISOString().slice(0, 10);
    const rowData  = data as Record<string, unknown>;
    const isNewDay = rowData?.last_call_date !== today;
    response.adzuna_calls_today = isNewDay ? 0 : (rowData?.adzuna_calls_today ?? 0);
    response.adzuna_calls_month = rowData?.adzuna_calls_month ?? 0;
  }

  return NextResponse.json(response);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = user.id === ADMIN_USER_ID;
  const body    = await request.json();
  const patch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (isAdmin) {
    if (body.adzuna_app_id  !== undefined) patch.adzuna_app_id  = body.adzuna_app_id.trim();
    if (body.adzuna_app_key !== undefined) patch.adzuna_app_key = body.adzuna_app_key.trim();
    if (body.reset_month_counter) patch.adzuna_calls_month = 0;
  }

  if (body.groq_api_key !== undefined) {
    if (!body.groq_api_key?.trim())
      return NextResponse.json({ error: 'Ongeldige Groq API key' }, { status: 400 });
    patch.groq_api_key = body.groq_api_key.trim();
  }
  if (body.is_onboarded !== undefined) patch.is_onboarded = body.is_onboarded;
  if (body.keywords !== undefined) {
    if (!Array.isArray(body.keywords) || body.keywords.length > 20 ||
        body.keywords.some((k: unknown) => typeof k !== 'string' || k.length > 50))
      return NextResponse.json({ error: 'Ongeldige keywords' }, { status: 400 });
    patch.keywords = body.keywords;
  }
  if (body.city !== undefined) {
    if (typeof body.city !== 'string' || body.city.length > 100)
      return NextResponse.json({ error: 'Ongeldige stad' }, { status: 400 });
    patch.city = body.city.trim();
  }
  if (body.radius !== undefined) {
    const r = Number(body.radius);
    if (!Number.isFinite(r) || r < 0 || r > 500)
      return NextResponse.json({ error: 'Ongeldig bereik (0–500)' }, { status: 400 });
    patch.radius = r;
  }
  if (body.auto_apply_threshold !== undefined) {
    const t = Number(body.auto_apply_threshold);
    if (!Number.isFinite(t) || t < 0 || t > 100)
      return NextResponse.json({ error: 'Ongeldige drempel (0–100)' }, { status: 400 });
    patch.auto_apply_threshold = t;
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(patch, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = user.id === ADMIN_USER_ID;
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target');

  if (target === 'jobs') {
    const { error } = await supabase.from('jobs').delete().eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }
  if (target === 'groq') {
    const { error } = await supabase.from('user_settings').update({ groq_api_key: null, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }
  if (target === 'adzuna' && isAdmin) {
    const { error } = await supabase.from('user_settings').update({ adzuna_app_id: null, adzuna_app_key: null, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown target' }, { status: 400 });
}
