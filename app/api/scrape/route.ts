import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { scrapeJobDescription } from '@/lib/scrape-job-description';
import { createHash } from 'crypto';

export const maxDuration = 120;

interface JobInsert {
  user_id:     string;
  source_id:   string;
  source:      string;
  title:       string;
  company:     string;
  location:    string;
  description: string;
  url:         string;
}

const hashId = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 24);
const makeSourceId = (source: string, id: string) => `${source}-${hashId(id)}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const SCRAPE_COOLDOWN_MS = 60_000;

// Sources known to block serverless fetch (CAPTCHA / 403) — skip direct
// enrichment for these and rely on the description already in the Adzuna payload.
const BLOCKED_ENRICHMENT_HOSTS = ['jobat.be', 'stepstone.be', 'stepstone.com'];

function isBlockedEnrichmentUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return BLOCKED_ENRICHMENT_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

const TITLE_KEYWORDS = [
  'software support', 'it helpdesk', 'it help desk', 'helpdesk', 'help desk',
  'support engineer', 'application support', 'applicatiebeheerder', 'functioneel beheerder',
  'servicedesk', 'service desk', 'it support', '1st line', '2nd line', 'first line', 'second line',
  'technisch support', 'ict support', 'desktop support', 'field support', 'end user support', 'deskside support',
];

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

async function handleScrape(request: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const tagsParam = url.searchParams.get('tags') || '';
    const customTags = tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ADMIN_USER_ID = '03e2e00d-93be-45b8-b7dd-92586cff554f';
    const isAdmin = user.id === ADMIN_USER_ID;

    let userCity      = 'Antwerp';
    let userRadius    = 30;
    let userKeywords: string[] = [];
    let adzunaId      = process.env.ADZUNA_APP_ID  || '';
    let adzunaKey     = process.env.ADZUNA_APP_KEY || '';

    const { data: settings } = await supabase
      .from('user_settings')
      .select('adzuna_app_id, adzuna_app_key, keywords, city, radius, adzuna_calls_today, adzuna_calls_month, last_call_date, last_scrape_at')
      .eq('user_id', user.id)
      .single();

    // Admins bypass cooldown entirely
    if (!isAdmin) {
      let cooldownRejected = false;
      try {
        // Primary path: atomic RPC — checks and stamps last_scrape_at in one
        // SQL transaction, eliminating the read-check-write race condition.
        const { data: claimed } = await supabase.rpc('try_claim_scrape', {
          p_user_id:     user.id,
          p_cooldown_ms: SCRAPE_COOLDOWN_MS,
        });
        if (claimed === false) cooldownRejected = true;
      } catch {
        // Fallback path (RPC unavailable): non-atomic check + update.
        // There is a small race window here, but this path only fires when
        // the RPC itself errors — acceptable as a last resort.
        if (settings?.last_scrape_at) {
          const msSinceLast = Date.now() - new Date(settings.last_scrape_at).getTime();
          if (msSinceLast < SCRAPE_COOLDOWN_MS) cooldownRejected = true;
        }
        if (!cooldownRejected) {
          try {
            await supabase
              .from('user_settings')
              .update({ last_scrape_at: new Date().toISOString() })
              .eq('user_id', user.id);
          } catch (stampErr) {
            // Stamp failed — log but don't block the scrape; the RPC will
            // catch duplicate calls once it's available again.
            console.warn('Failed to stamp last_scrape_at in fallback path:', stampErr);
          }
        }
      }

      if (cooldownRejected) {
        const msSinceLast = settings?.last_scrape_at
          ? Date.now() - new Date(settings.last_scrape_at).getTime()
          : 0;
        const retryAfter = Math.ceil((SCRAPE_COOLDOWN_MS - msSinceLast) / 1000);
        return NextResponse.json(
          { error: `Scrape cooldown active. Retry in ${retryAfter}s.` },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
      }
    }

    if (settings?.adzuna_app_id)    adzunaId     = settings.adzuna_app_id;
    if (settings?.adzuna_app_key)   adzunaKey    = settings.adzuna_app_key;
    if (settings?.keywords?.length) userKeywords = settings.keywords;
    if (settings?.city)             userCity     = settings.city;
    if (settings?.radius)           userRadius   = settings.radius;

    // Admins have no keyword cap; regular users are capped at 10
    const activeKeywords: string[] =
      customTags.length > 0
        ? customTags
        : userKeywords.length > 0
        ? (isAdmin ? userKeywords : userKeywords.slice(0, 10))
        : TITLE_KEYWORDS;

    const jobsToInsert: JobInsert[] = [];
    const seenIds = new Set<string>();

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
            if (!titleMatches(ad.title ?? '', activeKeywords)) continue;
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
      try {
        await supabase.rpc('increment_adzuna_calls', {
          p_user_id:    user.id,
          p_today:      today,
          p_is_new_day: isNewDay,
        });
      } catch {
        const callsToday = isNewDay ? 1 : ((settings?.adzuna_calls_today ?? 0) + 1);
        const callsMonth = (settings?.adzuna_calls_month ?? 0) + 1;
        await supabase.from('user_settings').update({
          adzuna_calls_today: callsToday,
          adzuna_calls_month: callsMonth,
          last_call_date: today,
        }).eq('user_id', user.id);
      }
    }

    const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
    if (uniqueJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Geen nieuwe vacatures gevonden.' });

    const { data, error } = await supabase
      .from('jobs')
      .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true })
      .select('id, url, description, source');

    if (error) throw error;

    // Enrich short descriptions via direct fetch.
    // Skip URLs from sources known to block serverless requests (Jobat, Stepstone)
    // to avoid silent empty-string returns and unnecessary timeout delays.
    const needsEnrichment = (data ?? []).filter(
      (j: any) =>
        j.url &&
        (!j.description || j.description.trim().length < 100) &&
        !isBlockedEnrichmentUrl(j.url),
    );

    const skippedEnrichment = (data ?? []).filter(
      (j: any) =>
        j.url &&
        (!j.description || j.description.trim().length < 100) &&
        isBlockedEnrichmentUrl(j.url),
    );

    if (skippedEnrichment.length > 0) {
      console.warn(
        `Enrichment skipped for ${skippedEnrichment.length} job(s) on blocked hosts:`,
        skippedEnrichment.map((j: any) => j.url),
      );
    }

    if (needsEnrichment.length > 0) {
      const ENRICH_BATCH = 4;
      for (let i = 0; i < needsEnrichment.length; i += ENRICH_BATCH) {
        if (i > 0) await sleep(500);
        const batch = needsEnrichment.slice(i, i + ENRICH_BATCH);
        await Promise.allSettled(
          batch.map(async (job: any) => {
            const desc = await scrapeJobDescription(job.url);
            if (desc.length > 100) {
              await supabase.from('jobs').update({ description: desc }).eq('id', job.id);
            }
          })
        );
      }
    }

    return NextResponse.json({ success: true, count: data?.length ?? 0, total_found: uniqueJobs.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) { return handleScrape(request); }
export async function POST(request: Request) { return handleScrape(request); }
