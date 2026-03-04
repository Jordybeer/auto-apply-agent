import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';
import * as cheerio from 'cheerio';

export const maxDuration = 60;

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

async function handleScrape(request: Request) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === '1';
    const dryRun = url.searchParams.get('dryRun') === '1' || debug;

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
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
      { url: 'https://www.jobat.be/nl/zoeken?q=IT%20Support&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=Helpdesk&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=Service%20Desk&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=ICT%20Medewerker&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=1st%20Line&l=Antwerpen&radius=20', source: 'jobat' },
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
    const maxTargets = Number.isFinite(maxParam) && maxParam > 0 ? Math.min(maxParam, 11) : undefined;

    let targets: Target[];
    if (debug && !sourceFilter && !maxTargets) {
      const pickFirst = (s: Source) => allTargets.find((t) => t.source === s)!;
      targets = [pickFirst('jobat'), pickFirst('stepstone'), pickFirst('ictjob')];
    } else {
      targets = sourceFilter ? allTargets.filter((t) => t.source === sourceFilter) : [...allTargets];
      if (maxTargets) targets = targets.slice(0, maxTargets);
    }

    const fetchOnce = async (target: Target): Promise<FetchResult> => {
      const params = new URLSearchParams({
        api_key: SCRAPER_API_KEY,
        url: target.url,
        premium: 'true'
      });

      if (target.source !== 'jobat') {
        params.set('render', 'true');
      }
      if (debug && url.searchParams.get('render') === '1') {
        params.set('render', 'true');
      }

      const proxyUrl = `https://api.scraperapi.com/?${params.toString()}`;

      const controller = new AbortController();
      const timeoutMs = debug ? 20000 : 30000;
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

    const jobsToInsert: any[] = [];
    const debugTargets: any[] = [];

    // If your ScraperAPI plan has concurrency=1, Promise.all will trigger 429.
    // So we do strict sequential requests with a small delay.
    const delayParam = parseInt(url.searchParams.get('delayMs') || '', 10);
    const delayMs = Number.isFinite(delayParam) && delayParam >= 0 ? Math.min(delayParam, 5000) : debug ? 800 : 350;
    const maxRetries = debug ? 2 : 1;

    for (const target of targets) {
      const result = await fetchWithRetry(target, maxRetries);

      const { html, source } = result;
      const $ = cheerio.load(html || '');
      const beforeCount = jobsToInsert.length;

      if (source === 'jobat') {
        const nodes = $('.job-item, .job-item__title, [data-qa="job-item"], article');
        if (nodes.length) {
          nodes.each((i, el) => {
            const titleNode = $(el).find('a').first();
            const title = titleNode.text().trim();
            const urlPart = titleNode.attr('href') || '';
            const company = $(el).find('.job-item__company, [data-qa="job-company"]').text().trim() || 'Onbekend';
            const description = $(el).find('.job-item__description, [data-qa="job-snippet"]').text().trim() || '';

            if (title && urlPart) {
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
              jobsToInsert.push({
                source_id: `jobat-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
                title,
                company,
                url: fullUrl,
                description,
                source
              });
            }
          });
        } else {
          $('a[href]').each((i, a) => {
            const href = $(a).attr('href') || '';
            const title = $(a).text().trim();
            if (!href || !title) return;
            if (!href.includes('/jobs/') && !href.includes('/vacatures/')) return;

            const fullUrl = href.startsWith('http') ? href : `https://www.jobat.be${href}`;
            jobsToInsert.push({
              source_id: `jobat-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
              title,
              company: 'Onbekend',
              url: fullUrl,
              description: '',
              source
            });
          });
        }
      }

      if (source === 'stepstone') {
        const cards = $('article, [data-qa="job-teaser"], [data-at="job-item"], [data-qa="result-list"] article');
        cards.each((i, el) => {
          const link = $(el).find('a[href]').first();
          const title = $(el).find('h2').first().text().trim() || link.text().trim();
          const urlPart = link.attr('href') || '';
          const company = $(el).find('[data-qa="job-company-name"], .res-11j246r').first().text().trim() || 'Onbekend';
          const description = $(el).find('[data-qa="job-snippet"], .res-1a22uog').first().text().trim() || '';

          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
            jobsToInsert.push({
              source_id: `stepstone-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
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
        $('.search-item, article, .job-card, [data-qa="job"]')
          .each((i, el) => {
            const titleNode = $(el).find('a[href]').first();
            const title = $(el).find('.job-title').text().trim() || titleNode.text().trim();
            const urlPart = titleNode.attr('href') || '';
            const company = $(el).find('.job-company').text().trim() || 'Onbekend';
            const description = $(el).find('.job-keywords, .job-snippet').text().trim() || '';

            if (title && urlPart) {
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.ictjob.be${urlPart}`;
              jobsToInsert.push({
                source_id: `ictjob-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
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
          snippet: (result.html || '').slice(0, 400)
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
        hint: 'Use ?source=jobat|stepstone|ictjob&max=1..11 (and optionally &render=1). If you see 429, increase ?delayMs=1500.'
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
