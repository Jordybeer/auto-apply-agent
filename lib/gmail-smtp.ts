import nodemailer from 'nodemailer';

export interface GmailSendOptions {
  gmailAddress: string;
  appPassword:  string;
  to:           string;
  subject:      string;
  body:         string;
  fromName?:    string | null;
  signature?:   string | null;
  attachmentPdf?:      Buffer | null;
  attachmentFilename?: string;
}

export async function sendViaGmail(opts: GmailSendOptions): Promise<void> {
  const transporter = nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   465,
    secure: true,
    auth:   { user: opts.gmailAddress, pass: opts.appPassword },
  });

  const bodyWithSig = opts.signature
    ? `${opts.body}\n\n${opts.signature}`
    : opts.body;

  const htmlBody = bodyWithSig
    .split(/\n\n+/)
    .map(paragraph =>
      `<p>${paragraph
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')}</p>`
    )
    .join('\n');

  const mailOptions: nodemailer.SendMailOptions = {
    from:     opts.fromName ? `"${opts.fromName}" <${opts.gmailAddress}>` : opts.gmailAddress,
    replyTo:  opts.gmailAddress,
    to:       opts.to,
    subject:  opts.subject,
    priority: 'normal',
    text:     bodyWithSig,
    html:     `<div style="font-family:inherit;font-size:1rem;line-height:1.6">${htmlBody}</div>`,
  };

  if (opts.attachmentPdf) {
    mailOptions.attachments = [{
      filename:    opts.attachmentFilename ?? 'cv.pdf',
      content:     opts.attachmentPdf,
      contentType: 'application/pdf',
    }];
  }

  await transporter.sendMail(mailOptions);
}
