import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';

const BUCKET = 'resumes';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = `${user.id}/cv.pdf`;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return NextResponse.json({ url: null });
  return NextResponse.json({ url: data.signedUrl });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('cv') as File | null;
  if (!file || file.type !== 'application/pdf')
    return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: 'File too large (max 5MB).' }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const path = `${user.id}/cv.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
