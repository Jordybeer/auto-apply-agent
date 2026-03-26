import * as cheerio from 'cheerio';

/**
 * Attempts to extract a contact person name from a job posting URL.
 * Returns an empty string if nothing useful is found or the fetch fails.
 * Keeps a tight timeout (5 s) so it never blocks the apply flow.
 */
export async function scrapeContactPerson(jobUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(jobUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoApplyBot/1.0)' },
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return '';
    const html = await res.text();
    const $ = cheerio.load(html);

    // Common patterns across Belgian/Dutch job boards
    const candidates: string[] = [];

    // 1. Explicit label selectors used by many boards
    $('[class*="contact"], [class*="recruiter"], [class*="hiring"], [data-testid*="contact"]').each((_, el) => {
      const text = $(el).text().trim();
      const match = text.match(/(?:contact(?:persoon)?|recruiter|verantwoordelijke)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/i);
      if (match) candidates.push(match[1]);
    });

    // 2. Scan meta tags (LinkedIn, Jobat, etc. use og:description or custom meta)
    $('meta').each((_, el) => {
      const content = $(el).attr('content') || '';
      const match = content.match(/(?:contact|recruiter)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/i);
      if (match) candidates.push(match[1]);
    });

    // 3. Generic name pattern near common labels in visible text
    const bodyText = $('body').text();
    const patterns = [
      /(?:contactpersoon|contact person|recruiter|hiring manager|verantwoordelijke)[:\s]+([A-Z][a-zé-]+(?: [A-Z][a-zé-]+){1,3})/gi,
      /Meer info(?:rmatie)?[^\n]*?(?:bij|contact)[:\s]+([A-Z][a-zé-]+(?: [A-Z][a-zé-]+){1,3})/gi,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(bodyText)) !== null) {
        candidates.push(m[1]);
      }
    }

    // Return the first plausible candidate, deduped
    const seen = new Set<string>();
    for (const c of candidates) {
      const clean = c.trim();
      if (clean.length >= 4 && !seen.has(clean)) return clean;
      seen.add(clean);
    }
    return '';
  } catch {
    return '';
  }
}
