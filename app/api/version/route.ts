import { NextResponse } from 'next/server';
import { clientFromHeaders } from '@/lib/client-version';

/**
 * Version + force-upgrade endpoint.
 * iOS hits this on cold launch; if its build < minSupportedIosBuild,
 * the app shows a blocking "Update vereist" screen.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_SUPPORTED_IOS_BUILD = 1;
const LATEST_IOS = '0.1.0';
const LATEST_IOS_BUILD = 1;
const LATEST_WEB = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.2';

export async function GET(req: Request) {
  const client = clientFromHeaders(req.headers);
  const clientBuild = client.build ? parseInt(client.build, 10) : NaN;
  const forceUpgrade =
    client.platform === 'ios' &&
    Number.isFinite(clientBuild) &&
    clientBuild < MIN_SUPPORTED_IOS_BUILD;

  return NextResponse.json({
    minSupportedIosBuild: MIN_SUPPORTED_IOS_BUILD,
    latestIos: LATEST_IOS,
    latestIosBuild: LATEST_IOS_BUILD,
    latestWeb: LATEST_WEB,
    forceUpgrade,
    client,
  });
}
