import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-request';
import { createHash } from 'crypto';

export const maxDuration = 120;

const hashId = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 24);
const makeSourceId = (source: string, id: string) => `${source}-${hashId(id)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TITLE_KEYWORDS = [
  'software support', 'it helpdesk', 'it help desk', 'helpdesk', 'help desk',
  'support engineer', 'application support', 'applicatiebeheerder', 'functioneel beheerder',
  'servicedesk', 'service desk', 'it support', '1st line', '2nd line', 'first line', 'second line',
  'technisch support', 'ict support', 'desktop support', 'field support', 'end user support', 'deskside support',
];

function titleMatches(title: string, keywords: string[]): boolean {
  const lower = title.toLowerCase();
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let userCity     = 'Antwerp';
    let userRadius   = 30;
    let userKeywords: string[] = [];
    let adzunaId     = process.env.ADZUNA_APP_ID  || '';
    let adzunaKey    = process.env.ADZUNA_APP_KEY || '';

    const { data: settings } = await supabase
      .from('user_settings')
      .select('adzuna_app_id, adzuna_app_key, keywords, city, radius')
      .eq('user_id', user.id)
      .single();

    if (settings?.adzuna_app_id)  adzunaId  = settings.adzuna_app_id;
    if (settings?.adzuna_app_key) adzunaKey = settings.adzuna_app_key;
    if (settings?.keywords?.length) userKeywords = settings.keywords;
    if (settings?.city)   userCity   = settings.city;
    if (settings?.radius) userRadius = settings.radius;

    await supabase.from('user_settings').update({ last_scrape_at: new Date().toISOString() }).eq('user_id', user.id);

    if (!adzunaId || !adzunaKey) {
      return NextResponse.json(
        { success: false, error: 'Adzuna API credentials not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY.' },
        { status: 400 }
      );
    }

    const activeKeywords = customTags.length > 0
      ? customTags
      : userKeywords.length > 0
      ? userKeywords
      : TITLE_KEYWORDS;

    // Only apply title filter when falling back to default keywords.
    // When the user has set custom keywords or tags, trust Adzuna's relevance.
    const titleFilterKeywords: string[] | null =
      customTags.length === 0 && userKeywords.length === 0 ? TITLE_KEYWORDS : null;

    const jobsToInsert: any[] = [];
    const seenIds = new Set<string>();
    const BATCH = 3; // smaller batch + delay between to avoid 429

    for (let i = 0; i < activeKeywords.length; i += BATCH) {
      if (i > 0) await sleep(1000); // 1s cooldown between batches
      const batch = activeKeywords.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((kw) => fetchAdzuna(kw, userCity, userRadius, adzunaId, adzunaKey))
      );
      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        if (result.status === 'rejected') continue;
        for (const ad of result.value) {
          const adId = String(ad.id ?? '');
          if (!adId || seenIds.has(adId)) continue;
          if (titleFilterKeywords && !titleMatches(ad.title ?? '', titleFilterKeywords)) continue;
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

    const uniqueJobs = Array.from(new Map(jobsToInsert.map((j) => [j.source_id, j])).values());
    if (uniqueJobs.length === 0)
      return NextResponse.json({ success: true, count: 0, message: 'Geen nieuwe vacatures gevonden.' });

    const { data, error } = await supabase
      .from('jobs')
      .upsert(uniqueJobs, { onConflict: 'user_id,source_id', ignoreDuplicates: true })
      .select();

    if (error) throw error;
    return NextResponse.json({ success: true, count: data?.length ?? 0, total_found: uniqueJobs.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) { return handleScrape(request); }
export async function POST(request: Request) { return handleScrape(request); }
