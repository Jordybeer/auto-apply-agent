import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendApplicationEmail(application: {
  id: string;
  match_score: number;
  cover_letter_draft: string;
  resume_bullets_draft: string[];
  jobs: {
    title: string;
    company: string;
    url: string;
    source: string;
  } | null;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set in environment variables.');
  }

  const job = application.jobs;
  if (!job) throw new Error('No job linked to this application.');

  const bullets = Array.isArray(application.resume_bullets_draft)
    ? application.resume_bullets_draft.map((b: string) => `<li style="margin-bottom:6px">${b}</li>`).join('')
    : '';

  const scoreColor = application.match_score >= 75 ? '#16a34a' : application.match_score >= 50 ? '#d97706' : '#dc2626';

  await resend.emails.send({
    from: 'Auto-Apply Agent <contact@jordy.beer>',
    to: 'contact@jordy.beer',
    subject: `🤖 Sollicitatie klaar: ${job.title} @ ${job.company} — ${application.match_score}/100`,
    html: `
      <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 4px">Nieuwe Sollicitatie Draft</h2>
        <p style="color: #555; margin-top: 0">Gegenereerd door je Auto-Apply Agent</p>

        <table style="border-collapse: collapse; width: 100%; margin-bottom: 24px">
          <tr><td style="padding: 8px; font-weight: bold">Functie</td><td style="padding: 8px">${job.title}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding: 8px; font-weight: bold">Bedrijf</td><td style="padding: 8px">${job.company}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold">Bron</td><td style="padding: 8px">${job.source}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding: 8px; font-weight: bold">Link</td><td style="padding: 8px"><a href="${job.url}">${job.url}</a></td></tr>
          <tr><td style="padding: 8px; font-weight: bold">Match Score</td><td style="padding: 8px; color: ${scoreColor}; font-weight: bold">${application.match_score} / 100</td></tr>
        </table>

        <h3>Motivatiebrief</h3>
        <div style="background: #f9f9f9; border-left: 4px solid #6366f1; padding: 16px; white-space: pre-line; border-radius: 4px">${application.cover_letter_draft}</div>

        <h3 style="margin-top: 24px">CV Bullet Points</h3>
        <ul style="background: #f9f9f9; padding: 16px 16px 16px 32px; border-radius: 4px">${bullets}</ul>

        <p style="margin-top: 32px; color: #888; font-size: 12px">Stuur je sollicitatie via <a href="${job.url}">${job.url}</a></p>
      </div>
    `,
  });
}
