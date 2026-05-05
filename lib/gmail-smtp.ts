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
    port:   587,
    secure: false,
    auth:   { user: opts.gmailAddress, pass: opts.appPassword },
  });

  const bodyWithSig = opts.signature
    ? `${opts.body}\n\n${opts.signature}`
    : opts.body;

  const htmlBody = bodyWithSig
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const mailOptions: nodemailer.SendMailOptions = {
    from:    opts.fromName ? `"${opts.fromName}" <${opts.gmailAddress}>` : opts.gmailAddress,
    to:      opts.to,
    subject: opts.subject,
    text:    bodyWithSig,
    html:    `<pre style="font-family:inherit;white-space:pre-wrap">${htmlBody}</pre>`,
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
