import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
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

// ─── DB logger ────────────────────────────────────────────────────────────────

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

function makeDbLogger(userId: string) {
  const service = createServiceClient();
  const batch: { level: LogLevel; source: string; message: string; meta?: Record<string, unknown> }[] = [];

  const add = (level: LogLevel, source: string, message: string, meta?: Record<string, unknown>) => {
    batch.push({ level, source, message, meta });
  };

  const flush = async () => {
    if (batch.length === 0) return;
    const rows = batch.map((r) => ({
      level:   r.level,
      source:  r.source,
      message: r.message,
      meta:    r.meta ?? null,
      user_id: userId,
    }));
    await service.from('system_logs').insert(rows);
  };

  return { add, flush };
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

// ─── Jina-based listing scrapers ─────────────────────────────────────────────

async function fetchListingPageViaJina(
  searchUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<{ text: string; error?: string }> {
  const jinaUrl = `https://r.jina.ai/${searchUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const jinaHeaders: Record<string, string> = {
      Accept: 'text/plain',
      'X-Return-Format': 'markdown',
      ...extraHeaders,
    };
    const jinaKey = process.env.JINA_API_KEY;
    if (jinaKey) jinaHeaders['Authorization'] = `Bearer ${jinaKey}`;
    const res = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: jinaHeaders,
    });
    clearTimeout(timer);
    if (!res.ok) return { text: '', error: `HTTP ${res.status}` };
    return { text: (await res.text()).trim() };
  } catch (e: any) {
    clearTimeout(timer);
    const isTimeout = e?.name === 'AbortError';
    return { text: '', error: isTimeout ? 'timeout (30s)' : String(e?.message ?? e) };
  }
}

// Jobat: use X-Set-Cookie so Jina's headless browser injects the consent cookie
// before loading the page, bypassing the CookieFirst GDPR wall.
const JOBAT_CONSENT_COOKIE =
  'cookiefirst-consent=%7B%22necessary%22%3Atrue%2C%22performance%22%3Atrue%2C%22advertising%22%3Atrue%2C%22functional%22%3Atrue%7D; Domain=.jobat.be; Path=/';

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

const jobatSearchUrl = (kw: string, city: string, radius: number) =>
  `https://www.jobat.be/nl/jobs?keywords=${encodeURIComponent(kw)}&municipality=${encodeURIComponent(city)}&radius=${radius}`;

const stepstoneBESearchUrl = (kw: string, city: string) =>
  `https://www.stepstone.be/jobs/${kw.toLowerCase().replace(/[^a-z0-9]+/g, '-')}?location=${encodeURIComponent(city)}`;

const indeedBESearchUrl = (kw: string, city: string) =>
  `https://be.indeed.com/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(city)}`;

// Jobat job URLs: /nl/jobs/{slug}/job_{id} or /en/jobs/{slug}/job_{id}
const JOBAT_JOB_URL = /jobat\.be\/(en|nl)\/jobs\/[^/]+\/job_\d+/;

// Stepstone BE job URLs: /jobs--{title-slug}--{id}-inline.html
const STEPSTONE_JOB_URL = /stepstone\.be\/jobs--[\w-]+--\d{4,}-inline\.html/;

const INDEED_JOB_URL = /indeed\.com\/(rc\/clk|viewjob|company\/.+\/jobs)\?/;

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

  const dbLog = makeDbLogger(user.id);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));

      const log = (message: string, level: LogLevel = 'log', meta?: Record<string, unknown>) => {
        send({ type: 'log', message });
        dbLog.add(level, 'scrape', message, meta);
      };

      try {
        log(`▶ Scraping 4 sources | city: ${userCity} | radius: ${userRadius}km`, 'info');
        log(`▶ keywords (${activeKeywords.length}): ${activeKeywords.slice(0, 6).join(', ')}${activeKeywords.length > 6 ? '…' : ''}`);
        log(titleFilter ? `▶ title filter active (${titleFilter.length} terms)` : `▶ title filter: off (user keywords active)`);

        const jobsToInsert: any[] = [];
        const seenIds = new Set<string>();
        let apiCallsMade = 0;
        let jinaDebugDone = false;

        await sleep(500);

        for (let i = 0; i < activeKeywords.length; i++) {
          if (i > 0) await sleep(300);
          const kw = activeKeywords[i];

          const [adzunaRes, jobatRaw, stepsRaw, indeedRaw] = await Promise.allSettled([
            fetchAdzuna(kw, userCity, userRadius, adzunaId, adzunaKey),
            fetchListingPageViaJina(jobatSearchUrl(kw, userCity, userRadius), { 'X-Set-Cookie': JOBAT_CONSENT_COOKIE }),
            fetchListingPageViaJina(stepstoneBESearchUrl(kw, userCity)),
            fetchListingPageViaJina(indeedBESearchUrl(kw, userCity)),
          ]);

          // One-shot debug log for first keyword so we can verify regex matching
          if (!jinaDebugDone) {
            jinaDebugDone = true;
            for (const [raw, label] of [
              [jobatRaw,  'jobat'],
              [stepsRaw,  'stepstone'],
            ] as [PromiseSettledResult<{ text: string; error?: string }>, string][]) {
              if (raw.status === 'fulfilled') {
                const { text, error } = raw.value;
                const preview = text.slice(0, 400).replace(/\n/g, '↵');
                dbLog.add('debug', 'jina-debug', `[${label}] kw="${kw}" len=${text.length} err=${error ?? 'none'} preview=${preview}`, { source: label, keyword: kw, length: text.length });
              }
            }
          }

          // Convert raw Jina results to job arrays
          const jobatRes: PromiseSettledResult<any[]> = jobatRaw.status === 'fulfilled'
            ? (jobatRaw.value.error
              ? { status: 'rejected', reason: new Error(jobatRaw.value.error) }
              : { status: 'fulfilled', value: extractJobsFromMarkdown(jobatRaw.value.text, JOBAT_JOB_URL, 'jobat', user.id, activeKeywords) })
            : jobatRaw as PromiseRejectedResult;

          const stepsRes: PromiseSettledResult<any[]> = stepsRaw.status === 'fulfilled'
            ? (stepsRaw.value.error
              ? { status: 'rejected', reason: new Error(stepsRaw.value.error) }
              : { status: 'fulfilled', value: extractJobsFromMarkdown(stepsRaw.value.text, STEPSTONE_JOB_URL, 'stepstone', user.id, activeKeywords) })
            : stepsRaw as PromiseRejectedResult;

          const indeedRes: PromiseSettledResult<any[]> = indeedRaw.status === 'fulfilled'
            ? (indeedRaw.value.error
              ? { status: 'rejected', reason: new Error(indeedRaw.value.error) }
              : { status: 'fulfilled', value: extractJobsFromMarkdown(indeedRaw.value.text, INDEED_JOB_URL, 'indeed', user.id, activeKeywords) })
            : indeedRaw as PromiseRejectedResult;

          let adzunaCount = 0, jobatCount = 0, stepsCount = 0, indeedCount = 0;

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
          } else {
            const msg = `adzuna error for "${kw}": ${adzunaRes.reason?.message ?? adzunaRes.reason}`;
            log(msg, 'error', { keyword: kw, source: 'adzuna', reason: String(adzunaRes.reason) });
          }

          const jinaResults: [PromiseSettledResult<any[]>, string][] = [
            [jobatRes,  'jobat'],
            [stepsRes,  'stepstone'],
            [indeedRes, 'indeed'],
          ];

          for (const [res, label] of jinaResults) {
            if (res.status === 'rejected') {
              const errMsg = res.reason?.message ?? String(res.reason);
              log(`jina/${label} error for "${kw}": ${errMsg}`, 'warn', { keyword: kw, source: label, reason: errMsg });
              continue;
            }
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
            jobatRes.status  === 'rejected'  ? `jobat:✗`  : `jobat:${jobatCount}`,
            stepsRes.status  === 'rejected'  ? `stepstone:✗` : `stepstone:${stepsCount}`,
            indeedRes.status === 'rejected'  ? `indeed:✗` : `indeed:${indeedCount}`,
          ];
          log(`  "${kw}" — ${parts.join(' ')}`);
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
          log(`${CHART} Adzuna calls this run: ${apiCallsMade} | today: ${prevToday + apiCallsMade} | month: ${prevMonth + apiCallsMade}`, 'info');
        }

        const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
        log(`→ ${uniqueJobs.length} unique jobs to insert`, 'info');

        if (uniqueJobs.length === 0) {
          send({ type: 'done', count: 0, total_found: 0 });
          await dbLog.flush();
          controller.close(); return;
        }

        const { data, error } = await supabase.from('jobs')
          .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true })
          .select('id, url, description');

        if (error) {
          log(`DB upsert error: ${error.message}`, 'error', { code: error.code });
          send({ type: 'error', message: error.message });
        } else {
          const inserted = data?.length ?? 0;
          log(`✓ inserted ${inserted} new jobs (${uniqueJobs.length - inserted} duplicates skipped)`, 'info');

          const needsEnrichment = (data ?? []).filter(
            (j: any) => j.url && (!j.description || j.description.trim().length < 100),
          );
          if (needsEnrichment.length > 0) {
            log(`▶ enriching ${needsEnrichment.length} jobs via Jina…`);
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
                  } catch (e: any) {
                    dbLog.add('warn', 'scrape', `enrichment failed for ${job.url}: ${e?.message ?? e}`, { url: job.url });
                  }
                })
              );
            }
            log(`✓ enrichment done`, 'info');
          }

          send({ type: 'done', count: inserted, total_found: uniqueJobs.length });
        }

      } catch (err: any) {
        const msg = `scrape crashed: ${err.message}`;
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: err.message }) + '\n'));
        dbLog.add('error', 'scrape', msg, { stack: err.stack?.slice(0, 500) });
      }

      await dbLog.flush();
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
