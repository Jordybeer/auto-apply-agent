import * as cheerio from 'cheerio';
import { assertSafeUrl } from './url-guard';

/**
 * Job boards that block direct HTTP fetches (bot detection, CAPTCHA, JS-only).
 * For these hosts we skip the direct fetch and go straight to Jina Reader.
 */
const JINA_ONLY_HOSTS = [
  'startpeople.be',
  'konvert.be',
  'vdab.be',
];

/**
 * Restrict Jina proxy targets to known job-board hosts.
 * This prevents user-provided URLs from turning Jina into a generic fetch proxy.
 */
function isAllowedJinaTargetHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return JINA_ONLY_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`))
    || host === 'adzuna.be'
    || host.endsWith('.adzuna.be');
}

/**
 * Resolves an Adzuna redirect URL to the actual job board URL.
 *
 * Adzuna's /land/ad/* tracking pages don't honor HEAD (some return 405, some
 * serve a meta-refresh HTML page instead of an HTTP redirect). We must GET,
 * follow HTTP redirects, then fall back to parsing meta-refresh / canonical
 * link from the body if we're still on adzuna afterward.
 */
export async function resolveRedirect(url: string): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
      },
    });
    let resolved = res.url && res.url !== url ? res.url : url;

    if (resolved.includes('adzuna.')) {
      const html = await res.text();
      const metaMatch = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"'>]+)/i);
      const canonMatch = html.match(/<link[^>]+rel=["']?canonical["']?[^>]+href=["']([^"']+)["']/i);
      const candidate = metaMatch?.[1] ?? canonMatch?.[1];
      if (candidate && !candidate.includes('adzuna.')) {
        try {
          resolved = new URL(candidate, resolved).toString();
        } catch {}
      }
    } else {
      try { res.body?.cancel(); } catch {}
    }
    clearTimeout(timer);
    return resolved;
  } catch {
    if (timer) clearTimeout(timer);
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
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return '';
  }
  if (!isAllowedJinaTargetHost(parsed.hostname)) {
    return '';
  }
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const headers: Record<string, string> = {
      'Accept': 'text/plain',
      'X-Return-Format': 'text',
    };
    // Use authenticated requests when available — bypasses Jina rate limits
    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
    }
    const res = await fetch(jinaUrl, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return '';
    const raw = await res.text();
    // Strip Jina metadata header lines (Title:, URL Source:, Published Time:, etc.)
    const lines = raw.split('\n');
    let start = 0;
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      if (/^(Title|URL Source|Published Time|Description|Keywords|X-Frame-Options|Content-Type):/i.test(lines[i])) {
        start = i + 1;
      }
    }
    while (start < lines.length && !lines[start].trim()) start++;
    return lines.slice(start).join('\n').trim();
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

    // Resolve Adzuna redirects — if it stays on adzuna, Jina handles it below
    if (jobUrl.includes('adzuna.')) {
      targetUrl = await resolveRedirect(jobUrl);
    }

    const isBlocked = JINA_ONLY_HOSTS.some(host => targetUrl.includes(host))
      || targetUrl.includes('adzuna.');

    if (isBlocked) {
      const jinaText = await fetchViaJina(targetUrl);
      return {
        description: jinaText.length > 150 ? jinaText.slice(0, 6000) : '',
        html: '',
      };
    }

    // 1. Direct fetch
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
function isSearchResultsPage(text: string): boolean {
  const lower = text.toLowerCase();
  const searchIndicators = [
    'meest gezochte jobs',
    'search results',
    'zoekresultaten',
    'vacatures gevonden',
    'resultaten voor',
    'jobs found',
  ];
  return searchIndicators.some(indicator => lower.includes(indicator));
}

export async function scrapeJobDescription(jobUrl: string): Promise<string> {
  const { description } = await scrapeJobDescriptionWithHtml(jobUrl);

  // Detect if we scraped a search/listing page instead of a job description
  if (description && isSearchResultsPage(description)) {
    return ''; // Return empty to trigger "please use specific job URL" error
  }

  return description;
}
