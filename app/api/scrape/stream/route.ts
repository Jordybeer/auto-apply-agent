import { createClient } from '@/lib/supabase-request';
import { createHash } from 'crypto';
import { ADMIN_USER_ID } from '@/lib/env';
import { scrapeJobDescription } from '@/lib/scrape-job-description';

export const maxDuration = 120;

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

// ─── Jina-based listing scrapers ─────────────────────────────────────────────

/** Fetch a search-results page via Jina Reader, returning its markdown text. */
async function fetchListingPageViaJina(searchUrl: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${searchUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return (await res.text()).trim();
  } catch {
    clearTimeout(timer);
    return '';
  }
}

/**
 * Extract job listings from Jina markdown output.
 * Looks for `[Title](URL)` markdown links whose URL matches the platform pattern,
 * then filters by title keywords.
 */
function extractJobsFromMarkdown(
  markdown: string,
  urlPattern: RegExp,
  source: string,
  userId: string,
  keywords: string[],
): any[] {
  if (!markdown) return [];
  const jobs: any[] = [];
  const seen = new Set<string>();
  const linkRe = /\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(markdown)) !== null) {
    const title = m[1].trim().replace(/\s+/g, ' ');
    const rawUrl = m[2].trim();
    if (!urlPattern.test(rawUrl)) continue;
    // Deduplicate on URL without query string / fragment
    const dedupeKey = rawUrl.split('?')[0].split('#')[0];
    if (seen.has(dedupeKey)) continue;
    if (keywords.length > 0 && !titleMatches(title, keywords)) continue;
    seen.add(dedupeKey);
    jobs.push({
      user_id:     userId,
      source_id:   makeSourceId(source, dedupeKey),
      source,
      title,
      company:     '',
      location:    '',
      description: '',
      url:         rawUrl,
    });
  }
  return jobs;
}

// Search URL builders
const jobatSearchUrl = (kw: string, city: string, radius: number) =>
  `https://www.jobat.be/nl/jobs?keywords=${encodeURIComponent(kw)}&municipality=${encodeURIComponent(city)}&radius=${radius}`;

const stepstoneBESearchUrl = (kw: string, city: string) =>
  `https://www.stepstone.be/jobs/${kw.toLowerCase().replace(/[^a-z0-9]+/g, '-')}?location=${encodeURIComponent(city)}`;

const indeedBESearchUrl = (kw: string, city: string) =>
  `https://be.indeed.com/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(city)}`;

// Job URL patterns — used to filter Jina markdown links
const JOBAT_JOB_URL     = /jobat\.be\/(en|nl)\/job_/;
const STEPSTONE_JOB_URL = /stepstone\.be\/.+\/\d{4,}/;
const INDEED_JOB_URL    = /indeed\.com\/(rc\/clk|viewjob|company\/.+\/jobs)\?/;

export async function POST(request: Request) {
  const reqUrl     = new URL(request.url);
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

  let userCity   = 'Antwerp';
  let userRadius = 30;
  let userKeywords: string[] = [];
  let adzunaId   = process.env.ADZUNA_APP_ID  || '';
  let adzunaKey  = process.env.ADZUNA_APP_KEY || '';
  const isAdmin  = ADMIN_USER_ID !== '' && user.id === ADMIN_USER_ID;

  const { data: settings } = await supabase
    .from('user_settings')
    .select('adzuna_app_id, adzuna_app_key, keywords, city, radius, adzuna_calls_today, adzuna_calls_month, last_call_date')
    .eq('user_id', user.id)
    .single();

  if (isAdmin && settings?.adzuna_app_id)  adzunaId  = settings.adzuna_app_id;
  if (isAdmin && settings?.adzuna_app_key) adzunaKey = settings.adzuna_app_key;
  if (settings?.keywords?.length) userKeywords = settings.keywords;
  if (settings?.city)   userCity   = settings.city;
  if (settings?.radius) userRadius = settings.radius;

  await supabase.from('user_settings')
    .update({ last_scrape_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (!adzunaId || !adzunaKey) {
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
        send({ type: 'log', message: `▶ Scraping 5 sources | city: ${userCity} | radius: ${userRadius}km` });
        send({ type: 'log', message: `▶ keywords (${activeKeywords.length}): ${activeKeywords.slice(0, 6).join(', ')}${activeKeywords.length > 6 ? '…' : ''}` });
        send({ type: 'log', message: titleFilter ? `▶ title filter active (${titleFilter.length} terms)` : `▶ title filter: off (user keywords active)` });

        const jobsToInsert: any[] = [];
        const seenIds = new Set<string>();
        let apiCallsMade = 0;

        await sleep(500);

        // ── Run all sources concurrently per keyword ───────────────────────
        for (let i = 0; i < activeKeywords.length; i++) {
          if (i > 0) await sleep(300);
          const kw = activeKeywords[i];

          const [adzunaRes, vdabRes, jobatRes, stepsRes, indeedRes] = await Promise.allSettled([
            // 1. Adzuna API
            fetchAdzuna(kw, userCity, userRadius, adzunaId, adzunaKey),
            // 2. VDAB JSON API
            fetchVDAB(kw, userCity, userRadius),
            // 3. Jobat via Jina
            fetchListingPageViaJina(jobatSearchUrl(kw, userCity, userRadius))
              .then(md => extractJobsFromMarkdown(md, JOBAT_JOB_URL, 'jobat', user.id, activeKeywords)),
            // 4. Stepstone via Jina
            fetchListingPageViaJina(stepstoneBESearchUrl(kw, userCity))
              .then(md => extractJobsFromMarkdown(md, STEPSTONE_JOB_URL, 'stepstone', user.id, activeKeywords)),
            // 5. Indeed BE via Jina
            fetchListingPageViaJina(indeedBESearchUrl(kw, userCity))
              .then(md => extractJobsFromMarkdown(md, INDEED_JOB_URL, 'indeed', user.id, activeKeywords)),
          ]);

          let adzunaCount = 0, vdabCount = 0, jobatCount = 0, stepsCount = 0, indeedCount = 0;

          // Adzuna
          if (adzunaRes.status === 'fulfilled') {
            apiCallsMade++;
            for (const ad of adzunaRes.value) {
              const adId = String(ad.id ?? '');
              if (!adId) continue;
              const title = ad.title ?? '';
              if (titleFilter && !titleMatches(title, titleFilter)) continue;
              const sid = makeSourceId('adzuna', adId);
              if (seenIds.has(sid)) continue;
              seenIds.add(sid); adzunaCount++;
              jobsToInsert.push({
                user_id:     user.id,
                source_id:   sid,
                source:      'adzuna',
                title,
                company:     ad.company?.display_name ?? 'Onbekend',
                location:    ad.location?.display_name ?? '',
                description: ad.description ?? '',
                url:         ad.redirect_url ?? `https://www.adzuna.be/jobs/details/${adId}`,
              });
            }
          }

          // VDAB
          if (vdabRes.status === 'fulfilled') {
            for (const v of vdabRes.value) {
              const mapped = mapVDABJob(user.id, v) as any;
              if (!mapped.source_id || seenIds.has(mapped.source_id)) continue;
              if (titleFilter && !titleMatches(mapped.title, titleFilter)) continue;
              seenIds.add(mapped.source_id); vdabCount++;
              jobsToInsert.push(mapped);
            }
          }

          // Jobat, Stepstone, Indeed (already mapped)
          for (const [res, counter, label] of [
            [jobatRes, 0, 'jobat'],
            [stepsRes, 0, 'stepstone'],
            [indeedRes, 0, 'indeed'],
          ] as [PromiseSettledResult<any[]>, number, string][]) {
            if (res.status !== 'fulfilled') continue;
            let count = 0;
            for (const job of res.value) {
              if (seenIds.has(job.source_id)) continue;
              if (titleFilter && !titleMatches(job.title, titleFilter)) continue;
              seenIds.add(job.source_id); count++;
              jobsToInsert.push(job);
            }
            if (label === 'jobat')     jobatCount = count;
            if (label === 'stepstone') stepsCount = count;
            if (label === 'indeed')    indeedCount = count;
          }

          const parts = [
            adzunaRes.status === 'rejected'  ? `adzuna:✗` : `adzuna:${adzunaCount}`,
            vdabRes.status   === 'rejected'  ? `vdab:✗`   : `vdab:${vdabCount}`,
            jobatRes.status  === 'rejected'  ? `jobat:✗`  : `jobat:${jobatCount}`,
            stepsRes.status  === 'rejected'  ? `stepstone:✗` : `stepstone:${stepsCount}`,
            indeedRes.status === 'rejected'  ? `indeed:✗` : `indeed:${indeedCount}`,
          ];
          send({ type: 'log', message: `  "${kw}" — ${parts.join(' ')}` });
        }

        // Track Adzuna API calls
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

        const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
        send({ type: 'log', message: `→ ${uniqueJobs.length} unique jobs to insert` });

        if (uniqueJobs.length === 0) {
          send({ type: 'done', count: 0, total_found: 0 });
          controller.close(); return;
        }

        const { data, error } = await supabase.from('jobs')
          .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true })
          .select('id, url, description');

        if (error) {
          send({ type: 'error', message: error.message });
        } else {
          const inserted = data?.length ?? 0;
          send({ type: 'log', message: `✓ inserted ${inserted} new jobs (${uniqueJobs.length - inserted} duplicates skipped)` });

          // Enrich all new jobs with short/missing descriptions via Jina
          const needsEnrichment = (data ?? []).filter(
            (j: any) => j.url && (!j.description || j.description.trim().length < 100),
          );
          if (needsEnrichment.length > 0) {
            send({ type: 'log', message: `▶ enriching ${needsEnrichment.length} jobs via Jina…` });
            const ENRICH_BATCH = 4;
            for (let i = 0; i < needsEnrichment.length; i += ENRICH_BATCH) {
              if (i > 0) await sleep(500);
              const batch = needsEnrichment.slice(i, i + ENRICH_BATCH);
              await Promise.allSettled(
                batch.map(async (job: any) => {
                  try {
                    const desc = await scrapeJobDescription(job.url);
                    if (desc.length > 100) {
                      await supabase.from('jobs').update({ description: desc }).eq('id', job.id);
                    }
                  } catch {
                    // non-fatal
                  }
                })
              );
            }
            send({ type: 'log', message: `✓ enrichment done` });
          }

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
