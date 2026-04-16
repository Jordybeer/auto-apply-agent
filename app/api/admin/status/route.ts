import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { ADMIN_USER_ID } from '@/lib/env';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ is_admin: false }, { status: 401 });
  return NextResponse.json({ is_admin: ADMIN_USER_ID !== '' && user.id === ADMIN_USER_ID });
}
