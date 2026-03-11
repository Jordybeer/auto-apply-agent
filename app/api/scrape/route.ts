import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

// Scraping multiple job boards (some with JS rendering) can exceed the default 60s.
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

async function handleScrape(request: Request) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === '1';
    const dryRun = url.searchParams.get('dryRun') === '1' || debug;

    // Protect cron (GET) runs if CRON_SECRET is set, but allow manual UI runs (POST).
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
      // Jobat: use /nl/jobs/results/... URLs (the old /nl/zoeken route returns 404)
      { url: 'https://www.jobat.be/nl/jobs/results/it-support/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/help-desk/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/medewerker-service-desk/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/supportmedewerker-ict/antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/jobs/results/technical-support/antwerpen', source: 'jobat' },

      { url: 'https://www.stepstone.be/jobs/it-support/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/helpdesk/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/service-desk/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/ict/in-antwerpen', source: 'stepstone' },

      { url: 'https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=Support&location=Antwerpen', source: 'ictjob' },
      { url: 'https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=Helpdesk&location=Antwerpen', source: 'ictjob' }
    ];

    const sourceParam = (url.searchParams.get('source') || '').toLowerCase();
    const sourceFilter: Source | '' =
      sourceParam === 'jobat' || sourceParam === 'stepstone' || sourceParam === 'ictjob' ? (sourceParam as Source) : '';

    const maxParam = parseInt(url.searchParams.get('max') || '', 10);
    const maxTargets = Number.isFinite(maxParam) && maxParam > 0 ? Math.min(maxParam, allTargets.length) : undefined;

    let targets: Target[];

    // Debug should never take long: default to a single request unless the user opts in.
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
        premium: 'true',
        // All three sources require JS rendering — Jobat is a React SPA that returns
        // an empty shell without it. Stepstone and ICTJob were already rendering.
        render: 'true'
      });

      // In debug mode, skip render unless the caller explicitly requests it (keeps it fast).
      if (debug && url.searchParams.get('render') !== '1') {
        params.delete('render');
      }

      const proxyUrl = `https://api.scraperapi.com/?${params.toString()}`;

      const controller = new AbortController();
      const timeoutMs = debug ? 10000 : 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(proxyUrl, { signal: controller.signal });
        const html = await res.text();
        clearTimeout(timeoutId);
        return {
          ok: res.ok,
          status: res.status,
          contentType: res.headers.get('content-type') || '',
          html,
          source: target.source,
          targetUrl: target.url
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        return {
          ok: false,
          status: 0,
          contentType: '',
          html: '',
          source: target.source,
          targetUrl: target.url,
          error: err?.message || String(err)
        };
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

        const backoffMs = Math.min(8000, 1000 * Math.pow(2, attempt));
        await sleep(backoffMs);
      }
      return fetchOnce(target);
    };

    const jobsToInsert: any[] = []
    const debugTargets: any[] = [];

    const delayParam = parseInt(url.searchParams.get('delayMs') || '', 10);
    const delayMs =
      Number.isFinite(delayParam) && delayParam >= 0
        ? Math.min(delayParam, 5000)
        : debug
          ? 0
          : 350;

    const maxRetries = debug ? 0 : 1;

    for (const target of targets) {
      const result = await fetchWithRetry(target, maxRetries);

      const { html, source } = result;
      const $ = cheerio.load(html || '');
      const beforeCount = jobsToInsert.length;

      if (source === 'jobat') {
        const seenUrls = new Set<string>();

        // Try multiple known Jobat card selectors (their markup changes between deploys).
        const nodes = $(
          '.job-item, [data-qa="job-item"], [class*="jobCard"], [class*="job-card"], article[class*="job"]'
        );

        nodes.each((i, el) => {
          // Accept any anchor pointing to a Jobat job detail page.
          const titleNode = $(el).find('a[href*="/job_"], a[href*="/vacature/"]').first();
          const urlPart = titleNode.attr('href') || '';
          if (!urlPart) return;

          const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);

          const title =
            $(el).find('h2, h3, [class*="title"]').first().text().trim() || titleNode.text().trim();
          if (!title) return;

          const company =
            $(el)
              .find('.job-item__company, [data-qa="job-company"], [class*="company"], [class*="employer"]')
              .first()
              .text()
              .trim() || 'Onbekend';
          const description =
            $(el)
              .find('.job-item__description, [data-qa="job-snippet"], [class*="description"], [class*="snippet"]')
              .first()
              .text()
              .trim() || '';

          jobsToInsert.push({
            source_id: makeSourceId('jobat', fullUrl),
            title,
            company,
            url: fullUrl,
            description,
            source
          });
        });

        // Broad fallback: any anchor to a Jobat job detail page.
        if (jobsToInsert.length === beforeCount) {
          $('a[href*="/job_"], a[href*="/vacature/"]').each((i, a) => {
            const href = $(a).attr('href') || '';
            if (!href) return;
            const fullUrl = href.startsWith('http') ? href : `https://www.jobat.be${href}`;
            if (seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);

            const parent = $(a).closest('article, li, div[class*="job"], div[class*="card"]');
            const title =
              parent.find('h2, h3, [class*="title"]').first().text().trim() || $(a).text().trim();
            if (!title) return;

            const company =
              parent
                .find('[class*="company"], [class*="employer"], [data-qa="job-company"]')
                .first()
                .text()
                .trim() || 'Onbekend';

            jobsToInsert.push({
              source_id: makeSourceId('jobat', fullUrl),
              title,
              company,
              url: fullUrl,
              description: '',
              source
            });
          });
        }
      }

      if (source === 'stepstone') {
        // Stepstone uses hashed/generated class names — rely on data attributes and semantics.
        const cards = $(
          'article, [data-qa="job-teaser"], [data-at="job-item"], [data-testid="job-item"], [class*="JobCard"], [class*="job-teaser"]'
        );
        cards.each((i, el) => {
          const link = $(el).find('a[href]').first();
          const title =
            $(el).find('h2, h3, [data-qa="job-title"], [data-at="job-title"]').first().text().trim() ||
            link.text().trim();
          const urlPart = link.attr('href') || '';
          const company =
            $(el)
              .find('[data-qa="job-company-name"], [data-at="job-company"], [class*="company"]')
              .first()
              .text()
              .trim() || 'Onbekend';
          const description =
            $(el)
              .find('[data-qa="job-snippet"], [class*="snippet"], [class*="description"]')
              .first()
              .text()
              .trim() || '';

          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
            jobsToInsert.push({
              source_id: makeSourceId('stepstone', fullUrl),
              title,
              company,
              url: fullUrl,
              description,
              source
            });
          }
        });
      }

      if (source === 'ictjob') {
        // ICTJob uses stable BEM-style classes.
        $(
          '.search-item, article.job, .job-card, [data-qa="job"], li[class*="job"], div[class*="vacancy"]'
        ).each((i, el) => {
          const titleNode = $(el).find('a[href]').first();
          const title =
            $(el).find('.job-title, h2, h3, [class*="title"]').text().trim() || titleNode.text().trim();
          const urlPart = titleNode.attr('href') || '';
          const company =
            $(el).find('.job-company, [class*="company"]').text().trim() || 'Onbekend';
          const description =
            $(el).find('.job-keywords, .job-snippet, [class*="description"]').text().trim() || '';

          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.ictjob.be${urlPart}`;
            jobsToInsert.push({
              source_id: makeSourceId('ictjob', fullUrl),
              title,
              company,
              url: fullUrl,
              description,
              source
            });
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

      if (delayMs > 0) {
        await sleep(delayMs);
      }
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
      return NextResponse.json({
        success: true,
        count: 0,
        message: 'Scraped 0 jobs. Geen nieuwe vacatures gevonden voor deze criteria.'
      });
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        total_unique: uniqueJobs.length
      });
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
