import { createRemoteJWKSet, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export const maxDuration = 30;

/**
 * Apple App Store server-to-server notifications (version 2).
 * Verifies the shared secret, then updates the subscriptions table.
 */

interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  data?: {
    appAppleId?: number;
    bundleId?: string;
    transactionInfo?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

interface DecodedTransaction {
  appAccountToken?: string;     // maps to user_id when set during purchase
  originalTransactionId: string;
  expiresDate?: number;         // epoch ms
  transactionId: string;
  type?: string;
}

function decodeJwtPayload(jwt: string): unknown {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function isActiveAppleStatus(notificationType: string, subtype?: string): boolean {
  if (notificationType === 'SUBSCRIBED') return true;
  if (notificationType === 'DID_RENEW') return true;
  if (notificationType === 'DID_CHANGE_RENEWAL_STATUS' && subtype === 'AUTO_RENEW_ENABLED') return true;
  return false;
}

export async function POST(request: Request) {
  const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET;

  // Apple S2S v2 sends a signed JWT payload (signedPayload field).
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // App Store Server Notifications v2: body is { signedPayload: "<jwt>" }
  const signedPayload = body.signedPayload;
  if (typeof signedPayload !== 'string') {
    // Legacy v1: body contains password field for verification.
    const password = body.password;
    if (!sharedSecret || password !== sharedSecret) {
      void slog.warn('apple-webhook', 'Ongeldige Apple shared secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // V1 structure — minimal support, just acknowledge.
    void slog.info('apple-webhook', 'Apple v1 notificatie ontvangen (geen verdere verwerking)');
    return NextResponse.json({ received: true });
  }

  let notifPayload: AppleNotificationPayload;
  try {
    const { payload } = await jwtVerify(signedPayload, APPLE_JWKS);
    notifPayload = payload as unknown as AppleNotificationPayload;
  } catch {
    void slog.warn('apple-webhook', 'Apple JWT handtekening ongeldig');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { notificationType, subtype, data } = notifPayload;
  const signedTransaction = data?.signedTransactionInfo ?? data?.transactionInfo;
  if (!signedTransaction) {
    // Acknowledge events without transaction data (e.g. TEST).
    void slog.info('apple-webhook', 'Apple notificatie zonder transactiedata', { type: notificationType });
    return NextResponse.json({ received: true });
  }

  const tx = decodeJwtPayload(signedTransaction) as DecodedTransaction | null;
  if (!tx) {
    void slog.warn('apple-webhook', 'Kan Apple transactie JWT niet decoderen');
    return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 });
  }

  const userId = tx.appAccountToken;
  const originalTransactionId = tx.originalTransactionId;
  const expiresMs = tx.expiresDate;

  if (!userId) {
    // Without appAccountToken we cannot map to a user — acknowledge and move on.
    void slog.warn('apple-webhook', 'Geen appAccountToken in Apple transactie', { originalTransactionId });
    return NextResponse.json({ received: true });
  }

  const service = createServiceClient();
  const active = isActiveAppleStatus(notificationType, subtype);
  const tier: 'free' | 'premium' = active ? 'premium' : 'free';
  const dbStatus: 'active' | 'canceled' = active ? 'active' : 'canceled';
  const periodEnd = expiresMs ? new Date(expiresMs).toISOString() : null;

  try {
    await service.from('subscriptions').upsert(
      {
        user_id:            userId,
        provider:           'apple',
        provider_sub_id:    originalTransactionId,
        tier,
        status:             dbStatus,
        current_period_end: periodEnd,
        updated_at:         new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    void slog.info('apple-webhook', `Abonnement bijgewerkt: ${notificationType}`, { user_id: userId, tier, status: dbStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    void slog.error('apple-webhook', 'DB upsert mislukt', { error: msg, user_id: userId });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
