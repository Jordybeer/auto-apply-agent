import { createClient } from '@/lib/supabase-request';
import type { Element } from 'domhandler';
import { createHash } from 'crypto';

export const maxDuration = 120;

const ADMIN_USER_ID = '03e2e00d-93be-45b8-b7dd-92586cff554f';

const hashId = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 24);
const makeSourceId = (source: string, id: string) => `${source}-${hashId(id)}`;

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

export async function POST(request: Request) {
  const url = new URL(request.url);
  const tagsParam = url.searchParams.get('tags') || '';
  const customTags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);

  // Auth + settings MUST be resolved outside ReadableStream (cookies not accessible inside)
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  const encoder = new TextEncoder();

  if (authError || !user) {
    return new Response(
      encoder.encode(JSON.stringify({ type: 'error', message: 'Not authenticated.' }) + '\n'),
      { status: 401, headers: { 'Content-Type': 'application/x-ndjson' } }
    );
  }

  // Load settings outside the stream
  let userCity     = 'Antwerp';
  let userRadius   = 30;
  let userKeywords: string[] = [];
  let adzunaId     = process.env.ADZUNA_APP_ID  || '';
  let adzunaKey    = process.env.ADZUNA_APP_KEY || '';
  const isAdmin    = user.id === ADMIN_USER_ID;

  const { data: settings } = await supabase
    .from('user_settings')
    .select('adzuna_app_id, adzuna_app_key, keywords, city, radius, adzuna_calls_today, adzuna_calls_month')
    .eq('user_id', user.id)
    .single();

  if (isAdmin && settings?.adzuna_app_id)  adzunaId  = settings.adzuna_app_id;
  if (isAdmin && settings?.adzuna_app_key) adzunaKey = settings.adzuna_app_key;
  if (settings?.keywords?.length) userKeywords = settings.keywords;
  if (settings?.city)   userCity   = settings.city;
  if (settings?.radius) userRadius = settings.radius;

  await supabase
    .from('user_settings')
    .update({ last_scrape_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (!adzunaId || !adzunaKey) {
    return new Response(
      encoder.encode(JSON.stringify({ type: 'error', message: 'Adzuna API credentials not configured.' }) + '\n'),
      { status: 400, headers: { 'Content-Type': 'application/x-ndjson' } }
    );
  }

  const activeKeywords = customTags.length > 0
    ? customTags
    : userKeywords.length > 0
    ? userKeywords
    : TITLE_KEYWORDS;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));

      try {
        send({ type: 'log', message: `▶ Adzuna BE | city: ${userCity} | radius: ${userRadius}km` });
        send({ type: 'log', message: `▶ keywords (${activeKeywords.length}): ${activeKeywords.slice(0, 6).join(', ')}${activeKeywords.length > 6 ? '...' : ''}` });

        const jobsToInsert: any[] = [];
        const seenIds = new Set<string>();
        let apiCallsMade = 0;

        const BATCH = 6;
        for (let i = 0; i < activeKeywords.length; i += BATCH) {
          const batch = activeKeywords.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map((kw) => fetchAdzuna(kw, userCity, userRadius, adzunaId, adzunaKey))
          );
          apiCallsMade += batch.length;

          for (let j = 0; j < batch.length; j++) {
            const kw = batch[j];
            const result = results[j];

            if (result.status === 'rejected') {
              send({ type: 'log', message: `✗ [adzuna] "${kw}" — ${result.reason?.message ?? 'unknown error'}` });
              continue;
            }

            const ads = result.value;
            let added = 0;
            let skipped = 0;

            for (const ad of ads) {
              const adId: string = String(ad.id ?? '');
              if (!adId || seenIds.has(adId)) { skipped++; continue; }
              const title: string = ad.title ?? '';
              if (!titleMatches(title, activeKeywords)) { skipped++; continue; }
              seenIds.add(adId);
              added++;
              jobsToInsert.push({
                user_id:   user.id,
                source_id: makeSourceId('adzuna', adId),
                source:    'adzuna',
                title,
                company:     ad.company?.display_name ?? 'Onbekend',
                location:    ad.location?.display_name ?? '',
                description: ad.description ?? '',
                url:         ad.redirect_url ?? `https://www.adzuna.be/jobs/details/${adId}`,
              });
            }

            send({ type: 'log', message: `  [adzuna] "${kw}" — ${ads.length} results, ${added} matched, ${skipped} skipped` });
          }
        }

        // Update call counters for admin
        if (isAdmin && apiCallsMade > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const lastCallDate = (settings as any)?.last_call_date ?? '';
          const prevToday = lastCallDate === today ? ((settings as any)?.adzuna_calls_today ?? 0) : 0;
          const prevMonth = (settings as any)?.adzuna_calls_month ?? 0;
          await supabase.from('user_settings').update({
            adzuna_calls_today: prevToday + apiCallsMade,
            adzuna_calls_month: prevMonth + apiCallsMade,
            last_call_date: today,
          }).eq('user_id', user.id);
          send({ type: 'log', message: `📊 Adzuna calls this run: ${apiCallsMade} | today: ${prevToday + apiCallsMade} | month: ${prevMonth + apiCallsMade}` });
        }

        const uniqueJobs = Array.from(
          new Map(jobsToInsert.map((j) => [j.source_id, j])).values()
        );

        send({ type: 'log', message: `→ ${uniqueJobs.length} unique jobs to insert` });

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
          const inserted = data?.length ?? 0;
          const dupes    = uniqueJobs.length - inserted;
          send({ type: 'log', message: `✓ inserted ${inserted} new jobs (${dupes} duplicates skipped)` });
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
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
