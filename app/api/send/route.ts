import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ success: false, message: 'Email sending not yet configured.' }, { status: 501 });
}
