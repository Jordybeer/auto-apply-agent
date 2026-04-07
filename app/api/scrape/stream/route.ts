import { createClient } from '@/lib/supabase-request';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';

export const maxDuration = 120;

const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? '';

const CHART = String.fromCodePoint(0x1F4CA); // 📊

const hashId = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 24);
const makeSourceId = (source: string, id: string) => `${source}-${hashId(id)}`;

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

const TITLE_KEYWORDS = [
  'software support', 'it helpdesk', 'it help desk', 'helpdesk', 'help desk',
  'support engineer', 'application support', 'applicatiebeheerder', 'functioneel beheerder',
  'servicedesk', 'service desk', 'it support', '1st line', '2nd line', 'first line', 'second line',
  'technisch support', 'ict support', 'desktop support', 'field support', 'end user support', 'deskside support',
];

const QUALIFIER_TOKENS = new Set([
  'junior', 'senior', 'medior', 'lead', 'antwerp', 'antwerpen', 'brussels', 'brussel',
  'ghent', 'gent', 'leuven', 'mechelen', 'liege', 'luik', 'remote', 'hybrid',
  'fulltime', 'parttime', 'voltijds', 'deeltijds',
]);

function buildTitleFilter(customTags: string[]): string[] {
  const extra = customTags.filter((tag) => {
    const words = tag.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length > 3) return false;
    const nonQualifier = words.filter((w) => !QUALIFIER_TOKENS.has(w));
    return nonQualifier.length > 0;
  });
  const existing = new Set(TITLE_KEYWORDS.map((k) => k.toLowerCase()));
  const merged = [...TITLE_KEYWORDS];
  for (const tag of extra) {
    if (!existing.has(tag.toLowerCase())) merged.push(tag);
  }
  return merged;
}

function titleMatches(title: string, keywords: string[]): boolean {
  const lower = title.toLowerCase();
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

// ─── VDAB JSON API ───────────────────────────────────────────────────────────

async function fetchVDAB(
  keyword: string,
  gemeente: string,
  radiusKm: number,
): Promise<any[]> {
  const params = new URLSearchParams({
    zoekterm:    keyword,
    gemeente:    gemeente,
    straal:      String(radiusKm),
    aantalItems: '50',
    pagina:      '1',
  });
  const url = `https://api.vdab.be/jobs/v2/vacatures?${params}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'auto-apply-agent/1.0' },
  });
  if (!res.ok) throw new Error(`VDAB HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.vacatures ?? json.items ?? json.results ?? [];
}

function mapVDABJob(userId: string, v: any): object {
  const id: string = String(v.vacatureId ?? v.id ?? v.referentie ?? JSON.stringify(v).slice(0, 32));
  const title: string = v.functietitel ?? v.titel ?? v.jobTitle ?? '';
  const company: string = v.werkgever?.naam ?? v.bedrijfsnaam ?? v.company ?? 'Onbekend';
  const location: string = v.werkplaats?.gemeente ?? v.gemeente ?? v.location ?? '';
  const description: string = v.omschrijving ?? v.beschrijving ?? v.description ?? '';
  const url: string = v.url ?? v.detailUrl ?? `https://www.vdab.be/vindeenjob/vacatures/${id}`;
  return { user_id: userId, source_id: makeSourceId('vdab', id), source: 'vdab', title, company, location, description, url };
}

// ─── scrape.do HTML scraping (Jobat only) ────────────────────────────────────
// Stepstone disabled: React SPA requiring render=true — slow + expensive.
// Jobat (static HTML) yields more results and is cheaper to scrape.

async function fetchViaScrapesDo(
  targetUrl: string,
  scrapeDoToken: string,
): Promise<string> {
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
 * Build Jobat target URLs — one per keyword.
 * Jobat does not support multi-keyword queries joined with `+`;
 * each keyword needs its own request.
 */
function buildJobatTargets(
  keywords: string[],
  city: string,
  radius: number,
): Array<{ url: string; keyword: string }> {
  const cityEncoded = encodeURIComponent(city);
  return keywords.map((kw) => ({
    url: `https://www.jobat.be/nl/jobs?keywords=${encodeURIComponent(kw)}&municipality=${cityEncoded}&radius=${radius}`,
    keyword: kw,
  }));
}

function parseJobatJobs(
  html: string,
  activeKeywords: string[],
): Array<{ title: string; company: string; url: string; location: string; description: string; source: string; source_id: string }> {
  const $ = cheerio.load(html);
  const jobs: any[] = [];
  const seenUrls = new Set<string>();

  // Broad selector set — covers current and past Jobat markup variants
  const nodes = $(
    'article[data-job-id], article.job-card, li[data-job-id], ' +
    '.job-card, [data-qa="job-item"], [class*="jobCard"], [class*="job-card"], ' +
    '[class*="JobCard"], [class*="vacancy-card"], [class*="vacancyCard"]'
  );
  nodes.each((_, el) => {
    const titleNode = $(el).find('a[href*="/job_"], a[href*="/vacature/"], h2 a, h3 a').first();
    const urlPart = titleNode.attr('href') || '';
    if (!urlPart) return;
    const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);
    const title = $(el).find('h2, h3, [class*="title"], [class*="Title"]').first().text().trim() || titleNode.text().trim();
    if (!title || !titleMatches(title, activeKeywords)) return;
    const company = $(el).find('[class*="company"], [class*="Company"], [class*="employer"], [data-qa="job-company"]').first().text().trim() || 'Onbekend';
    const location = $(el).find('[class*="location"], [class*="Location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
    const description = $(el).find('[class*="description"], [class*="Description"], [class*="snippet"]').first().text().trim() || '';
    jobs.push({ title, company, url: fullUrl, location, description, source: 'jobat', source_id: makeSourceId('jobat', fullUrl) });
  });

  // Fallback: bare job links when card selectors match nothing
  if (jobs.length === 0) {
    $('a[href*="/job_"], a[href*="/vacature/"]').each((_, a) => {
      const href = $(a).attr('href') || '';
      if (!href) return;
      const fullUrl = href.startsWith('http') ? href : `https://www.jobat.be${href}`;
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);
      const parent = $(a).closest('article, li, div[class*="job"], div[class*="Job"], div[class*="card"], div[class*="Card"]');
      const title = parent.find('h2, h3, [class*="title"], [class*="Title"]').first().text().trim() || $(a).text().trim();
      if (!title || !titleMatches(title, activeKeywords)) return;
      const company = parent.find('[class*="company"], [class*="Company"], [class*="employer"]').first().text().trim() || 'Onbekend';
      const location = parent.find('[class*="location"], [class*="Location"], [class*="plaats"], [class*="gemeente"]').first().text().trim() || '';
      jobs.push({ title, company, url: fullUrl, location, description: '', source: 'jobat', source_id: makeSourceId('jobat', fullUrl) });
    });
  }

  return jobs;
}

export async function POST(request: Request) {
  const reqUrl     = new URL(request.url);
  const source     = (reqUrl.searchParams.get('source') || 'adzuna').toLowerCase();
  const tagsParam  = reqUrl.searchParams.get('tags') || '';
  const customTags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const encoder = new TextEncoder();

  if (authError || !user) {
    return new Response(
      encoder.encode(JSON.stringify({ type: 'error', message: 'Not authenticated.' }) + '\n'),
      { status: 401, headers: { 'Content-Type': 'application/x-ndjson' } },
    );
  }

  // jobat is handled via scrape.do further below — only truly unimplemented sources are blocked here
  const NOT_IMPLEMENTED: string[] = ['stepstone', 'ictjob', 'indeed'];
  if (NOT_IMPLEMENTED.includes(source)) {
    return new Response(
      encoder.encode(JSON.stringify({ type: 'error', message: `${source} is not yet implemented.` }) + '\n'),
      { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
    );
  }

  let userCity   = 'Antwerp';
  let userRadius = 30;
  let userKeywords: string[] = [];
  let adzunaId   = process.env.ADZUNA_APP_ID  || '';
  let adzunaKey  = process.env.ADZUNA_APP_KEY || '';
  let scrapeDoToken = process.env.SCRAPE_DO_TOKEN || '';
  const isAdmin  = ADMIN_USER_ID && user.id === ADMIN_USER_ID;

  const { data: settings } = await supabase
    .from('user_settings')
    .select('adzuna_app_id, adzuna_app_key, scrape_do_token, keywords, city, radius, adzuna_calls_today, adzuna_calls_month, last_call_date')
    .eq('user_id', user.id)
    .single();

  if (isAdmin && settings?.adzuna_app_id)  adzunaId  = settings.adzuna_app_id;
  if (isAdmin && settings?.adzuna_app_key) adzunaKey = settings.adzuna_app_key;
  if (settings?.scrape_do_token) scrapeDoToken = (settings as any).scrape_do_token;
  if (settings?.keywords?.length) userKeywords = settings.keywords;
  if (settings?.city)   userCity   = settings.city;
  if (settings?.radius) userRadius = settings.radius;

  await supabase.from('user_settings')
    .update({ last_scrape_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (source === 'adzuna' && (!adzunaId || !adzunaKey)) {
    return new Response(
      encoder.encode(JSON.stringify({ type: 'error', message: 'Adzuna API credentials not configured.' }) + '\n'),
      { status: 400, headers: { 'Content-Type': 'application/x-ndjson' } },
    );
  }

  const activeKeywords = customTags.length > 0
    ? customTags
    : userKeywords.length > 0
    ? userKeywords
    : TITLE_KEYWORDS;

  const titleFilter: string[] | null =
    customTags.length === 0 && userKeywords.length === 0
      ? buildTitleFilter([])
      : null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));

      try {
        // ---------------------------------------------------------------
        // VDAB pipeline
        // ---------------------------------------------------------------
        if (source === 'vdab') {
          send({ type: 'log', message: `\u25b6 VDAB | gemeente: ${userCity} | straal: ${userRadius}km` });
          send({ type: 'log', message: `\u25b6 zoektermen (${activeKeywords.length}): ${activeKeywords.slice(0, 6).join(', ')}${activeKeywords.length > 6 ? '...' : ''}` });
          send({ type: 'log', message: titleFilter ? `\u25b6 title filter (${titleFilter.length} keywords)` : `\u25b6 title filter: off (user keywords active)` });

          const jobsToInsert: any[] = [];
          const seenIds = new Set<string>();

          await sleep(1000);

          for (let i = 0; i < activeKeywords.length; i++) {
            if (i > 0) await sleep(300);
            const kw = activeKeywords[i];
            try {
              const vacatures = await fetchVDAB(kw, userCity, userRadius);
              let added = 0; let skipped = 0;
              for (const v of vacatures) {
                const mapped = mapVDABJob(user.id, v) as any;
                if (!mapped.source_id || seenIds.has(mapped.source_id)) { skipped++; continue; }
                if (titleFilter && !titleMatches(mapped.title, titleFilter)) { skipped++; continue; }
                seenIds.add(mapped.source_id); added++;
                jobsToInsert.push(mapped);
              }
              send({ type: 'log', message: `  [vdab] "${kw}" \u2014 ${vacatures.length} results, ${added} matched, ${skipped} skipped` });
            } catch (e: any) {
              send({ type: 'log', message: `\u2717 [vdab] "${kw}" \u2014 ${e.message ?? 'unknown error'}` });
            }
          }

          const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
          send({ type: 'log', message: `\u2192 ${uniqueJobs.length} unique VDAB jobs to insert` });

          if (uniqueJobs.length === 0) {
            send({ type: 'done', count: 0, total_found: 0 });
            controller.close(); return;
          }

          const { data, error } = await supabase.from('jobs')
            .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true }).select();
          if (error) {
            send({ type: 'error', message: error.message });
          } else {
            const inserted = data?.length ?? 0;
            send({ type: 'log', message: `\u2713 inserted ${inserted} new VDAB jobs (${uniqueJobs.length - inserted} duplicates skipped)` });
            send({ type: 'done', count: inserted, total_found: uniqueJobs.length });
          }
          controller.close(); return;
        }

        // ---------------------------------------------------------------
        // Adzuna + Jobat (scrape.do) pipeline
        // ---------------------------------------------------------------
        send({ type: 'log', message: `\u25b6 Adzuna BE | city: ${userCity} | radius: ${userRadius}km` });
        send({ type: 'log', message: `\u25b6 search terms (${activeKeywords.length}): ${activeKeywords.slice(0, 6).join(', ')}${activeKeywords.length > 6 ? '...' : ''}` });
        send({ type: 'log', message: titleFilter ? `\u25b6 title filter (${titleFilter.length} keywords)` : `\u25b6 title filter: off (user keywords active)` });

        const jobsToInsert: any[] = [];
        const seenIds = new Set<string>();
        let apiCallsMade = 0;

        await sleep(1000);

        for (let i = 0; i < activeKeywords.length; i++) {
          if (i > 0) await sleep(400);
          const kw = activeKeywords[i];
          try {
            const ads = await fetchAdzuna(kw, userCity, userRadius, adzunaId, adzunaKey);
            apiCallsMade++;
            let added = 0; let skipped = 0;
            for (const ad of ads) {
              const adId: string = String(ad.id ?? '');
              if (!adId || seenIds.has(adId)) { skipped++; continue; }
              const title: string = ad.title ?? '';
              if (titleFilter && !titleMatches(title, titleFilter)) { skipped++; continue; }
              seenIds.add(adId); added++;
              jobsToInsert.push({
                user_id:     user.id,
                source_id:   makeSourceId('adzuna', adId),
                source:      'adzuna',
                title,
                company:     ad.company?.display_name ?? 'Onbekend',
                location:    ad.location?.display_name ?? '',
                description: ad.description ?? '',
                url:         ad.redirect_url ?? `https://www.adzuna.be/jobs/details/${adId}`,
              });
            }
            send({ type: 'log', message: `  [adzuna] "${kw}" \u2014 ${ads.length} results, ${added} matched, ${skipped} skipped` });
          } catch (e: any) {
            send({ type: 'log', message: `\u2717 [adzuna] "${kw}" \u2014 ${e.message ?? 'unknown error'}` });
            if (e.message?.includes('429')) await sleep(2000);
          }
        }

        if (isAdmin && apiCallsMade > 0) {
          const today        = new Date().toISOString().slice(0, 10);
          const lastCallDate = settings?.last_call_date ?? '';
          const prevToday    = lastCallDate === today ? (settings?.adzuna_calls_today ?? 0) : 0;
          const prevMonth    = settings?.adzuna_calls_month ?? 0;
          await supabase.from('user_settings').update({
            adzuna_calls_today: prevToday + apiCallsMade,
            adzuna_calls_month: prevMonth + apiCallsMade,
            last_call_date: today,
          }).eq('user_id', user.id);
          send({ type: 'log', message: `${CHART} Adzuna calls this run: ${apiCallsMade} | today: ${prevToday + apiCallsMade} | month: ${prevMonth + apiCallsMade}` });
        }

        // Jobat via scrape.do (static HTML, one request per keyword)
        if (scrapeDoToken) {
          send({ type: 'log', message: `\u25b6 scrape.do | Jobat (${activeKeywords.length} keywords)` });
          const jobatTargets = buildJobatTargets(activeKeywords, userCity, userRadius);
          const seenJobUrls = new Set<string>();

          for (const target of jobatTargets) {
            await sleep(300);
            const html = await fetchViaScrapesDo(target.url, scrapeDoToken);
            if (!html) {
              send({ type: 'log', message: `\u2717 [jobat] "${target.keyword}" \u2014 empty HTML response` });
              continue;
            }
            const parsed = parseJobatJobs(html, activeKeywords);
            let added = 0; let skipped = 0;
            for (const job of parsed) {
              if (seenIds.has(job.source_id) || seenJobUrls.has(job.url)) { skipped++; continue; }
              seenIds.add(job.source_id);
              seenJobUrls.add(job.url);
              added++;
              jobsToInsert.push({ ...job, user_id: user.id });
            }
            send({ type: 'log', message: `  [jobat] "${target.keyword}" \u2014 parsed=${parsed.length} added=${added} skipped=${skipped}` });
          }
        }

        const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
        send({ type: 'log', message: `\u2192 ${uniqueJobs.length} unique jobs to insert` });

        if (uniqueJobs.length === 0) {
          send({ type: 'done', count: 0, total_found: 0 });
          controller.close(); return;
        }

        const { data, error } = await supabase.from('jobs')
          .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true }).select();
        if (error) {
          send({ type: 'error', message: error.message });
        } else {
          const inserted = data?.length ?? 0;
          send({ type: 'log', message: `\u2713 inserted ${inserted} new jobs (${uniqueJobs.length - inserted} duplicates skipped)` });
          send({ type: 'done', count: inserted, total_found: uniqueJobs.length });
        }

      } catch (err: any) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: err.message }) + '\n'));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control':     'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
