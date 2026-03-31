import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { scrapeJobDescription } from '@/lib/scrape-job-description';

export const maxDuration = 120;

type HtmlSource = 'jobat' | 'stepstone';

const hashId = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 24);
const makeSourceId = (source: string, id: string) => `${source}-${hashId(id)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TITLE_KEYWORDS = [
  'software support', 'it helpdesk', 'it help desk', 'helpdesk', 'help desk',
  'support engineer', 'application support', 'applicatiebeheerder', 'functioneel beheerder',
  'servicedesk', 'service desk', 'it support', '1st line', '2nd line', 'first line', 'second line',
  'technisch support', 'ict support', 'desktop support', 'field support', 'end user support', 'deskside support',
];

/**
 * fix: Normalise bilingual title separators before matching.
 * Adzuna Belgium returns titles like "IT Support Medewerker / Collaborateur Support IT"
 * or "Helpdesk Medewerker|Support Analist". Without normalisation, word-boundary
 * checks against the raw title miss keywords that straddle a separator.
 */
function normTitle(title: string): string {
  return title.toLowerCase().replace(/[\/|\u2022\u00b7]/g, ' ');
}

function titleMatches(title: string, keywords: string[]): boolean {
  const lower = normTitle(title);
  return keywords.some((kw) => {
    const kwLower = kw.toLowerCase();
    if (lower.includes(kwLower)) return true;
    const words = kwLower.split(/\s+/).filter((w) => w.length > 2);
    return words.length >= 2 && words.every((w) => lower.includes(w));
  });
}

// ─── Adzuna ───────────────────────────────────────────────────────────────────

async function fetchAdzuna(
  keyword: string,
  location: string,
  distanceKm: number,
  appId: string,
  appKey: string,
  page = 1,
): Promise<any[]> {
  const distanceMiles = Math.ceil(distanceKm * 0.621371);
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: '50',
    what: keyword,
    where: location,
    distance: String(distanceMiles),
    sort_by: 'date',
    'content-type': 'application/json',
  });
  const url = `https://api.adzuna.com/v1/api/jobs/be/search/${page}?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Adzuna HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.results ?? [];
}

// ─── scrape.do HTML scraping (Jobat + Stepstone) ─────────────────────────────

async function fetchViaScrapesDo(targetUrl: string, scrapeDoToken: string): Promise<string> {
  const params = new URLSearchParams({ token: scrapeDoToken, url: targetUrl });
  const proxyUrl = `https://api.scrape.do?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(proxyUrl, { signal: controller.signal });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build scrape targets for Jobat and Stepstone.
 * One URL pair per keyword (matching Adzuna batching) so results aren't
 * diluted by over-long AND-joined query strings.
 * Cap at 5 keywords for HTML sources to keep scrape.do usage reasonable.
 */
function buildHtmlTargets(
  keywords: string[],
  city: string,
  radius: number,
): Array<{ url: string; source: HtmlSource; keyword: string }> {
  const cityEncoded = encodeURIComponent(city);
  const targets: Array<{ url: string; source: HtmlSource; keyword: string }> = [];

  // Cap at 5 to avoid burning scrape.do quota on large keyword lists
  const capped = keywords.slice(0, 5);

  for (const keyword of capped) {
    const encoded = encodeURIComponent(keyword);
    targets.push(
      {
        url: `https://www.jobat.be/nl/jobs?keywords=${encoded}&municipality=${cityEncoded}&radius=${radius}`,
        source: 'jobat',
        keyword,
      },
      {
        url: `https://www.stepstone.be/nl/vacatures/?q=${encoded}&where=${cityEncoded}&radius=${radius}`,
        source: 'stepstone',
        keyword,
      },
    );
  }

  return targets;
}

function parseJobatJobs(
  html: string,
  activeKeywords: string[],
): Array<{ title: string; company: string; url: string; location: string; description: string; source: string; source_id: string }> {
  const $ = cheerio.load(html);
  const jobs: any[] = [];
  const seenUrls = new Set<string>();

  const nodes = $('article[data-job-id], .job-card, [data-qa="job-item"], [class*="jobCard"], [class*="job-card"]');
  nodes.each((_, el) => {
    const titleNode = $(el).find('a[href*="/job_"], a[href*="/vacature/"], h2 a, h3 a').first();
    const urlPart = titleNode.attr('href') || '';
    if (!urlPart) return;
    const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);
    const title = $(el).find('h2, h3, [class*="title"]').first().text().trim() || titleNode.text().trim();
    if (!title || !titleMatches(title, activeKeywords)) return;
    const company = $(el).find('[class*="company"], [class*="employer"], [data-qa="job-company"]').first().text().trim() || 'Onbekend';
    const location = $(el).find('[class*="location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
    const description = $(el).find('[class*="description"], [class*="snippet"]').first().text().trim() || '';
    jobs.push({ title, company, url: fullUrl, location, description, source: 'jobat', source_id: makeSourceId('jobat', fullUrl) });
  });

  // Tightened fallback: only looks inside recognised job containers,
  // preventing nav/footer/breadcrumb links from being picked up.
  if (jobs.length === 0) {
    const CONTAINER_SEL = 'article, li[class*="job"], li[class*="card"], div[class*="job-item"], div[class*="jobItem"], div[class*="card"]';
    $(CONTAINER_SEL).each((_, container) => {
      const a = $(container).find('a[href*="/job_"], a[href*="/vacature/"]').first();
      const href = a.attr('href') || '';
      if (!href) return;
      const fullUrl = href.startsWith('http') ? href : `https://www.jobat.be${href}`;
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);
      const title =
        $(container).find('h2, h3, [class*="title"]').first().text().trim() ||
        a.text().trim();
      if (!title || !titleMatches(title, activeKeywords)) return;
      const company = $(container).find('[class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
      const location = $(container).find('[class*="location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
      jobs.push({ title, company, url: fullUrl, location, description: '', source: 'jobat', source_id: makeSourceId('jobat', fullUrl) });
    });
  }

  return jobs;
}

function parseStepstoneJobs(
  html: string,
  activeKeywords: string[],
): Array<{ title: string; company: string; url: string; location: string; description: string; source: string; source_id: string }> {
  const $ = cheerio.load(html);
  const jobs: any[] = [];

  const cards = $('article, [data-qa="job-teaser"], [data-at="job-item"], [data-testid="job-item"], [class*="JobCard"], [class*="job-teaser"]');
  cards.each((_, el) => {
    const link = $(el).find('a[href]').first();
    const title = $(el).find('h2, h3, [data-qa="job-title"], [data-at="job-title"]').first().text().trim() || link.text().trim();
    const urlPart = link.attr('href') || '';
    const company = $(el).find('[data-qa="job-company-name"], [data-at="job-company"], [class*="company"]').first().text().trim() || 'Onbekend';
    const location = $(el).find('[data-qa="job-location"], [data-at="job-location"], [class*="location"]').first().text().trim() || '';
    const description = $(el).find('[data-qa="job-snippet"], [class*="snippet"], [class*="description"]').first().text().trim() || '';
    if (!title || !urlPart || !titleMatches(title, activeKeywords)) return;
    const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
    jobs.push({ title, company, url: fullUrl, location, description, source: 'stepstone', source_id: makeSourceId('stepstone', fullUrl) });
  });

  return jobs;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleScrape(request: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const tagsParam = url.searchParams.get('tags') || '';
    const customTags = tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let userCity      = 'Antwerp';
    let userRadius    = 30;
    let userKeywords: string[] = [];
    let adzunaId      = process.env.ADZUNA_APP_ID  || '';
    let adzunaKey     = process.env.ADZUNA_APP_KEY || '';
    let scrapeDoToken = process.env.SCRAPE_DO_TOKEN || '';

    const { data: settings } = await supabase
      .from('user_settings')
      .select('adzuna_app_id, adzuna_app_key, scrape_do_token, keywords, city, radius, adzuna_calls_today, adzuna_calls_month, last_call_date')
      .eq('user_id', user.id)
      .single();

    if (settings?.adzuna_app_id)    adzunaId      = settings.adzuna_app_id;
    if (settings?.adzuna_app_key)   adzunaKey     = settings.adzuna_app_key;
    if (settings?.scrape_do_token)  scrapeDoToken = settings.scrape_do_token;
    if (settings?.keywords?.length) userKeywords  = settings.keywords;
    if (settings?.city)             userCity      = settings.city;
    if (settings?.radius)           userRadius    = settings.radius;

    await supabase
      .from('user_settings')
      .update({ last_scrape_at: new Date().toISOString() })
      .eq('user_id', user.id);

    // Always defined — never null. Covers all three cases:
    // 1. URL ?tags= param   2. user saved keywords   3. default TITLE_KEYWORDS
    const activeKeywords: string[] =
      customTags.length > 0
        ? customTags
        : userKeywords.length > 0
        ? userKeywords
        : TITLE_KEYWORDS;

    const titleFilterKeywords = activeKeywords;

    const jobsToInsert: any[] = [];
    const seenIds = new Set<string>();

    // ── 1. Adzuna ────────────────────────────────────────────────────────────
    if (adzunaId && adzunaKey) {
      const BATCH = 3;
      for (let i = 0; i < activeKeywords.length; i += BATCH) {
        if (i > 0) await sleep(1000);
        const batch = activeKeywords.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((kw) => fetchAdzuna(kw, userCity, userRadius, adzunaId, adzunaKey))
        );
        for (const result of results) {
          if (result.status === 'rejected') continue;
          for (const ad of result.value) {
            const adId = String(ad.id ?? '');
            if (!adId || seenIds.has(adId)) continue;
            if (!titleMatches(ad.title ?? '', titleFilterKeywords)) continue;
            seenIds.add(adId);
            jobsToInsert.push({
              user_id:     user.id,
              source_id:   makeSourceId('adzuna', adId),
              source:      'adzuna',
              title:       ad.title ?? '',
              company:     ad.company?.display_name ?? 'Onbekend',
              location:    ad.location?.display_name ?? '',
              description: ad.description ?? '',
              url:         ad.redirect_url ?? `https://www.adzuna.be/jobs/details/${adId}`,
            });
          }
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const isNewDay = settings?.last_call_date !== today;
      const callsToday = isNewDay ? 1 : ((settings?.adzuna_calls_today ?? 0) + 1);
      const callsMonth = (settings?.adzuna_calls_month ?? 0) + 1;
      await supabase.from('user_settings').update({
        adzuna_calls_today: callsToday,
        adzuna_calls_month: callsMonth,
        last_call_date: today,
      }).eq('user_id', user.id);
    }

    // ── 2. Jobat + Stepstone via scrape.do ───────────────────────────────────
    if (scrapeDoToken) {
      const htmlTargets = buildHtmlTargets(activeKeywords, userCity, userRadius);
      const HTML_BATCH = 4;

      for (let i = 0; i < htmlTargets.length; i += HTML_BATCH) {
        if (i > 0) await sleep(1000);
        const batch = htmlTargets.slice(i, i + HTML_BATCH);
        const htmlResults = await Promise.allSettled(
          batch.map((t) =>
            fetchViaScrapesDo(t.url, scrapeDoToken).then((html) => ({
              html,
              source: t.source,
              keyword: t.keyword,
            }))
          )
        );

        for (const result of htmlResults) {
          if (result.status === 'rejected' || !result.value.html) continue;
          const { html, source } = result.value;
          const parsed = source === 'jobat'
            ? parseJobatJobs(html, activeKeywords)
            : parseStepstoneJobs(html, activeKeywords);

          for (const job of parsed) {
            if (seenIds.has(job.source_id)) continue;
            seenIds.add(job.source_id);
            jobsToInsert.push({ ...job, user_id: user.id });
          }
        }
      }
    }

    const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
    if (uniqueJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Geen nieuwe vacatures gevonden.' });

    const { data, error } = await supabase
      .from('jobs')
      .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true })
      .select('id, url, description');

    if (error) throw error;

    // ── 3. Enrich jobs with short/missing descriptions ────────────────────────
    const needsEnrichment = (data ?? []).filter(
      (j: any) => j.url && (!j.description || j.description.trim().length < 100)
    );

    if (needsEnrichment.length > 0) {
      const ENRICH_BATCH = 4;
      for (let i = 0; i < needsEnrichment.length; i += ENRICH_BATCH) {
        const batch = needsEnrichment.slice(i, i + ENRICH_BATCH);
        await Promise.allSettled(
          batch.map(async (job: any) => {
            const desc = await scrapeJobDescription(job.url);
            if (desc.length > 100) {
              await supabase.from('jobs').update({ description: desc }).eq('id', job.id);
            }
          })
        );
        if (i + ENRICH_BATCH < needsEnrichment.length) await sleep(500);
      }
    }

    return NextResponse.json({ success: true, count: data?.length ?? 0, total_found: uniqueJobs.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) { return handleScrape(request); }
export async function POST(request: Request) { return handleScrape(request); }
