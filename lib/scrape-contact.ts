import * as cheerio from 'cheerio';
import { resolveRedirect } from '@/lib/scrape-job-description';
import { assertSafeUrl } from '@/lib/url-guard';

export interface ContactInfo {
  name: string;
  email: string;
}

/** Fetch page HTML with Jina Reader fallback for bot-blocking sites. */
async function fetchPageHtml(targetUrl: string): Promise<string> {
  assertSafeUrl(targetUrl);
  // 1. Direct fetch with realistic browser headers
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let html = '';
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timer);
    if (res.ok) html = await res.text();
  } catch {
    clearTimeout(timer);
  }

  // 2. Jina fallback for bot-protected sites (jobat, stepstone, vdab)
  if (!html || html.trim().length < 200) {
    const jinaController = new AbortController();
    const jinaTimer = setTimeout(() => jinaController.abort(), 15000);
    try {
      const res = await fetch(`https://r.jina.ai/${targetUrl}`, {
        signal: jinaController.signal,
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
      });
      clearTimeout(jinaTimer);
      if (res.ok) html = await res.text();
    } catch {
      clearTimeout(jinaTimer);
    }
  }

  return html;
}

export async function scrapeContactInfo(
  jobUrl: string,
  prefetchedHtml?: string,
): Promise<ContactInfo> {
  try {
    let html = prefetchedHtml ?? '';

    if (!html) {
      let targetUrl = jobUrl;
      if (jobUrl.includes('adzuna.be')) {
        targetUrl = await resolveRedirect(jobUrl);
        if (targetUrl.includes('adzuna.be')) return { name: '', email: '' };
      }
      html = await fetchPageHtml(targetUrl);
      if (!html) return { name: '', email: '' };
    }

    const $ = cheerio.load(html);

    // ── Email extraction ─────────────────────────────────────────────────
    let email = '';
    $('a[href^="mailto:"]').each((_, el) => {
      if (email) return;
      const href = $(el).attr('href') || '';
      const extracted = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
      if (extracted.includes('@') && extracted.includes('.')) {
        email = extracted;
      }
    });

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

    // ── Name extraction ───────────────────────────────────────────────────
    const nameCandidates: string[] = [];

    $('[class*="contact"], [class*="recruiter"], [class*="hiring"], [data-testid*="contact"]').each((_, el) => {
      const text = $(el).text().trim();
      const match = text.match(
        /(?:contact(?:persoon)?|recruiter|verantwoordelijke)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/i,
      );
      if (match) nameCandidates.push(match[1]);
    });

    if (email && nameCandidates.length === 0) {
      const emailIndex = $('body').text().toLowerCase().indexOf(email);
      if (emailIndex > 0) {
        const surrounding = $('body').text().slice(Math.max(0, emailIndex - 120), emailIndex);
        const match = surrounding.match(/([A-Z][a-z\u00e9\-]+(?: [A-Z][a-z\u00e9\-]+){1,3})\s*$/i);
        if (match) nameCandidates.push(match[1]);
      }
    }

    $('meta').each((_, el) => {
      const content = $(el).attr('content') || '';
      const match = content.match(
        /(?:contact|recruiter)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/i,
      );
      if (match) nameCandidates.push(match[1]);
    });

    const bodyText = $('body').text();
    const patterns = [
      /(?:contactpersoon|contact person|recruiter|hiring manager|verantwoordelijke)[:\s]+([A-Z][a-z\u00e9\-]+(?: [A-Z][a-z\u00e9\-]+){1,3})/gi,
      /Meer info(?:rmatie)?[^\n]*?(?:bij|contact)[:\s]+([A-Z][a-z\u00e9\-]+(?: [A-Z][a-z\u00e9\-]+){1,3})/gi,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(bodyText)) !== null) nameCandidates.push(m[1]);
    }

    const seen = new Set<string>();
    let name = '';
    for (const c of nameCandidates) {
      const clean = c.trim();
      if (seen.has(clean)) continue;
      seen.add(clean);
      if (clean.length >= 4) {
        name = clean;
        break;
      }
    }

    return { name, email };
  } catch {
    return { name: '', email: '' };
  }
}

/**
 * @deprecated Use scrapeContactInfo() instead.
 */
export async function scrapeContactPerson(jobUrl: string): Promise<string> {
  const { name } = await scrapeContactInfo(jobUrl);
  return name;
}
