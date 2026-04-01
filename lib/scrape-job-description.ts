import * as cheerio from 'cheerio';

/**
 * Resolves an Adzuna redirect URL to the actual job board URL.
 * Exported so scrape-contact.ts and other modules can reuse it.
 */
export async function resolveRedirect(url: string): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoApplyBot/1.0)' },
    });
    clearTimeout(timer);
    return res.url && res.url !== url ? res.url : url;
  } catch {
    clearTimeout(timer);
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

    // fix: use explicit timer variable so clearTimeout is always called on every
    // exit path (early return on !res.ok, throw from res.text(), abort, etc.).
    // The old .finally() pattern only ran on the fetch promise itself, not on
    // subsequent awaits like res.text().
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let html = '';
    try {
      timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AutoApplyBot/1.0)',
          'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
        },
      });
      if (!res.ok) { clearTimeout(timer); return { description: '', html: '' }; }
      html = await res.text();
      clearTimeout(timer);
    } catch {
      clearTimeout(timer);
      return { description: '', html: '' };
    }

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
