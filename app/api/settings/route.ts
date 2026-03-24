import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const { data, error } = await supabase
    .from('user_settings')
    .select('scrape_api_key, groq_api_key, keywords, city, radius, last_scrape_at')
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116')
    return NextResponse.json({ error: error.message }, { status: 500 });

  const scrapeKey = data?.scrape_api_key;
  const groqKey = data?.groq_api_key;

  let scrape_usage = null;
  if (scrapeKey) {
    try {
      const usageRes = await fetch(`https://api.scrape.do/info?token=${scrapeKey}`);
      if (usageRes.ok) {
        const raw = await usageRes.json();
        scrape_usage = {
          remainingCredits: raw.remainingCredits ?? raw.remaining_credits ?? raw.remaining ?? 0,
          totalCredits: raw.totalCredits ?? raw.total_credits ?? raw.total ?? 0,
        };
      }
    } catch {}
  }

  return NextResponse.json({
    scrape_api_key: scrapeKey ? `${scrapeKey.slice(0, 6)}...${scrapeKey.slice(-4)}` : null,
    groq_api_key: groqKey ? `${groqKey.slice(0, 6)}...${groqKey.slice(-4)}` : null,
    scrape_usage,
    keywords: data?.keywords ?? [],
    city: data?.city ?? 'Antwerpen',
    radius: data?.radius ?? 30,
    last_scrape_at: data?.last_scrape_at ?? null,
    user: { email: user.email, avatar_url: user.user_metadata?.avatar_url },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const patch: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (body.scrape_api_key !== undefined) {
    if (!body.scrape_api_key?.trim())
      return NextResponse.json({ error: 'Ongeldige scrape.do API key' }, { status: 400 });
    patch.scrape_api_key = body.scrape_api_key.trim();
  }
  if (body.groq_api_key !== undefined) {
    if (!body.groq_api_key?.trim())
      return NextResponse.json({ error: 'Ongeldige Groq API key' }, { status: 400 });
    patch.groq_api_key = body.groq_api_key.trim();
  }
  if (body.keywords !== undefined) patch.keywords = body.keywords;
  if (body.city !== undefined) patch.city = body.city;
  if (body.radius !== undefined) patch.radius = body.radius;

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

  const { searchParams } = new URL(request.url);
  const target = searchParams.get('target');

  if (target === 'jobs') {
    const { error } = await supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (target === 'groq') {
    const { error } = await supabase
      .from('user_settings')
      .update({ groq_api_key: null, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // default: delete scrape key
  const { error } = await supabase
    .from('user_settings')
    .update({ scrape_api_key: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
