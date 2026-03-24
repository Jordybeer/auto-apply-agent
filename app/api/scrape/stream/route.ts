import { createClient } from '@/lib/supabase-request';
import * as cheerio from 'cheerio';
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
  // Antwerpen stad & randgemeenten
  'antwerpen','antwerp','stabroek','kapellen','brasschaat','schoten','wijnegem','wommelgem',
  'merksem','deurne','hoboken','berchem','borgerhout','mortsel','kontich','edegem',
  'aartselaar','hemiksem','niel','rumst',
  // Mechelen regio
  'mechelen','willebroek','boom','duffel','sint-katelijne-waver','bonheiden',
  // Kempen
  'lier','herentals','geel','mol','turnhout','berlaar','nijlen','heist-op-den-berg',
  // Remote
  'remote','thuis','thuiswerk','hybrid','hybride','telewerk',
];

function titleMatches(title: string, keywords: string[]) {
  const lower = title.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function locationMatches(location: string, description: string, jobUrl: string) {
  const haystack = `${location} ${description} ${jobUrl}`.toLowerCase();
  return ALLOWED_REGIONS.some((r) => haystack.includes(r));
}

function buildTargets(keywords: string[], city: string, radius: number): Target[] {
  const encoded = keywords.map(encodeURIComponent).join('+');
  const cityEncoded = encodeURIComponent(city);
  return [
    { url: `https://www.jobat.be/nl/jobs?keywords=${encoded}&municipality=${cityEncoded}&radius=${radius}`, source: 'jobat', render: true, waitFor: '[data-job-id], .job-card' },
    { url: `https://www.stepstone.be/nl/vacatures/?q=${encoded}&where=${cityEncoded}&radius=${radius}`, source: 'stepstone', render: true, waitFor: 'article' },
    { url: `https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=${encoded}&location=${cityEncoded}`, source: 'ictjob', render: true, waitFor: '.search-item' },
    { url: `https://www.vdab.be/vindeenjob/vacatures?sort=date&lang=nl&zoekopdracht=${encoded}&gemeente=${cityEncoded}&straal=${radius}`, source: 'vdab', render: true, waitFor: 'article' },
    { url: `https://be.indeed.com/jobs?q=${encoded}&l=${cityEncoded}&radius=${radius}&sort=date&lang=nl`, source: 'indeed', render: true, waitFor: '[data-testid="job-card"]' },
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

        let SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';
        let userCity = 'Antwerpen';
        let userRadius = 30;
        let userKeywords: string[] = [];

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
          await supabase.from('user_settings').update({ last_scrape_at: new Date().toISOString() }).eq('user_id', user.id);
        }

        if (!SCRAPER_API_KEY) {
          send({ type: 'error', message: 'Geen scrape API key gevonden.' });
          controller.close();
          return;
        }

        // Priority: UI tags > DB keywords > defaults
        const activeKeywords = customTags.length > 0 ? customTags : userKeywords.length > 0 ? userKeywords : TITLE_KEYWORDS;
        const allTargets = buildTargets(activeKeywords, userCity, userRadius);
        const targets = sourceParam ? allTargets.filter((t) => t.source === sourceParam) : allTargets;

        send({ type: 'log', message: `Platforms: ${targets.map(t => t.source).join(', ')}` });
        send({ type: 'log', message: `Tags: ${activeKeywords.join(', ')}` });

        const jobsToInsert: any[] = [];

        for (const target of targets) {
          send({ type: 'log', message: `→ fetching ${target.source}` });

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
            send({ type: 'log', message: `✗ ${target.source}: fetch failed — ${err.message}` });
            continue;
          }

          if (!fetchOk) {
            send({ type: 'log', message: `✗ ${target.source}: HTTP ${fetchStatus}` });
            continue;
          }

          send({ type: 'log', message: `  parsing ${target.source}…` });

          const $ = cheerio.load(html);
          const localJobs: any[] = [];

          const pushJob = (job: { title: string; company: string; url: string; location: string; description: string }) => {
            if (!titleMatches(job.title, activeKeywords)) return;
            if (!locationMatches(job.location, job.description, job.url)) return;
            localJobs.push({ source_id: makeSourceId(target.source, job.url), ...job, source: target.source });
          };

          if (target.source === 'jobat') {
            const seenUrls = new Set<string>();
            $('article[data-job-id], .job-card, [data-qa="job-item"], [class*="jobCard"], [class*="job-card"]').each((_, el) => {
              const titleNode = $(el).find('a[href*="/job_"], a[href*="/vacature/"], h2 a, h3 a').first();
              const urlPart = titleNode.attr('href') || '';
              if (!urlPart) return;
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
              if (seenUrls.has(fullUrl)) return;
              seenUrls.add(fullUrl);
              const title = $(el).find('h2, h3, [class*="title"]').first().text().trim() || titleNode.text().trim();
              if (!title) return;
              const company = $(el).find('[class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
              const location = $(el).find('[class*="location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
              pushJob({ title, company, url: fullUrl, location, description: '' });
            });
            if (localJobs.length === 0) {
              const seenUrls2 = new Set<string>();
              $('a[href*="/job_"], a[href*="/vacature/"]').each((_, a) => {
                const href = $(a).attr('href') || '';
                if (!href) return;
                const fullUrl = href.startsWith('http') ? href : `https://www.jobat.be${href}`;
                if (seenUrls2.has(fullUrl)) return;
                seenUrls2.add(fullUrl);
                const parent = $(a).closest('article, li, div[class*="job"], div[class*="card"]');
                const title = parent.find('h2, h3, [class*="title"]').first().text().trim() || $(a).text().trim();
                if (!title) return;
                const company = parent.find('[class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
                const location = parent.find('[class*="location"], [class*="plaats"]').first().text().trim() || '';
                pushJob({ title, company, url: fullUrl, location, description: '' });
              });
            }
          }

          if (target.source === 'stepstone') {
            $('article, [data-qa="job-teaser"], [data-at="job-item"], [data-testid="job-item"], [class*="JobCard"]').each((_, el) => {
              const link = $(el).find('a[href]').first();
              const title = $(el).find('h2, h3, [data-qa="job-title"]').first().text().trim() || link.text().trim();
              const urlPart = link.attr('href') || '';
              const company = $(el).find('[data-qa="job-company-name"], [class*="company"]').first().text().trim() || 'Onbekend';
              const location = $(el).find('[data-qa="job-location"], [class*="location"]').first().text().trim() || '';
              const description = $(el).find('[data-qa="job-snippet"], [class*="snippet"]').first().text().trim() || '';
              if (title && urlPart) pushJob({ title, company, url: urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`, location, description });
            });
          }

          if (target.source === 'ictjob') {
            $('.search-item, article.job, .job-card, li[class*="job"]').each((_, el) => {
              const titleNode = $(el).find('a[href]').first();
              const title = $(el).find('.job-title, h2, h3').text().trim() || titleNode.text().trim();
              const urlPart = titleNode.attr('href') || '';
              const company = $(el).find('.job-company, [class*="company"]').text().trim() || 'Onbekend';
              const location = $(el).find('.job-location, [class*="location"]').text().trim() || '';
              if (title && urlPart) pushJob({ title, company, url: urlPart.startsWith('http') ? urlPart : `https://www.ictjob.be${urlPart}`, location, description: '' });
            });
          }

          if (target.source === 'vdab') {
            const seenUrls = new Set<string>();
            $('a[href*="/vindeenjob/vacatures/"]').each((_, a) => {
              const href = $(a).attr('href') || '';
              if (!href) return;
              const fullUrl = href.startsWith('http') ? href : `https://www.vdab.be${href}`;
              if (seenUrls.has(fullUrl)) return;
              seenUrls.add(fullUrl);
              const parent = $(a).closest('article, li, div');
              const title = parent.find('h2, h3, [class*="title"]').first().text().trim() || $(a).text().trim();
              if (!title) return;
              const company = parent.find('[class*="company"], [class*="employer"]').first().text().trim() || 'Onbekend';
              const location = parent.find('[class*="location"], [class*="gemeente"]').first().text().trim() || '';
              pushJob({ title, company, url: fullUrl, location, description: '' });
            });
          }

          if (target.source === 'indeed') {
            $('.job_seen_beacon, [data-testid="job-card"], .resultContent').each((_, el) => {
              const titleNode = $(el).find('h2.jobTitle a, [data-testid="job-title"] a, h2 a').first();
              const urlPart = titleNode.attr('href') || '';
              const title = titleNode.find('span').first().text().trim() || titleNode.text().trim();
              const company = $(el).find('[data-testid="company-name"]').text().trim() || 'Onbekend';
              const location = $(el).find('[data-testid="text-location"]').text().trim() || '';
              const description = $(el).find('.job-snippet, [data-testid="job-snippet"]').text().trim() || '';
              if (title && urlPart) pushJob({ title, company, url: urlPart.startsWith('http') ? urlPart : `https://be.indeed.com${urlPart}`, location, description });
            });
          }

          send({ type: 'log', message: `  found ${localJobs.length} matching jobs on ${target.source}` });
          jobsToInsert.push(...localJobs);

          await sleep(350);
        }

        const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
        send({ type: 'log', message: `→ inserting ${uniqueJobs.length} unique jobs…` });

        if (uniqueJobs.length === 0) {
          send({ type: 'done', count: 0, total_found: 0 });
          controller.close();
          return;
        }

        const supabase2 = await createClient();
        const { data, error } = await supabase2
          .from('jobs')
          .upsert(uniqueJobs, { onConflict: 'source_id', ignoreDuplicates: true })
          .select();

        if (error) {
          send({ type: 'error', message: error.message });
        } else {
          send({ type: 'log', message: `✓ inserted ${data?.length ?? 0} new jobs` });
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
