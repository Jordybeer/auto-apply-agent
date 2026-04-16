import { createClient } from '@/lib/supabase-request';
import { createServiceClient } from '@/lib/supabase-service';
import { createHash } from 'crypto';
import { ADMIN_USER_ID } from '@/lib/env';
import { scrapeJobDescription } from '@/lib/scrape-job-description';
import { assertSafeUrl } from '@/lib/url-guard';
import type { SupabaseClient } from '@supabase/supabase-js';

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

// ─── Shared types ──────────────────────────────────────────────────────────────

interface JobRow {
  user_id: string;
  source_id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
}

interface KeywordBatch {
  newJobs: JobRow[];
  apiCallMade: boolean;
  counts: { adzuna: number; jobat: number; stepstone: number; indeed: number };
  errors: { adzuna?: string; jobat?: string; stepstone?: string; indeed?: string };
  jinaRaw: {
    jobat:     { text: string; len: number } | null;
    stepstone: { text: string; len: number } | null;
  };
}

// ─── Adzuna ───────────────────────────────────────────────────────────────────

async function fetchAdzuna(
  keyword: string,
  location: string,
  distanceKm: number,
  appId: string,
  appKey: string,
  page = 1,
): Promise<unknown[]> {
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
  assertSafeUrl(searchUrl);
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
  } catch (e: unknown) {
    clearTimeout(timer);
    const err = e as { name?: string; message?: string };
    const isTimeout = err?.name === 'AbortError';
    return { text: '', error: isTimeout ? 'timeout (30s)' : String(err?.message ?? e) };
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
): JobRow[] {
  if (!markdown) return [];
  const jobs: JobRow[] = [];
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
  `https://www.stepstone.be/jobs/${kw.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/in-${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const indeedBESearchUrl = (kw: string, city: string) =>
  `https://be.indeed.com/jobs?q=${encodeURIComponent(kw)}&l=${encodeURIComponent(city)}`;

// Jobat job URLs: /nl/jobs/{slug}/job_{id} or /en/jobs/{slug}/job_{id}
const JOBAT_JOB_URL = /jobat\.be\/(en|nl)\/jobs\/[^/]+\/job_\d+/;

// Stepstone BE job URLs: /jobs--{title-slug}--{id}-inline.html
const STEPSTONE_JOB_URL = /stepstone\.be\/jobs--[\w-]+--\d{4,}-inline\.html/;

const INDEED_JOB_URL = /indeed\.com\/(rc\/clk|viewjob|company\/.+\/jobs)\?/;

// ─── Shared keyword scraper ───────────────────────────────────────────────────

async function scrapeKeyword(
  kw: string,
  userId: string,
  city: string,
  radius: number,
  adzunaId: string,
  adzunaKey: string,
  activeKeywords: string[],
  titleFilter: string[] | null,
  seenIds: Set<string>,
): Promise<KeywordBatch> {
  const [adzunaRes, jobatRaw, stepsRaw, indeedRaw] = await Promise.allSettled([
    fetchAdzuna(kw, city, radius, adzunaId, adzunaKey),
    fetchListingPageViaJina(jobatSearchUrl(kw, city, radius), { 'X-Set-Cookie': JOBAT_CONSENT_COOKIE }),
    fetchListingPageViaJina(stepstoneBESearchUrl(kw, city)),
    fetchListingPageViaJina(indeedBESearchUrl(kw, city)),
  ]);

  const toJobResult = (
    raw: PromiseSettledResult<{ text: string; error?: string }>,
    urlPattern: RegExp,
    source: string,
  ): PromiseSettledResult<JobRow[]> =>
    raw.status === 'fulfilled'
      ? (raw.value.error
        ? { status: 'rejected', reason: new Error(raw.value.error) }
        : { status: 'fulfilled', value: extractJobsFromMarkdown(raw.value.text, urlPattern, source, userId, activeKeywords) })
      : (raw as PromiseRejectedResult);

  const jobatRes  = toJobResult(jobatRaw  as PromiseSettledResult<{ text: string; error?: string }>, JOBAT_JOB_URL,    'jobat');
  const stepsRes  = toJobResult(stepsRaw  as PromiseSettledResult<{ text: string; error?: string }>, STEPSTONE_JOB_URL, 'stepstone');
  const indeedRes = toJobResult(indeedRaw as PromiseSettledResult<{ text: string; error?: string }>, INDEED_JOB_URL,   'indeed');

  const newJobs: JobRow[] = [];
  const counts  = { adzuna: 0, jobat: 0, stepstone: 0, indeed: 0 };
  const errors: KeywordBatch['errors'] = {};
  let apiCallMade = false;

  if (adzunaRes.status === 'fulfilled') {
    apiCallMade = true;
    for (const ad of adzunaRes.value as Record<string, unknown>[]) {
      const adId = String(ad['id'] ?? '');
      if (!adId) continue;
      const title = String(ad['title'] ?? '');
      if (titleFilter && !titleMatches(title, titleFilter)) continue;
      const sid = makeSourceId('adzuna', adId);
      if (seenIds.has(sid)) continue;
      seenIds.add(sid);
      counts.adzuna++;
      newJobs.push({
        user_id:     userId,
        source_id:   sid,
        source:      'adzuna',
        title,
        company:     String((ad['company'] as Record<string, unknown>)?.['display_name'] ?? 'Onbekend'),
        location:    String((ad['location'] as Record<string, unknown>)?.['display_name'] ?? ''),
        description: String(ad['description'] ?? ''),
        url:         String(ad['redirect_url'] ?? `https://www.adzuna.be/jobs/details/${adId}`),
      });
    }
  } else {
    errors.adzuna = (adzunaRes as PromiseRejectedResult).reason?.message ?? String((adzunaRes as PromiseRejectedResult).reason);
  }

  const jinaEntries: [PromiseSettledResult<JobRow[]>, keyof typeof counts][] = [
    [jobatRes,  'jobat'],
    [stepsRes,  'stepstone'],
    [indeedRes, 'indeed'],
  ];

  for (const [res, label] of jinaEntries) {
    if (res.status === 'rejected') {
      errors[label] = (res as PromiseRejectedResult).reason?.message ?? String((res as PromiseRejectedResult).reason);
      continue;
    }
    for (const job of (res as PromiseFulfilledResult<JobRow[]>).value) {
      if (seenIds.has(job.source_id)) continue;
      if (titleFilter && !titleMatches(job.title, titleFilter)) continue;
      seenIds.add(job.source_id);
      counts[label]++;
      newJobs.push(job);
    }
  }

  const jinaRaw = {
    jobat:     jobatRaw.status === 'fulfilled'
      ? { text: (jobatRaw as PromiseFulfilledResult<{ text: string }>).value.text, len: (jobatRaw as PromiseFulfilledResult<{ text: string }>).value.text.length }
      : null,
    stepstone: stepsRaw.status === 'fulfilled'
      ? { text: (stepsRaw as PromiseFulfilledResult<{ text: string }>).value.text, len: (stepsRaw as PromiseFulfilledResult<{ text: string }>).value.text.length }
      : null,
  };

  return { newJobs, apiCallMade, counts, errors, jinaRaw };
}

// ─── Shared enrichment ────────────────────────────────────────────────────────

async function enrichJobs(
  jobs: { id: string; url: string; description: string }[],
  supabase: SupabaseClient,
  onError: (url: string, msg: string) => void,
) {
  const ENRICH_BATCH = 4;
  for (let i = 0; i < jobs.length; i += ENRICH_BATCH) {
    if (i > 0) await sleep(500);
    await Promise.allSettled(
      jobs.slice(i, i + ENRICH_BATCH).map(async (job) => {
        try {
          const desc = await scrapeJobDescription(job.url);
          if (desc.length > 100) {
            await supabase.from('jobs').update({ description: desc }).eq('id', job.id);
          }
        } catch (e: unknown) {
          onError(job.url, e instanceof Error ? e.message : String(e));
        }
      }),
    );
  }
}

// ─── scrapeForUser (cron path) ────────────────────────────────────────────────

export async function scrapeForUser(userId: string, service: SupabaseClient): Promise<number> {
  const dbLog = makeDbLogger(userId);

  let userCity   = 'Antwerp';
  let userRadius = 30;
  let userKeywords: string[] = [];
  let adzunaId   = process.env.ADZUNA_APP_ID  || '';
  let adzunaKey  = process.env.ADZUNA_APP_KEY || '';
  const isAdmin  = ADMIN_USER_ID !== '' && userId === ADMIN_USER_ID;

  const { data: settings } = await service
    .from('user_settings')
    .select('adzuna_app_id, adzuna_app_key, keywords, city, radius, adzuna_calls_today, adzuna_calls_month, last_call_date')
    .eq('user_id', userId)
    .single();

  if (isAdmin && settings?.adzuna_app_id)  adzunaId  = settings.adzuna_app_id;
  if (isAdmin && settings?.adzuna_app_key) adzunaKey = settings.adzuna_app_key;
  if (settings?.keywords?.length) userKeywords = settings.keywords;
  if (settings?.city)   userCity   = settings.city;
  if (settings?.radius) userRadius = settings.radius;

  await service.from('user_settings')
    .update({ last_scrape_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (!adzunaId || !adzunaKey) return 0;

  const activeKeywords = userKeywords.length > 0 ? userKeywords : TITLE_KEYWORDS;
  const titleFilter: string[] | null = userKeywords.length === 0 ? buildTitleFilter([]) : null;

  const jobsToInsert: JobRow[] = [];
  const seenIds = new Set<string>();
  let apiCallsMade = 0;

  for (let i = 0; i < activeKeywords.length; i++) {
    if (i > 0) await sleep(300);
    const kw = activeKeywords[i];
    const batch = await scrapeKeyword(kw, userId, userCity, userRadius, adzunaId, adzunaKey, activeKeywords, titleFilter, seenIds);
    if (batch.apiCallMade) apiCallsMade++;
    jobsToInsert.push(...batch.newJobs);
    if (batch.errors.adzuna)    dbLog.add('error', 'scrape', `adzuna error for "${kw}": ${batch.errors.adzuna}`,    { keyword: kw, source: 'adzuna' });
    if (batch.errors.jobat)     dbLog.add('warn',  'scrape', `jina/jobat error for "${kw}": ${batch.errors.jobat}`, { keyword: kw, source: 'jobat' });
    if (batch.errors.stepstone) dbLog.add('warn',  'scrape', `jina/stepstone error for "${kw}": ${batch.errors.stepstone}`, { keyword: kw, source: 'stepstone' });
    if (batch.errors.indeed)    dbLog.add('warn',  'scrape', `jina/indeed error for "${kw}": ${batch.errors.indeed}`,       { keyword: kw, source: 'indeed' });
  }

  if (isAdmin && apiCallsMade > 0) {
    const today        = new Date().toISOString().slice(0, 10);
    const lastCallDate = settings?.last_call_date ?? '';
    const prevToday    = lastCallDate === today ? (settings?.adzuna_calls_today ?? 0) : 0;
    const prevMonth    = settings?.adzuna_calls_month ?? 0;
    await service.from('user_settings').update({
      adzuna_calls_today: prevToday + apiCallsMade,
      adzuna_calls_month: prevMonth + apiCallsMade,
      last_call_date: today,
    }).eq('user_id', userId);
  }

  const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
  if (uniqueJobs.length === 0) { await dbLog.flush(); return 0; }

  const { data, error } = await service.from('jobs')
    .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true })
    .select('id, url, description');

  if (error) {
    dbLog.add('error', 'scrape', `DB upsert error: ${error.message}`, { code: error.code });
    await dbLog.flush();
    return 0;
  }

  const inserted = data?.length ?? 0;
  dbLog.add('info', 'scrape', `✓ inserted ${inserted} new jobs`, {});

  const needsEnrichment = (data ?? []).filter(
    (j: { url: string; description: string }) => j.url && (!j.description || j.description.trim().length < 100),
  );
  if (needsEnrichment.length > 0) {
    await enrichJobs(
      needsEnrichment as { id: string; url: string; description: string }[],
      service,
      (url, msg) => dbLog.add('warn', 'scrape', `enrichment failed for ${url}: ${msg}`, { url }),
    );
  }

  await dbLog.flush();
  return inserted;
}

// ─── Streaming POST handler ───────────────────────────────────────────────────

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

        const jobsToInsert: JobRow[] = [];
        const seenIds = new Set<string>();
        let apiCallsMade = 0;
        let jinaDebugDone = false;

        await sleep(500);

        for (let i = 0; i < activeKeywords.length; i++) {
          if (i > 0) await sleep(300);
          const kw = activeKeywords[i];
          const batch = await scrapeKeyword(kw, user.id, userCity, userRadius, adzunaId, adzunaKey, activeKeywords, titleFilter, seenIds);

          // One-shot debug log for first keyword so we can verify regex matching
          if (!jinaDebugDone) {
            jinaDebugDone = true;
            for (const [raw, label] of [
              [batch.jinaRaw.jobat,     'jobat'],
              [batch.jinaRaw.stepstone, 'stepstone'],
            ] as [{ text: string; len: number } | null, string][]) {
              if (raw) {
                const preview = raw.text.slice(0, 400).replace(/\n/g, '↵');
                dbLog.add('debug', 'jina-debug', `[${label}] kw="${kw}" len=${raw.len} preview=${preview}`, { source: label, keyword: kw, length: raw.len });
              }
            }
          }

          if (batch.apiCallMade) apiCallsMade++;
          jobsToInsert.push(...batch.newJobs);

          if (batch.errors.adzuna) {
            log(`adzuna error for "${kw}": ${batch.errors.adzuna}`, 'error', { keyword: kw, source: 'adzuna', reason: batch.errors.adzuna });
          }
          for (const label of ['jobat', 'stepstone', 'indeed'] as const) {
            if (batch.errors[label]) {
              log(`jina/${label} error for "${kw}": ${batch.errors[label]}`, 'warn', { keyword: kw, source: label, reason: batch.errors[label] });
            }
          }

          const parts = [
            batch.errors.adzuna    ? `adzuna:✗`    : `adzuna:${batch.counts.adzuna}`,
            batch.errors.jobat     ? `jobat:✗`     : `jobat:${batch.counts.jobat}`,
            batch.errors.stepstone ? `stepstone:✗` : `stepstone:${batch.counts.stepstone}`,
            batch.errors.indeed    ? `indeed:✗`    : `indeed:${batch.counts.indeed}`,
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
            (j: { url: string; description: string }) => j.url && (!j.description || j.description.trim().length < 100),
          );
          if (needsEnrichment.length > 0) {
            log(`▶ enriching ${needsEnrichment.length} jobs via Jina…`);
            await enrichJobs(
              needsEnrichment as { id: string; url: string; description: string }[],
              supabase,
              (url, msg) => dbLog.add('warn', 'scrape', `enrichment failed for ${url}: ${msg}`, { url }),
            );
            log(`✓ enrichment done`, 'info');
          }

          send({ type: 'done', count: inserted, total_found: uniqueJobs.length });
        }

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: msg }) + '\n'));
        dbLog.add('error', 'scrape', `scrape crashed: ${msg}`, { stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined });
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
