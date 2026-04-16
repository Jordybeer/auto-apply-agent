import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('full_name, city, keywords, cv_text')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116')
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    full_name: data?.full_name ?? '',
    city:      data?.city ?? '',
    keywords:  data?.keywords ?? [],
    cv_text:   data?.cv_text ?? '',
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (body.full_name !== undefined && (typeof body.full_name !== 'string' || body.full_name.length > 200))
    return NextResponse.json({ error: 'Ongeldige naam.' }, { status: 400 });
  if (body.city !== undefined && (typeof body.city !== 'string' || body.city.length > 100))
    return NextResponse.json({ error: 'Ongeldige stad.' }, { status: 400 });
  if (body.keywords !== undefined && (!Array.isArray(body.keywords) || body.keywords.length > 50))
    return NextResponse.json({ error: 'Ongeldige zoekwoorden.' }, { status: 400 });
  if (body.cv_text !== undefined && (typeof body.cv_text !== 'string' || body.cv_text.length > 50_000))
    return NextResponse.json({ error: 'CV-tekst te lang (max 50.000 tekens).' }, { status: 400 });

  const patch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (body.full_name !== undefined) patch.full_name = body.full_name;
  if (body.city      !== undefined) patch.city      = body.city;
  if (body.keywords  !== undefined) patch.keywords  = body.keywords;
  if (body.cv_text   !== undefined) patch.cv_text   = body.cv_text;

  const { error } = await supabase
    .from('user_settings')
    .upsert(patch, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
