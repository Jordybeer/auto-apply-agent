import { createClient } from '@/lib/supabase-request';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { createHash } from 'crypto';

export const maxDuration = 300;

type Source = 'jobat' | 'stepstone' | 'ictjob' | 'vdab' | 'indeed';
type Target = { url: string; source: Source; render?: boolean; waitFor?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hashId = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 24);
const makeSourceId = (source: Source, url: string) => `${source}-${hashId(url)}`;

const TITLE_KEYWORDS = [
  'software support','it helpdesk','it help desk','helpdesk','help desk',
  'support engineer','application support','applicatiebeheerder','functioneel beheerder',
  'servicedesk','service desk','it support','1st line','2nd line','first line','second line',
  'technisch support','ict support','desktop support','field support','end user support','deskside support',
];

const ALLOWED_REGIONS = [
  'antwerpen','antwerp','stabroek','kapellen','brasschaat','schoten','wijnegem','wommelgem',
  'merksem','deurne','hoboken','berchem','borgerhout','mortsel','kontich','edegem',
  'aartselaar','hemiksem','niel','rumst',
  'mechelen','willebroek','boom','duffel','sint-katelijne-waver','bonheiden',
  'lier','herentals','geel','mol','turnhout','berlaar','nijlen','heist-op-den-berg',
  'remote','thuis','thuiswerk','hybrid','hybride','telewerk','belgie','belgium',
];

const FOREIGN_PATTERN = /\b(london|paris|amsterdam|berlin|madrid|rome|dublin|utrecht|rotterdam|eindhoven|\buk\b|\bnl\b|\bde\b|\bfr\b|\bes\b|\bit\b)\b/;

function titleMatches(title: string, keywords: string[]): boolean {
  const lower = title.toLowerCase();
  return keywords.some((kw) => {
    const kwLower = kw.toLowerCase();
    if (lower.includes(kwLower)) return true;
    const words = kwLower.split(/\s+/).filter((w) => w.length > 2);
    return words.length >= 2 && words.every((w) => lower.includes(w));
  });
}

function locationMatches(location: string, description: string, jobUrl: string): boolean {
  const haystack = `${location} ${description}`.toLowerCase();
  const urlLower = jobUrl.toLowerCase();

  if (FOREIGN_PATTERN.test(haystack)) return false;
  if (ALLOWED_REGIONS.some((r) => haystack.includes(r))) return true;

  if (!location.trim()) {
    return urlLower.includes('.be/') || urlLower.includes('.be?');
  }

  return false;
}

function buildTargets(primaryKeyword: string, city: string, radius: number): Target[] {
  const q = encodeURIComponent(primaryKeyword);
  const cityEncoded = encodeURIComponent(city);
  const radiusMiles = Math.ceil(radius * 0.621371);
  return [
    {
      url: `https://www.jobat.be/nl/jobs?keywords=${q}&municipality=${cityEncoded}&radius=${radius}`,
      source: 'jobat',
      render: true,
      waitFor: '[class*="vacancy-teaser"], [class*="jobCard"], article[data-job-id], .job-card',
    },
    {
      url: `https://www.stepstone.be/nl/vacatures/?q=${q}&where=${cityEncoded}&radius=${radius}`,
      source: 'stepstone',
      render: true,
      waitFor: '[data-at="job-item"], [class*="JobCard"], article',
    },
    {
      url: `https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=${q}&location=${cityEncoded}`,
      source: 'ictjob',
      render: true,
      waitFor: '.search-item',
    },
    {
      url: `https://www.vdab.be/vindeenjob/vacatures?sort=date&lang=nl&zoekopdracht=${q}&gemeente=${cityEncoded}&straal=${radius}`,
      source: 'vdab',
      render: true,
      waitFor: '[class*="vacancy"], article, li[class*="job"]',
    },
    {
      url: `https://be.indeed.com/jobs?q=${q}&l=${cityEncoded}&radius=${radiusMiles}&sort=date`,
      source: 'indeed',
      render: true,
      waitFor: '[data-testid="job-card"], .job_seen_beacon',
    },
  ];
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const sourceParam = (url.searchParams.get('source') || '').toLowerCase() as Source | '';
  const tagsParam = url.searchParams.get('tags') || '';
  const customTags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          send({ type: 'error', message: 'Not authenticated.' });
          controller.close();
          return;
        }

        let SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';
        let userCity = 'Antwerpen';
        let userRadius = 30;
        let userKeywords: string[] = [];

        const { data: settings } = await supabase
          .from('user_settings')
          .select('scrape_api_key, keywords, city, radius')
          .eq('user_id', user.id)
          .single();
        if (settings?.scrape_api_key) SCRAPER_API_KEY = settings.scrape_api_key;
        if (settings?.keywords?.length) userKeywords = settings.keywords;
        if (settings?.city) userCity = settings.city;
        if (settings?.radius) userRadius = settings.radius;
        await supabase.from('user_settings').update({ last_scrape_at: new Date().toISOString() }).eq('user_id', user.id);

        if (!SCRAPER_API_KEY) {
          send({ type: 'error', message: 'Geen scrape API key gevonden.' });
          controller.close();
          return;
        }

        const activeKeywords = customTags.length > 0 ? customTags : userKeywords.length > 0 ? userKeywords : TITLE_KEYWORDS;
        const primaryKeyword = activeKeywords[0];
        const allTargets = buildTargets(primaryKeyword, userCity, userRadius);
        const targets = sourceParam ? allTargets.filter((t) => t.source === sourceParam) : allTargets;

        send({ type: 'log', message: `▶ keyword: "${primaryKeyword}" | city: ${userCity} | radius: ${userRadius}km` });
        send({ type: 'log', message: `▶ local filter (${activeKeywords.length}): ${activeKeywords.join(', ')}` });

        const jobsToInsert: any[] = [];

        for (const target of targets) {
          send({ type: 'log', message: `→ [${target.source}] fetching…` });

          const params = new URLSearchParams({ token: SCRAPER_API_KEY, url: target.url });
          if (target.render) {
            params.set('render', 'true');
            if (target.waitFor) params.set('waitFor', target.waitFor);
          }

          const abortCtrl = new AbortController();
          const tid = setTimeout(() => abortCtrl.abort(), 55000);

          let html = '';
          let fetchOk = false;
          let fetchStatus = 0;
          try {
            const res = await fetch(`https://api.scrape.do?${params}`, { signal: abortCtrl.signal });
            html = await res.text();
            fetchOk = res.ok;
            fetchStatus = res.status;
            clearTimeout(tid);
          } catch (err: any) {
            clearTimeout(tid);
            send({ type: 'log', message: `✗ [${target.source}] fetch failed — ${err.message}` });
            continue;
          }

          if (!fetchOk) {
            send({ type: 'log', message: `✗ [${target.source}] HTTP ${fetchStatus}` });
            continue;
          }

          send({ type: 'log', message: `  [${target.source}] parsing (${Math.round(html.length / 1024)}kb)…` });

          const $ = cheerio.load(html);
          const localJobs: any[] = [];
          let rawCount = 0;
          let titleFiltered = 0;
          let locationFiltered = 0;

          const pushJob = (job: { title: string; company: string; url: string; location: string; description: string }) => {
            rawCount++;
            if (!job.title) return;
            if (!titleMatches(job.title, activeKeywords)) { titleFiltered++; return; }
            if (!locationMatches(job.location, job.description, job.url)) { locationFiltered++; return; }
            localJobs.push({
              user_id: user.id,
              source_id: makeSourceId(target.source, job.url),
              ...job,
              source: target.source,
            });
          };

          // ─────────────────────────────────────────────
          // JOBAT
          // ─────────────────────────────────────────────
          if (target.source === 'jobat') {
            const seenUrls = new Set<string>();

            const parseJobatEl = (el: AnyNode) => {
              const $el = $(el);
              const titleLink = $el.find('a[class*="title"], h2 a, h3 a, [class*="teaser__title"] a').first();
              const urlPart = titleLink.attr('href') || $el.find('a[href*="/job_"], a[href*="/vacature/"]').first().attr('href') || '';
              if (!urlPart) return;
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
              if (seenUrls.has(fullUrl)) return;
              seenUrls.add(fullUrl);
              const title = $el.find('[class*="teaser__title"], [class*="vacancy__title"], h2, h3').first().text().trim()
                || titleLink.text().trim();
              if (!title) return;
              const company = $el.find('[class*="teaser__company"], [class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
              const location = $el.find('[class*="teaser__location"], [class*="location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
              pushJob({ title, company, url: fullUrl, location, description: '' });
            };

            const primaryEls = $('[class*="vacancy-teaser"], article[data-job-id], [class*="jobCard"], [class*="job-card"], [data-qa="job-item"]');
            primaryEls.each((_, el) => parseJobatEl(el));

            if (localJobs.length === 0 && rawCount === 0) {
              $('a[href*="/job_"], a[href*="/vacature/"]').each((_, a) => {
                const href = $(a).attr('href') || '';
                if (!href) return;
                const fullUrl = href.startsWith('http') ? href : `https://www.jobat.be${href}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);
                const parent = $(a).closest('article, li, div[class*="job"], div[class*="card"], div[class*="teaser"]');
                const title = parent.find('h2, h3, [class*="title"]').first().text().trim() || $(a).text().trim();
                if (!title) return;
                const company = parent.find('[class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
                const location = parent.find('[class*="location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
                pushJob({ title, company, url: fullUrl, location, description: '' });
              });
            }
          }

          // ─────────────────────────────────────────────
          // STEPSTONE
          // ─────────────────────────────────────────────
          if (target.source === 'stepstone') {
            const seenUrls = new Set<string>();
            const els = $('[data-at="job-item"], [data-testid="job-item"], [class*="JobCard"], [class*="job-teaser"]');
            els.each((_, el) => {
              const $el = $(el);
              const titleLink = $el.find('[data-at="job-item-title"] a, [data-testid="job-title"] a, h2 a, h3 a').first();
              const urlPart = titleLink.attr('href') || $el.find('a[href]').first().attr('href') || '';
              if (!urlPart) return;
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
              if (seenUrls.has(fullUrl)) return;
              seenUrls.add(fullUrl);
              const title = $el.find('[data-at="job-item-title"], h2, h3').first().text().trim() || titleLink.text().trim();
              const company = $el.find('[data-at="job-item-company-name"], [data-qa="job-company-name"], [class*="company"]').first().text().trim() || 'Onbekend';
              const location = $el.find('[data-at="job-item-location"], [data-qa="job-location"], [class*="location"]').first().text().trim() || '';
              const description = $el.find('[data-at="job-item-snippet"], [data-qa="job-snippet"], [class*="snippet"]').first().text().trim() || '';
              if (title && urlPart) pushJob({ title, company, url: fullUrl, location, description });
            });

            if (rawCount === 0) {
              $('article').each((_, el) => {
                const $el = $(el);
                const link = $el.find('a[href]').first();
                const urlPart = link.attr('href') || '';
                if (!urlPart) return;
                const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);
                const title = $el.find('h2, h3').first().text().trim();
                const company = $el.find('[class*="company"]').first().text().trim() || 'Onbekend';
                const location = $el.find('[class*="location"]').first().text().trim() || '';
                const description = $el.find('p').first().text().trim() || '';
                if (title) pushJob({ title, company, url: fullUrl, location, description });
              });
            }
          }

          // ─────────────────────────────────────────────
          // ICTJOB
          // ─────────────────────────────────────────────
          if (target.source === 'ictjob') {
            $('.search-item, article.job, li.job').each((_, el) => {
              const $el = $(el);
              const titleNode = $el.find('h2 a, h3 a, .job-title a, a[href*="/nl/vacature/"]').first();
              const urlPart = titleNode.attr('href') || $el.find('a[href]').first().attr('href') || '';
              if (!urlPart) return;
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.ictjob.be${urlPart}`;
              const title = $el.find('.job-title, h2, h3').first().text().trim() || titleNode.text().trim();
              if (!title) return;
              const company = $el.find('.job-company, [class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
              const location = $el.find('.job-location, [class*="location"], [class*="plaats"]').first().text().trim() || '';
              pushJob({ title, company, url: fullUrl, location, description: '' });
            });
          }

          // ─────────────────────────────────────────────
          // VDAB
          // ─────────────────────────────────────────────
          if (target.source === 'vdab') {
            const seenUrls = new Set<string>();

            const parseVdabEl = (el: AnyNode, jobUrl: string) => {
              const $el = $(el);
              const title = $el.find('h2, h3, [class*="title"], [class*="vacature__title"]').first().text().trim()
                || $el.find('a[href]').first().text().trim();
              if (!title) return;
              const company = $el.find('[class*="company"], [class*="employer"], [class*="werkgever"]').first().text().trim() || 'Onbekend';
              const location = $el.find('[class*="location"], [class*="gemeente"], [class*="plaats"], [class*="regio"]').first().text().trim() || '';
              pushJob({ title, company, url: jobUrl, location, description: '' });
            };

            $('a[href*="/vacature/"]').each((_, a) => {
              const href = $(a).attr('href') || '';
              if (!href) return;
              const fullUrl = href.startsWith('http') ? href : `https://www.vdab.be${href}`;
              if (seenUrls.has(fullUrl)) return;
              seenUrls.add(fullUrl);
              const parent = $(a).closest('article, li, div[class*="vacancy"], div[class*="job"], div[class*="result"]');
              parseVdabEl(parent.length ? parent[0] : a, fullUrl);
            });

            if (localJobs.length === 0 && rawCount === 0) {
              $('a[href*="/vindeenjob/vacatures/"]').each((_, a) => {
                const href = $(a).attr('href') || '';
                if (!href) return;
                const fullUrl = href.startsWith('http') ? href : `https://www.vdab.be${href}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);
                const parent = $(a).closest('article, li');
                parseVdabEl(parent.length ? parent[0] : a, fullUrl);
              });
            }
          }

          // ─────────────────────────────────────────────
          // INDEED
          // ─────────────────────────────────────────────
          if (target.source === 'indeed') {
            const seenIds = new Set<string>();
            $('.job_seen_beacon, [data-testid="job-card"], li[class*="job"]').each((_, el) => {
              const $el = $(el);
              const jk = $el.attr('data-jk') || $el.find('[data-jk]').first().attr('data-jk') || '';
              const titleLink = $el.find('h2.jobTitle a, [data-testid="job-title"] a, h2 a').first();
              const urlPart = titleLink.attr('href') || '';
              if (!urlPart) return;
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://be.indeed.com${urlPart}`;
              const dedupKey = jk || fullUrl;
              if (seenIds.has(dedupKey)) return;
              seenIds.add(dedupKey);
              const titleSpan = titleLink.find('span[title]').first();
              const title = titleSpan.attr('title')?.trim()
                || titleLink.find('span:not([class*="screen-reader"])').first().text().trim()
                || titleLink.text().trim();
              if (!title) return;
              const company = $el.find('[data-testid="company-name"], [class*="companyName"]').first().text().trim() || 'Onbekend';
              const location = $el.find('[data-testid="text-location"], [class*="companyLocation"]').first().text().trim() || '';
              const description = $el.find('[data-testid="job-snippet"], .job-snippet').first().text().trim() || '';
              const stableUrl = jk ? `https://be.indeed.com/viewjob?jk=${jk}` : fullUrl;
              pushJob({ title, company, url: stableUrl, location, description });
            });
          }

          // ─────────────────────────────────────────────
          // Per-platform debug summary
          // ─────────────────────────────────────────────
          send({
            type: 'log',
            message: `  [${target.source}] raw=${rawCount} | title_filtered=${titleFiltered} | location_filtered=${locationFiltered} | passed=${localJobs.length}`,
          });

          jobsToInsert.push(...localJobs);
          await sleep(350);
        }

        const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
        send({ type: 'log', message: `→ total unique jobs to insert: ${uniqueJobs.length}` });

        if (uniqueJobs.length === 0) {
          send({ type: 'done', count: 0, total_found: 0 });
          controller.close();
          return;
        }

        const { data, error } = await supabase
          .from('jobs')
          .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true })
          .select();

        if (error) {
          send({ type: 'error', message: error.message });
        } else {
          send({ type: 'log', message: `✓ inserted ${data?.length ?? 0} new jobs (${uniqueJobs.length - (data?.length ?? 0)} duplicates skipped)` });
          send({ type: 'done', count: data?.length ?? 0, total_found: uniqueJobs.length });
        }
      } catch (err: any) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: err.message }) + '\n'));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
