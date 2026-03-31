import * as cheerio from 'cheerio';
import { resolveRedirect } from '@/lib/scrape-job-description';

export interface ContactInfo {
  name: string;
  email: string;
}

/**
 * Extracts a recruiter/contact name AND email from a job posting page.
 *
 * Accepts optional pre-fetched HTML so the caller can reuse the HTML already
 * downloaded by scrapeJobDescription — avoiding a duplicate HTTP request for
 * the same URL.
 *
 * Resolution order for Adzuna URLs: follow redirect → real job board page.
 * Returns { name: '', email: '' } on any failure — never throws.
 */
export async function scrapeContactInfo(
  jobUrl: string,
  prefetchedHtml?: string,
): Promise<ContactInfo> {
  try {
    let html = prefetchedHtml ?? '';

    if (!html) {
      // Resolve Adzuna redirects to the real job board page
      let targetUrl = jobUrl;
      if (jobUrl.includes('adzuna.be')) {
        targetUrl = await resolveRedirect(jobUrl);
        if (targetUrl.includes('adzuna.be')) return { name: '', email: '' };
      }

      // fix #5: use explicit timer variable so clearTimeout is always called,
      // including on the abort path — previous .finally() pattern left the
      // timer reference dangling when controller.abort() fired.
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoApplyBot/1.0)' },
        });
        clearTimeout(timer);
        if (!res.ok) return { name: '', email: '' };
        html = await res.text();
      } catch {
        clearTimeout(timer);
        return { name: '', email: '' };
      }
    }

    const $ = cheerio.load(html);

    // ── Email extraction ────────────────────────────────────────────────────
    // 1. mailto: links — most reliable source
    let email = '';
    $('a[href^="mailto:"]').each((_, el) => {
      if (email) return;
      const href = $(el).attr('href') || '';
      const extracted = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
      if (extracted.includes('@') && extracted.includes('.')) {
        email = extracted;
      }
    });

    // 2. Visible email patterns in page text (obfuscated or plain)
    if (!email) {
      const bodyText = $('body').text();
      const emailRe = /[a-z0-9._%+\-]+(?:@|\s*\[at\]\s*|\s*\(at\)\s*)[a-z0-9.\-]+(?:\.|\s*\[dot\]\s*)[a-z]{2,}/gi;
      const matches = bodyText.match(emailRe);
      if (matches) {
        const cleaned = matches
          .map((m) =>
            m.toLowerCase()
              .replace(/\s*\[at\]\s*/g, '@')
              .replace(/\s*\(at\)\s*/g, '@')
              .replace(/\s*\[dot\]\s*/g, '.')
              .trim()
          )
          .find((m) => m.includes('@') && m.includes('.') && !m.includes('example.com') && !m.includes('sentry.io'));
        if (cleaned) email = cleaned;
      }
    }

    // ── Name extraction ─────────────────────────────────────────────────────
    const nameCandidates: string[] = [];

    // 1. Explicit label selectors used by many boards
    $('[class*="contact"], [class*="recruiter"], [class*="hiring"], [data-testid*="contact"]').each((_, el) => {
      const text = $(el).text().trim();
      const match = text.match(
        /(?:contact(?:persoon)?|recruiter|verantwoordelijke)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/i,
      );
      if (match) nameCandidates.push(match[1]);
    });

    // 2. Name adjacent to the extracted email address
    if (email && nameCandidates.length === 0) {
      const emailIndex = $('body').text().toLowerCase().indexOf(email);
      if (emailIndex > 0) {
        const surrounding = $('body').text().slice(Math.max(0, emailIndex - 120), emailIndex);
        const match = surrounding.match(/([A-Z][a-zé\-]+(?: [A-Z][a-zé\-]+){1,3})\s*$/i);
        if (match) nameCandidates.push(match[1]);
      }
    }

    // 3. Meta tags
    $('meta').each((_, el) => {
      const content = $(el).attr('content') || '';
      const match = content.match(
        /(?:contact|recruiter)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/i,
      );
      if (match) nameCandidates.push(match[1]);
    });

    // 4. Body text patterns
    const bodyText = $('body').text();
    const patterns = [
      /(?:contactpersoon|contact person|recruiter|hiring manager|verantwoordelijke)[:\s]+([A-Z][a-zé\-]+(?: [A-Z][a-zé\-]+){1,3})/gi,
      /Meer info(?:rmatie)?[^\n]*?(?:bij|contact)[:\s]+([A-Z][a-zé\-]+(?: [A-Z][a-zé\-]+){1,3})/gi,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(bodyText)) !== null) nameCandidates.push(m[1]);
    }

    // Deduplicate and pick first plausible name
    const seen = new Set<string>();
    let name = '';
    for (const c of nameCandidates) {
      const clean = c.trim();
      if (clean.length >= 4 && !seen.has(clean)) {
        name = clean;
        break;
      }
      seen.add(clean);
    }

    return { name, email };
  } catch {
    return { name: '', email: '' };
  }
}

/**
 * @deprecated Use scrapeContactInfo() instead.
 * Kept for backwards compatibility — wraps scrapeContactInfo and returns name only.
 */
export async function scrapeContactPerson(jobUrl: string): Promise<string> {
  const { name } = await scrapeContactInfo(jobUrl);
  return name;
}
