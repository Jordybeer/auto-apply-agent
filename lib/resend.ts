/**
 * Resend email helper — sends job application emails from info@jordy.beer
 * via the Resend API (https://resend.com).
 *
 * Required env var: RESEND_API_KEY
 *
 * Domain setup (one-time):
 *   1. Go to resend.com → Domains → Add domain → jordy.beer
 *   2. Add the provided DNS records in your iCloud / Apple domain DNS
 *   3. Wait for verification (usually a few minutes)
 */

import { Resend } from 'resend';
import { requireServerEnv } from '@/lib/env';

export interface ResendSendOptions {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain-text motivational letter body */
  body: string;
  /** Sender display name, e.g. "Jan Peeters" */
  fromName?: string | null;
  /** Optional signature appended after a blank line */
  signature?: string | null;
  /** Optional CV PDF as raw bytes */
  attachmentPdf?: Buffer | null;
  /** Filename for the attachment */
  attachmentFilename?: string;
}

/** Convert plain text to safe HTML, preserving newlines. */
function textToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\n/g, '<br>');
}

export async function sendViaResend(opts: ResendSendOptions): Promise<void> {
  const apiKey = requireServerEnv('RESEND_API_KEY');
  const resend = new Resend(apiKey);

  const fromAddress = 'info@jordy.beer';
  const from = opts.fromName
    ? `${opts.fromName} <${fromAddress}>`
    : fromAddress;

  // Build HTML body
  let htmlBody = textToHtml(opts.body);
  if (opts.signature) {
    htmlBody += `<br><br>${textToHtml(opts.signature)}`;
  }
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#111">${htmlBody}</body></html>`;

  // Build plain-text body
  let text = opts.body;
  if (opts.signature) text += `\n\n${opts.signature}`;

  // Build attachments array
  const attachments: { filename: string; content: Buffer }[] = [];
  if (opts.attachmentPdf && opts.attachmentPdf.length > 0) {
    attachments.push({
      filename: opts.attachmentFilename ?? 'cv.pdf',
      content:  opts.attachmentPdf,
    });
  }

  const { error } = await resend.emails.send({
    from,
    to:   opts.to,
    subject: opts.subject,
    html,
    text,
    ...(attachments.length > 0 ? { attachments } : {}),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
