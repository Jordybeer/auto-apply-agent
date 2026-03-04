import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendApplicationEmail } from '@/lib/resend';

export async function POST(req: Request) {
  try {
    const { applicationId } = await req.json();

    if (!applicationId) {
      return NextResponse.json({ success: false, error: 'applicationId is required' }, { status: 400 });
    }

    const { data: application, error } = await supabase
      .from('applications')
      .select(`
        id,
        match_score,
        cover_letter_draft,
        resume_bullets_draft,
        status,
        jobs (
          title,
          company,
          url,
          source
        )
      `)
      .eq('id', applicationId)
      .single();

    if (error || !application) {
      return NextResponse.json({ success: false, error: 'Application not found' }, { status: 404 });
    }

    if (application.status === 'sent') {
      return NextResponse.json({ success: false, error: 'This application was already sent.' }, { status: 409 });
    }

    await sendApplicationEmail(application as any);

    await supabase
      .from('applications')
      .update({ status: 'sent' })
      .eq('id', applicationId);

    return NextResponse.json({ success: true, message: `Email verstuurd voor: ${(application as any).jobs?.title}` });
  } catch (error: any) {
    console.error('Send route error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
