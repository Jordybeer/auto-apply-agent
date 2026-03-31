import * as cheerio from 'cheerio';

/**
 * Resolves an Adzuna redirect URL to the actual job board URL.
 * Exported so scrape-contact.ts and other modules can reuse it.
 */
export async function resolveRedirect(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoApplyBot/1.0)' },
    }).finally(() => clearTimeout(timeout));
    return res.url && res.url !== url ? res.url : url;
  } catch {
    return url;
  }
}

/**
 * Fetches the full job description from a listing URL.
 * Returns { description, html } so callers can reuse the fetched HTML
 * for contact extraction without a second HTTP request.
 */
export async function scrapeJobDescriptionWithHtml(
  jobUrl: string,
): Promise<{ description: string; html: string }> {
  try {
    let targetUrl = jobUrl;
    if (jobUrl.includes('adzuna.be')) {
      targetUrl = await resolveRedirect(jobUrl);
    }
    if (targetUrl.includes('adzuna.be')) return { description: '', html: '' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AutoApplyBot/1.0)',
        'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
      },
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return { description: '', html: '' };
    const html = await res.text();
    const $ = cheerio.load(html);

    $('script, style, nav, header, footer, [class*="cookie"], [class*="banner"], [class*="sidebar"], [class*="related"], [class*="recommended"]').remove();

    const SELECTORS = [
      '.job-detail__description', '.vacancy-description',
      '[class*="job-description"]', '[class*="jobDescription"]',
      '[id*="job-description"]', '[id*="jobDescription"]',
      '[data-testid="job-description"]', '[data-at="job-description"]',
      '.description__text', '.show-more-less-html__markup',
      '#jobDescriptionText', '.jobsearch-jobDescriptionText',
      'article', 'main', '[role="main"]',
    ];

    for (const sel of SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        const text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 150) return { description: text.slice(0, 5000), html };
      }
    }

    let best = '';
    $('div, section').each((_, el) => {
      const text = $(el).clone().children('div, section').remove().end().text().replace(/\s+/g, ' ').trim();
      if (text.length > best.length) best = text;
    });

    return { description: best.slice(0, 5000), html };
  } catch {
    return { description: '', html: '' };
  }
}

/**
 * Backwards-compatible wrapper — returns description string only.
 */
export async function scrapeJobDescription(jobUrl: string): Promise<string> {
  const { description } = await scrapeJobDescriptionWithHtml(jobUrl);
  return description;
}
