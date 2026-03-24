import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';

export const maxDuration = 300;

type Source = 'jobat' | 'stepstone' | 'ictjob' | 'vdab' | 'indeed';
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
  // expanded keywords
  'servicedesk',
  'service desk',
  'it support',
  '1st line',
  '2nd line',
  'first line',
  'second line',
  'technisch support',
  'ict support',
  'desktop support',
  'field support',
  'end user support',
  'deskside support',
];

const ALLOWED_REGIONS = [
  'antwerpen', 'antwerp', 'mechelen', 'lier', 'turnhout', 'herentals',
  'geel', 'mol', 'boom', 'willebroek', 'kontich', 'mortsel', 'berchem',
  'deurne', 'hoboken', 'merksem', 'schoten', 'wijnegem', 'wommelgem',
  'remote', 'thuis', 'thuiswerk', 'hybrid', 'hybride',
];

function titleMatches(title: string, keywords: string[]): boolean {
  const lower = title.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function locationMatches(location: string, description: string, jobUrl: string): boolean {
  // Check dedicated location field first, then fall back to description + url
  const locationLower = location.toLowerCase();
  if (locationLower && ALLOWED_REGIONS.some((r) => locationLower.includes(r))) return true;
  // If no location extracted, fall back to description + url (looser check)
  if (!locationLower) {
    const fallback = `${description} ${jobUrl}`.toLowerCase();
    return ALLOWED_REGIONS.some((r) => fallback.includes(r));
  }
  return false;
}

function buildTargets(keywords: string[], city: string, radius: number): Target[] {
  const targets: Target[] = [];
  const citySlug = city.toLowerCase().replace(/\s+/g, '-');
  for (const kw of keywords) {
    const slug = kw.replace(/\s+/g, '-');
    const encoded = kw.split(/\s+/).map(encodeURIComponent).join('+');
    targets.push(
      { url: `https://www.jobat.be/nl/jobs/results/${slug}/${citySlug}`, source: 'jobat' },
      { url: `https://www.stepstone.be/jobs/${slug}/in-${citySlug}`, source: 'stepstone' },
      { url: `https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=${encoded}&location=${encodeURIComponent(city)}`, source: 'ictjob' },
      { url: `https://www.vdab.be/vindeenjob/vacatures?sort=date&lang=nl&zoekopdracht=${encoded}&gemeente=${encodeURIComponent(city)}&straal=${radius}`, source: 'vdab' },
      { url: `https://be.indeed.com/jobs?q=${encoded}&l=${encodeURIComponent(city)}&radius=${radius}&sort=date&lang=nl`, source: 'indeed' }
    );
  }
  return targets;
}

async function handleScrape(request: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === '1';
    const dryRun = url.searchParams.get('dryRun') === '1' || debug;
    const strictLocation = url.searchParams.get('strictLocation') !== '0';

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && request.method === 'GET') {
      const provided = request.headers.get('x-cron-secret') || url.searchParams.get('secret') || '';
      if (provided !== cronSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { data: { user } } = await supabase.auth.getUser();

    let SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
    let userKeywords: string[] = [];
    let userCity = 'Antwerpen';
    let userRadius = 30;

    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('scrape_api_key, keywords, city, radius')
        .eq('user_id', user.id)
        .single();

      if (settings?.scrape_api_key) SCRAPER_API_KEY = settings.scrape_api_key;
      if (settings?.keywords?.length) userKeywords = settings.keywords;
      if (settings?.city) userCity = settings.city;
      if (settings?.radius) userRadius = settings.radius;

      await supabase
        .from('user_settings')
        .update({ last_scrape_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    if (!SCRAPER_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Missing SCRAPER_API_KEY. Voeg een API key toe in je instellingen.' },
        { status: 400 }
      );
    }

    const tagsParam = url.searchParams.get('tags') || '';
    const customTags = tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const activeKeywords = customTags.length > 0 ? customTags : userKeywords.length > 0 ? userKeywords : TITLE_KEYWORDS;

    const allTargets: Target[] = buildTargets(activeKeywords, userCity, userRadius);

    const sourceParam = (url.searchParams.get('source') || '').toLowerCase();
    const sourceFilter: Source | '' =
      ['jobat', 'stepstone', 'ictjob', 'vdab', 'indeed'].includes(sourceParam) ? (sourceParam as Source) : '';

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
      const renderJs = !(debug && url.searchParams.get('render') !== '1');
      const params = new URLSearchParams({ token: SCRAPER_API_KEY!, url: target.url });
      if (renderJs) params.set('render', 'true');

      const proxyUrl = `https://api.scrape.do?${params.toString()}`;
      const controller = new AbortController();
      const timeoutMs = debug ? 10000 : 45000;
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
        if (result.status !== 429 && result.status !== 0) return result;
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

    const processTarget = async (target: Target) => {
      const result = await fetchWithRetry(target, maxRetries);
      const { html, source } = result;
      const $ = cheerio.load(html || '');
      const localJobs: any[] = [];

      const pushJob = (job: { title: string; company: string; url: string; location: string; description: string }) => {
        if (!titleMatches(job.title, activeKeywords)) return;
        if (strictLocation) {
          if (!locationMatches(job.location, job.description, job.url)) return;
        }
        localJobs.push({ source_id: makeSourceId(source, job.url), ...job, source });
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
          const location = $(el).find('[class*="location"], [class*="plaats"], [class*="gemeente"], [data-qa="job-location"]').first().text().trim() || '';
          const description = $(el).find('.job-item__description, [data-qa="job-snippet"], [class*="description"], [class*="snippet"]').first().text().trim() || '';
          pushJob({ title, company, url: fullUrl, location, description });
        });

        if (localJobs.length === 0) {
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
            const location = parent.find('[class*="location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
            pushJob({ title, company, url: fullUrl, location, description: '' });
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
          const location = $(el).find('[data-qa="job-location"], [data-at="job-location"], [class*="location"]').first().text().trim() || '';
          const description = $(el).find('[data-qa="job-snippet"], [class*="snippet"], [class*="description"]').first().text().trim() || '';
          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
            pushJob({ title, company, url: fullUrl, location, description });
          }
        });
      }

      if (source === 'ictjob') {
        $('.search-item, article.job, .job-card, [data-qa="job"], li[class*="job"], div[class*="vacancy"]').each((i, el) => {
          const titleNode = $(el).find('a[href]').first();
          const title = $(el).find('.job-title, h2, h3, [class*="title"]').text().trim() || titleNode.text().trim();
          const urlPart = titleNode.attr('href') || '';
          const company = $(el).find('.job-company, [class*="company"]').text().trim() || 'Onbekend';
          const location = $(el).find('.job-location, [class*="location"], [class*="plaats"]').text().trim() || '';
          const description = $(el).find('.job-keywords, .job-snippet, [class*="description"]').text().trim() || '';
          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.ictjob.be${urlPart}`;
            pushJob({ title, company, url: fullUrl, location, description });
          }
        });
      }

      if (source === 'vdab') {
        $('article.vacancy, [class*="vacancy-item"], [class*="vacature"], li[class*="vacancy"], div[class*="vacancy-card"]').each((i, el) => {
          const titleNode = $(el).find('a[href*="/vindeenjob/"], a[href*="/vacature"]').first();
          const urlPart = titleNode.attr('href') || '';
          const title = $(el).find('h2, h3, [class*="title"], .vacancy-title').first().text().trim() || titleNode.text().trim();
          const company = $(el).find('[class*="company"], [class*="employer"], .vacancy-employer').first().text().trim() || 'Onbekend';
          const location = $(el).find('[class*="location"], [class*="gemeente"], [class*="plaats"], .vacancy-location').first().text().trim() || '';
          const description = $(el).find('[class*="description"], [class*="snippet"], .vacancy-description').first().text().trim() || '';
          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.vdab.be${urlPart}`;
            pushJob({ title, company, url: fullUrl, location, description });
          }
        });

        if (localJobs.length === 0) {
          const seenUrls = new Set<string>();
          $('a[href*="/vindeenjob/vacatures/"]').each((i, a) => {
            const href = $(a).attr('href') || '';
            if (!href) return;
            const fullUrl = href.startsWith('http') ? href : `https://www.vdab.be${href}`;
            if (seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);
            const parent = $(a).closest('article, li, div');
            const title = parent.find('h2, h3, [class*="title"]').first().text().trim() || $(a).text().trim();
            if (!title) return;
            const company = parent.find('[class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
            const location = parent.find('[class*="location"], [class*="gemeente"], [class*="plaats"]').first().text().trim() || '';
            pushJob({ title, company, url: fullUrl, location, description: '' });
          });
        }
      }

      if (source === 'indeed') {
        $('.job_seen_beacon, [data-testid="job-card"], .resultContent').each((i, el) => {
          const titleNode = $(el).find('h2.jobTitle a, [data-testid="job-title"] a, h2 a').first();
          const urlPart = titleNode.attr('href') || '';
          const title = titleNode.find('span').first().text().trim() || titleNode.text().trim();
          const company = $(el).find('[data-testid="company-name"]').text().trim() || 'Onbekend';
          const location = $(el).find('[data-testid="text-location"]').text().trim() || '';
          const description = $(el).find('.job-snippet, [data-testid="job-snippet"]').text().trim() || '';
          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://be.indeed.com${urlPart}`;
            pushJob({ title, company, url: fullUrl, location, description });
          }
        });
      }

      if (debug) {
        debugTargets.push({
          source: result.source,
          url: result.targetUrl,
          ok: result.ok,
          status: result.status,
          contentType: result.contentType,
          htmlBytes: (result.html || '').length,
          extracted: localJobs.length,
          attempt: result.attempt,
          error: result.error,
          snippet: (result.html || '').slice(0, 800),
        });
      }

      return localJobs;
    };

    const targetsBySource = targets.reduce<Record<string, Target[]>>((acc, t) => {
      (acc[t.source] ||= []).push(t);
      return acc;
    }, {});

    const allResults = await Promise.all(
      Object.values(targetsBySource).map(async (sourceTargets) => {
        const sourceJobs: any[] = [];
        for (let i = 0; i < sourceTargets.length; i++) {
          const jobs = await processTarget(sourceTargets[i]);
          sourceJobs.push(...jobs);
          if (delayMs > 0 && i < sourceTargets.length - 1) await sleep(delayMs);
        }
        return sourceJobs;
      })
    );

    allResults.forEach((jobs) => jobsToInsert.push(...jobs));

    const uniqueJobs = Array.from(new Map(jobsToInsert.map((item) => [item.source_id, item])).values());

    if (debug) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        total_extracted: jobsToInsert.length,
        total_unique: uniqueJobs.length,
        delayMs,
        strictLocation,
        targets: debugTargets,
        hint: 'Debug skips render by default (fast). Add &render=1 to force JS rendering. Add &strictLocation=0 to disable region filter.',
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

export async function GET(request: Request) { return handleScrape(request); }
export async function POST(request: Request) { return handleScrape(request); }
