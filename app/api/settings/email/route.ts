import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('full_name, email_signature, gmail_address, gmail_app_password')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116')
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    full_name:       data?.full_name       ?? '',
    email_signature: data?.email_signature ?? '',
    gmail_address:   data?.gmail_address   ?? '',
    has_password:    !!data?.gmail_app_password,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const patch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (body.full_name !== undefined) {
    if (typeof body.full_name !== 'string' || body.full_name.length > 200)
      return NextResponse.json({ error: 'Ongeldige naam' }, { status: 400 });
    patch.full_name = body.full_name.trim() || null;
  }
  if (body.email_signature !== undefined) {
    if (typeof body.email_signature !== 'string' || body.email_signature.length > 1000)
      return NextResponse.json({ error: 'Handtekening te lang (max 1000 tekens)' }, { status: 400 });
    patch.email_signature = body.email_signature.trim() || null;
  }
  if (body.gmail_address !== undefined) {
    if (typeof body.gmail_address !== 'string' || body.gmail_address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.gmail_address))
      return NextResponse.json({ error: 'Ongeldig Gmail-adres' }, { status: 400 });
    patch.gmail_address = body.gmail_address.trim() || null;
  }
  if (body.gmail_app_password !== undefined) {
    if (typeof body.gmail_app_password !== 'string' || body.gmail_app_password.replace(/\s/g, '').length > 32)
      return NextResponse.json({ error: 'App-wachtwoord te lang (max 32 tekens)' }, { status: 400 });
    patch.gmail_app_password = body.gmail_app_password.replace(/\s/g, '') || null;
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(patch, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
