import * as cheerio from 'cheerio';

/**
 * Resolves an Adzuna redirect URL to the actual job board URL.
 * Adzuna detail pages (/details/ and /land/ad/) show only ~500 chars behind a JS "read more".
 * We follow the redirect chain and return the final destination URL.
 */
async function resolveRedirect(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoApplyBot/1.0)' },
    }).finally(() => clearTimeout(timeout));
    // res.url is the final URL after all redirects
    return res.url && res.url !== url ? res.url : url;
  } catch {
    return url;
  }
}

/**
 * Fetches the full job description from a listing URL.
 * If the URL is an Adzuna page, it first follows the redirect to the real job board.
 * Returns empty string on failure — never throws.
 * Timeout: 8 s per request.
 */
export async function scrapeJobDescription(jobUrl: string): Promise<string> {
  try {
    // Follow Adzuna redirects to land on the actual job board page
    let targetUrl = jobUrl;
    if (jobUrl.includes('adzuna.be')) {
      targetUrl = await resolveRedirect(jobUrl);
    }

    // If we're still on adzuna.be after redirect, skip — JS-gated page
    if (targetUrl.includes('adzuna.be')) return '';

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

    if (!res.ok) return '';
    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove noise
    $('script, style, nav, header, footer, [class*="cookie"], [class*="banner"], [class*="sidebar"], [class*="related"], [class*="recommended"]').remove();

    // Priority selectors — ordered from most specific to most generic
    const SELECTORS = [
      // Jobat
      '.job-detail__description',
      '.vacancy-description',
      '[class*="job-description"]',
      '[class*="jobDescription"]',
      '[id*="job-description"]',
      '[id*="jobDescription"]',
      // StepStone / Jobsite
      '[data-testid="job-description"]',
      '[data-at="job-description"]',
      // LinkedIn
      '.description__text',
      '.show-more-less-html__markup',
      // Indeed
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      // Generic fallbacks
      'article',
      'main',
      '[role="main"]',
    ];

    for (const sel of SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        const text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 150) return text.slice(0, 5000);
      }
    }

    // Last resort: find the largest block of text on the page
    let best = '';
    $('div, section').each((_, el) => {
      const text = $(el).clone().children('div, section').remove().end().text().replace(/\s+/g, ' ').trim();
      if (text.length > best.length) best = text;
    });

    return best.slice(0, 5000);
  } catch {
    return '';
  }
}
