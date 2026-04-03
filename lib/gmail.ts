/**
 * Gmail API helper — sends an email using the user's stored OAuth refresh token.
 *
 * Flow:
 *   1. Exchange the stored refresh_token for a short-lived access_token via
 *      Google's token endpoint (no SDK needed, plain fetch).
 *   2. Build a RFC 2822 multipart/mixed message (text + optional PDF attachment)
 *      and base64url-encode it.
 *   3. POST to Gmail API /users/me/messages/send.
 *
 * The refresh_token is stored in user_settings.gmail_refresh_token and is
 * written by app/auth/callback/route.ts after each Google sign-in.
 */

export interface GmailSendOptions {
  refreshToken: string;
  to: string;
  subject: string;
  /** Plain-text body (motivational letter). */
  body: string;
  /** Optional job URL appended after the letter body. */
  jobUrl?: string | null;
  /** Optional PDF to attach (raw bytes). */
  attachmentPdf?: Buffer | null;
  /** Filename for the attachment, e.g. "cv.pdf" */
  attachmentFilename?: string;
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

/** RFC 2822 multipart/mixed → base64url (Gmail API requirement) */
function buildRawMessage(
  opts: GmailSendOptions & { from: string },
): string {
  const from = opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from;
  const boundary = `----=_Part_${Date.now().toString(36)}`;

  // Append job URL to body when provided
  const fullBody = opts.jobUrl
    ? `${opts.body}\n\n---\nVacature: ${opts.jobUrl}`
    : opts.body;

  const lines: string[] = [
    `From: ${from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(fullBody).toString('base64'),
  ];

  if (opts.attachmentPdf && opts.attachmentPdf.length > 0) {
    const filename = opts.attachmentFilename ?? 'cv.pdf';
    lines.push(
      `--${boundary}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      opts.attachmentPdf.toString('base64'),
    );
  }

  lines.push(`--${boundary}--`);

  const raw = lines.join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Look up the authenticated user's email address via the Gmail userinfo endpoint. */
async function getSenderEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as { email?: string };
  if (!data.email) throw new Error('Could not determine sender email');
  return data.email;
}

export async function sendViaGmail(opts: GmailSendOptions): Promise<void> {
  const accessToken = await getAccessToken(opts.refreshToken);
  const senderEmail = await getSenderEmail(accessToken);

  const raw = buildRawMessage({ ...opts, from: senderEmail });

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Gmail send failed: ${err.error?.message ?? res.status}`);
  }
}
