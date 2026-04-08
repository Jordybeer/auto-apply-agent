import * as cheerio from 'cheerio';
import { assertSafeUrl } from './url-guard';

/**
 * Job boards that block direct HTTP fetches (bot detection, CAPTCHA, JS-only).
 * For these hosts we skip the direct fetch and go straight to Jina Reader.
 */
const JINA_ONLY_HOSTS = [
  'jobat.be',
  'stepstone.be',
  'stepstone.nl',
  'indeed.com',
  'vdab.be',
  'monster.be',
  'monster.com',
];

/**
 * Resolves an Adzuna redirect URL to the actual job board URL.
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

/** Fetch raw HTML with a realistic browser User-Agent. */
async function fetchHtml(targetUrl: string): Promise<string> {
  assertSafeUrl(targetUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return await res.text();
  } catch {
    clearTimeout(timer);
    return '';
  }
}

/** Fetch via Jina Reader (r.jina.ai) which returns clean markdown text. */
async function fetchViaJina(targetUrl: string): Promise<string> {
  assertSafeUrl(targetUrl);
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const text = await res.text();
    return text.trim();
  } catch {
    clearTimeout(timer);
    return '';
  }
}

/** Extract job description text from raw HTML using known selectors. */
function extractFromHtml(html: string): string {
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
      if (text.length > 150) return text.slice(0, 6000);
    }
  }

  let best = '';
  $('div, section').each((_, el) => {
    const text = $(el).clone().children('div, section').remove().end().text().replace(/\s+/g, ' ').trim();
    if (text.length > best.length) best = text;
  });
  return best.slice(0, 6000);
}

export async function scrapeJobDescriptionWithHtml(
  jobUrl: string,
): Promise<{ description: string; html: string }> {
  try {
    let targetUrl = jobUrl;
    if (jobUrl.includes('adzuna.be')) {
      targetUrl = await resolveRedirect(jobUrl);
    }
    if (targetUrl.includes('adzuna.be')) return { description: '', html: '' };

    const isBlocked = JINA_ONLY_HOSTS.some(host => targetUrl.includes(host));

    if (isBlocked) {
      // Skip direct fetch entirely — these boards block bots reliably.
      // Jina Reader handles them well and is faster than a doomed direct attempt.
      const jinaText = await fetchViaJina(targetUrl);
      return {
        description: jinaText.length > 150 ? jinaText.slice(0, 6000) : '',
        html: '',
      };
    }

    // 1. Direct fetch for all other hosts
    const html = await fetchHtml(targetUrl);
    let description = html ? extractFromHtml(html) : '';

    // 2. Jina fallback when direct fetch is blocked or yields too little
    if (!description || description.trim().length < 150) {
      const jinaText = await fetchViaJina(targetUrl);
      if (jinaText && jinaText.length > 150) {
        return { description: jinaText.slice(0, 6000), html };
      }
    }

    return { description, html };
  } catch {
    return { description: '', html: '' };
  }
}

/** Backwards-compatible wrapper — returns description string only. */
export async function scrapeJobDescription(jobUrl: string): Promise<string> {
  const { description } = await scrapeJobDescriptionWithHtml(jobUrl);
  return description;
}
