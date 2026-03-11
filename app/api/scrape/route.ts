import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

export const maxDuration = 300;

type Source = 'jobat' | 'stepstone' | 'ictjob';
type Target = { url: string; source: Source };

type FetchResult = {
  ok: boolean;
  status: number;
  contentType: string;
  html: string;
  source: Source;
  targetUrl: string;
  error?: string;
  attempt?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const hashId = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 24);
const makeSourceId = (source: Source, url: string) => `${source}-${hashId(url)}`;

// Title-level filter — only keep jobs whose title matches at least one of these terms.
const TITLE_KEYWORDS = [
  'software support',
  'it helpdesk',
  'it help desk',
  'helpdesk',
  'help desk',
  'support engineer',
  'application support',
  'applicatiebeheerder',
  'functioneel beheerder',
];

function titleMatches(title: string): boolean {
  const lower = title.toLowerCase();
  return TITLE_KEYWORDS.some((kw) => lower.includes(kw));
}

async function handleScrape(request: Request) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === '1';
    const dryRun = url.searchParams.get('dryRun') === '1' || debug;

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && request.method === 'GET') {
      const provided = request.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
      if (provided !== cronSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
    if (!SCRAPER_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Missing SCRAPER_API_KEY in environment variables.' },
        { status: 400 }
      );
    }

    const allTargets: Target[] = [
      // Jobat
      { url: 'https://www.jobat.be/nl/jobs/results/software-support/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/it-helpdesk/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/support-engineer/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/applicatiebeheerder/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/functioneel-beheerder/antwerpen', source: 'jobat' },

      // Stepstone
      { url: 'https://www.stepstone.be/jobs/software-support/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/it-helpdesk/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/support-engineer/in-antwerpen', source: 'stepstone' },

      // ICTJob
      { url: 'https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=Software+Support&location=Antwerpen', source: 'ictjob' },
      { url: 'https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=IT+Helpdesk&location=Antwerpen', source: 'ictjob' },
      { url: 'https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=Support+Engineer&location=Antwerpen', source: 'ictjob' },
    ];

    const sourceParam = (url.searchParams.get('source') || '').toLowerCase();
    const sourceFilter: Source | '' =
      sourceParam === 'jobat' || sourceParam === 'stepstone' || sourceParam === 'ictjob' ? (sourceParam as Source) : '';

    const maxParam = parseInt(url.searchParams.get('max') || '', 10);
    const maxTargets = Number.isFinite(maxParam) && maxParam > 0 ? Math.min(maxParam, allTargets.length) : undefined;

    let targets: Target[];
    if (debug && !sourceFilter && !maxTargets) {
      targets = [allTargets[0]];
    } else {
      targets = sourceFilter ? allTargets.filter((t) => t.source === sourceFilter) : [...allTargets];
      if (maxTargets) targets = targets.slice(0, maxTargets);
    }

    const fetchOnce = async (target: Target): Promise<FetchResult> => {
      const params = new URLSearchParams({
        api_key: SCRAPER_API_KEY,
        url: target.url,
        render_js: 'true'
      });

      if (debug && url.searchParams.get('render') !== '1') {
        params.delete('render_js');
      }

      const proxyUrl = `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
      const controller = new AbortController();
      const timeoutMs = debug ? 10000 : 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(proxyUrl, { signal: controller.signal });
        const html = await res.text();
        clearTimeout(timeoutId);
        return { ok: res.ok, status: res.status, contentType: res.headers.get('content-type') || '', html, source: target.source, targetUrl: target.url };
      } catch (err: any) {
        clearTimeout(timeoutId);
        return { ok: false, status: 0, contentType: '', html: '', source: target.source, targetUrl: target.url, error: err?.message || String(err) };
      }
    };

    const fetchWithRetry = async (target: Target, maxRetries: number): Promise<FetchResult> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await fetchOnce(target);
        result.attempt = attempt + 1;
        const is429 = result.status === 429;
        const isTransientZero = result.status === 0;
        if (!is429 && !isTransientZero) return result;
        if (attempt === maxRetries) return result;
        await sleep(Math.min(8000, 1000 * Math.pow(2, attempt)));
      }
      return fetchOnce(target);
    };

    const jobsToInsert: any[] = [];
    const debugTargets: any[] = [];

    const delayParam = parseInt(url.searchParams.get('delayMs') || '', 10);
    const delayMs = Number.isFinite(delayParam) && delayParam >= 0 ? Math.min(delayParam, 5000) : debug ? 0 : 350;
    const maxRetries = debug ? 0 : 1;

    for (const target of targets) {
      const result = await fetchWithRetry(target, maxRetries);
      const { html, source } = result;
      const $ = cheerio.load(html || '');
      const beforeCount = jobsToInsert.length;

      const pushJob = (job: { title: string; company: string; url: string; description: string }) => {
        if (!titleMatches(job.title)) return;
        jobsToInsert.push({ source_id: makeSourceId(source, job.url), ...job, source });
      };

      if (source === 'jobat') {
        const seenUrls = new Set<string>();
        const nodes = $('.job-item, [data-qa="job-item"], [class*="jobCard"], [class*="job-card"], article[class*="job"]');

        nodes.each((i, el) => {
          const titleNode = $(el).find('a[href*="/job_"], a[href*="/vacature/"]').first();
          const urlPart = titleNode.attr('href') || '';
          if (!urlPart) return;
          const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);
          const title = $(el).find('h2, h3, [class*="title"]').first().text().trim() || titleNode.text().trim();
          if (!title) return;
          const company = $(el).find('.job-item__company, [data-qa="job-company"], [class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
          const description = $(el).find('.job-item__description, [data-qa="job-snippet"], [class*="description"], [class*="snippet"]').first().text().trim() || '';
          pushJob({ title, company, url: fullUrl, description });
        });

        if (jobsToInsert.length === beforeCount) {
          $('a[href*="/job_"], a[href*="/vacature/"]').each((i, a) => {
            const href = $(a).attr('href') || '';
            if (!href) return;
            const fullUrl = href.startsWith('http') ? href : `https://www.jobat.be${href}`;
            if (seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);
            const parent = $(a).closest('article, li, div[class*="job"], div[class*="card"]');
            const title = parent.find('h2, h3, [class*="title"]').first().text().trim() || $(a).text().trim();
            if (!title) return;
            const company = parent.find('[class*="company"], [class*="employer"], [data-qa="job-company"]').first().text().trim() || 'Onbekend';
            pushJob({ title, company, url: fullUrl, description: '' });
          });
        }
      }

      if (source === 'stepstone') {
        const cards = $('article, [data-qa="job-teaser"], [data-at="job-item"], [data-testid="job-item"], [class*="JobCard"], [class*="job-teaser"]');
        cards.each((i, el) => {
          const link = $(el).find('a[href]').first();
          const title = $(el).find('h2, h3, [data-qa="job-title"], [data-at="job-title"]').first().text().trim() || link.text().trim();
          const urlPart = link.attr('href') || '';
          const company = $(el).find('[data-qa="job-company-name"], [data-at="job-company"], [class*="company"]').first().text().trim() || 'Onbekend';
          const description = $(el).find('[data-qa="job-snippet"], [class*="snippet"], [class*="description"]').first().text().trim() || '';
          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
            pushJob({ title, company, url: fullUrl, description });
          }
        });
      }

      if (source === 'ictjob') {
        $('.search-item, article.job, .job-card, [data-qa="job"], li[class*="job"], div[class*="vacancy"]').each((i, el) => {
          const titleNode = $(el).find('a[href]').first();
          const title = $(el).find('.job-title, h2, h3, [class*="title"]').text().trim() || titleNode.text().trim();
          const urlPart = titleNode.attr('href') || '';
          const company = $(el).find('.job-company, [class*="company"]').text().trim() || 'Onbekend';
          const description = $(el).find('.job-keywords, .job-snippet, [class*="description"]').text().trim() || '';
          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.ictjob.be${urlPart}`;
            pushJob({ title, company, url: fullUrl, description });
          }
        });
      }

      const extracted = jobsToInsert.length - beforeCount;

      if (debug) {
        debugTargets.push({
          source: result.source,
          url: result.targetUrl,
          ok: result.ok,
          status: result.status,
          contentType: result.contentType,
          htmlBytes: (result.html || '').length,
          extracted,
          attempt: result.attempt,
          error: result.error,
          snippet: (result.html || '').slice(0, 800)
        });
      }

      if (delayMs > 0) await sleep(delayMs);
    }

    const uniqueJobs = Array.from(new Map(jobsToInsert.map((item) => [item.source_id, item])).values());

    if (debug) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        total_extracted: jobsToInsert.length,
        total_unique: uniqueJobs.length,
        delayMs,
        targets: debugTargets,
        hint: 'Debug skips render by default (fast). Add &render=1 to force JS rendering. Use ?source=jobat|stepstone|ictjob&max=N to narrow scope.'
      });
    }

    if (uniqueJobs.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'Scraped 0 jobs. Geen nieuwe vacatures gevonden voor deze criteria.' });
    }

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, total_unique: uniqueJobs.length });
    }

    const { data, error } = await supabase
      .from('jobs')
      .upsert(uniqueJobs, { onConflict: 'source_id', ignoreDuplicates: true })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, count: data ? data.length : 0, total_found: uniqueJobs.length });
  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleScrape(request);
}

export async function POST(request: Request) {
  return handleScrape(request);
}
