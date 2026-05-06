import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { extractCvText } from '@/lib/parse-cv';
import { extractStructuredCv } from '@/lib/parse-cv-structured';
import { slog } from '@/lib/logger';

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

  if (!file) return NextResponse.json({ error: 'Geen bestand ontvangen.' }, { status: 400 });

  const isPdf =
    file.type === 'application/pdf' ||
    (file.type === 'application/octet-stream' && file.name.toLowerCase().endsWith('.pdf'));

  if (!isPdf)
    return NextResponse.json({ error: 'Alleen PDF bestanden zijn toegestaan.' }, { status: 400 });

  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: 'Bestand te groot (max 5MB).' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate PDF magic bytes — MIME type is client-controlled and can be spoofed.
  if (buffer.toString('binary', 0, 4) !== '%PDF')
    return NextResponse.json({ error: 'Ongeldig PDF-bestand.' }, { status: 400 });
  const path = `${user.id}/cv.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Parse and cache the extracted text so apply/rematch routes don't re-parse on every call.
  try {
    const cvText = await extractCvText(buffer);
    const patch: Record<string, unknown> = { user_id: user.id, cv_text: cvText };
    try {
      const structured = await extractStructuredCv(cvText, user.id);
      patch.cv_structured = structured;
      void slog.info('cv', 'Structured CV extracted', { skills: structured.skills.length, tools: structured.tools.length }, user.id);
    } catch (structErr) {
      void slog.warn('cv', 'CV structurering mislukt', { error: String(structErr) }, user.id);
    }
    await supabase
      .from('user_settings')
      .upsert(patch, { onConflict: 'user_id' });
  } catch (parseErr) {
    void slog.warn('cv', 'CV tekst extractie mislukt na upload', { error: String(parseErr) }, user.id);
  }

  return NextResponse.json({ success: true });
}
