/**
 * Gmail API helper — sends an email using the user's stored OAuth refresh token.
 *
 * Flow:
 *   1. Exchange the stored refresh_token for a short-lived access_token via
 *      Google's token endpoint (no SDK needed, plain fetch).
 *   2. Build a RFC 2822 message and base64url-encode it.
 *   3. POST to Gmail API /users/me/messages/send.
 *
 * The refresh_token is stored in user_settings.gmail_refresh_token and is
 * written by app/auth/callback/route.ts after each Google sign-in.
 */

export interface GmailSendOptions {
  refreshToken: string;
  to: string;
  subject: string;
  body: string;
  /** Sender name shown in the From field, e.g. "Jan Peeters" */
  fromName?: string;
}

interface TokenResponse {
  access_token: string;
  error?: string;
  error_description?: string;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });

  const data = await res.json() as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(`Gmail token refresh failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data.access_token;
}

/** RFC 2822 → base64url (Gmail API requirement) */
function buildRawMessage(opts: GmailSendOptions & { from: string }): string {
  const from = opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from;
  const message = [
    `From: ${from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    opts.body,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendViaGmail(opts: GmailSendOptions): Promise<void> {
  const accessToken = await getAccessToken(opts.refreshToken);

  // Get the user's email address to use in the From header.
  const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw new Error('Could not fetch Gmail profile');
  const profile = await profileRes.json() as { emailAddress: string };

  const raw = buildRawMessage({ ...opts, from: profile.emailAddress });

  const sendRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Gmail send failed: ${err?.error?.message ?? sendRes.status}`);
  }
}
