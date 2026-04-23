import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';
import { scrapeJobDescription } from '@/lib/scrape-job-description';
import { callGroq, scoreJob, GROQ_MODEL, type CvStructuredInput } from '@/lib/groq';
import { assertSafeUrl } from '@/lib/url-guard';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';

const BOT_TOKEN         = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_USER_ID     = process.env.ADMIN_USER_ID!;
const ALLOWED_USER_ID   = parseInt(process.env.TELEGRAM_ALLOWED_USER_ID ?? '0', 10);

const BOT_COMMANDS = [
  { command: 'pipeline', description: 'Start de scrape + score pipeline' },
  { command: 'queue',    description: 'Toon de huidige vacaturewachtrij' },
  { command: 'analyse',  description: 'Analyseer vacature op basis van id' },
  { command: 'save',     description: 'Voeg vacature toe via URL' },
];

async function tgPost(method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function send(chatId: number, text: string) {
  await tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

async function registerCommands() {
  await tgPost('setMyCommands', { commands: BOT_COMMANDS });
}

async function fetchAdminSettings(supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase
    .from('user_settings')
    .select('groq_api_key, cv_text, cv_structured, keywords, city, radius')
    .eq('user_id', ADMIN_USER_ID)
    .single();
  return data;
}

// Registers bot commands on GET (run once after deploy)
export async function GET() {
  await registerCommands();
  return NextResponse.json({ ok: true, commands: BOT_COMMANDS });
}

export async function POST(request: Request) {
  try {
    const update = await request.json() as TelegramUpdate;
    const message = update.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    if (message.from?.id !== ALLOWED_USER_ID) {
      await send(message.chat.id, `Je Telegram ID: \`${message.from?.id}\`\nVoeg dit toe als TELEGRAM_ALLOWED_USER_ID in Vercel.`);
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const [cmd, ...args] = message.text.trim().split(/\s+/);

    await slog.info('telegram', 'Command ontvangen', { cmd, args });

    const supabase = createServiceClient();

    // ── /pipeline ──────────────────────────────────────────────────────────
    if (cmd === '/pipeline') {
      const ghToken    = process.env.GITHUB_TOKEN;
      const ghRepo     = process.env.GITHUB_REPO;
      const ghWorkflow = process.env.GITHUB_WORKFLOW ?? 'pipeline.yml';

      if (ghToken && ghRepo) {
        const res = await fetch(
          `https://api.github.com/repos/${ghRepo}/actions/workflows/${ghWorkflow}/dispatches`,
          {
            method: 'POST',
            headers: {
              Authorization: `token ${ghToken}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: 'main' }),
          },
        );
        if (res.ok || res.status === 204) {
          await send(chatId, '🚀 Pipeline gestart via GitHub Actions.');
        } else {
          const err = await res.text();
          await send(chatId, `❌ GitHub Actions fout (${res.status}):\n${err.slice(0, 200)}`);
        }
        return NextResponse.json({ ok: true });
      }

      // Fallback: internal pipeline/run — fire and forget, reply immediately
      await send(chatId, '🚀 Pipeline gestart. Je krijgt een melding als er nieuwe vacatures zijn.');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      fetch(`${appUrl}/api/pipeline/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: ADMIN_USER_ID }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { count?: number };
          await send(chatId, `✅ Pipeline klaar — ${data.count ?? 0} nieuwe vacatures gevonden.`);
        } else {
          await send(chatId, `❌ Pipeline fout (${res.status}).`);
        }
      }).catch(async (err) => {
        await send(chatId, `❌ Pipeline fout: ${err instanceof Error ? err.message : String(err)}`);
      });
      return NextResponse.json({ ok: true });
    }

    // ── /queue ─────────────────────────────────────────────────────────────
    if (cmd === '/queue') {
      const { data } = await supabase
        .from('applications')
        .select('match_score, status, jobs(id, title, company)')
        .eq('user_id', ADMIN_USER_ID)
        .in('status', ['draft', 'saved'])
        .order('match_score', { ascending: false })
        .limit(8);

      if (!data?.length) {
        await send(chatId, 'Wachtrij is leeg.');
        return NextResponse.json({ ok: true });
      }

      const badge = (s: string) => s === 'saved' ? '⭐' : '🆕';
      const lines = (data as unknown as AppWithJob[]).map((a) =>
        `${badge(a.status)} *${esc(a.jobs?.title)}* — ${esc(a.jobs?.company)}\nScore: ${a.match_score ?? '?'}%  |  id: \`${a.jobs?.id?.slice(0, 8)}\``
      );
      await send(chatId, `📋 *Wachtrij (${data.length})*\n\n${lines.join('\n\n')}`);
      return NextResponse.json({ ok: true });
    }

    // ── /analyse {id} — accepts full UUID or first 8 chars ────────────────
    if (cmd === '/analyse') {
      const token = args[0];
      if (!token) {
        await send(chatId, 'Gebruik: `/analyse {id}` (id uit /queue)');
        return NextResponse.json({ ok: true });
      }

      const isShort = token.length === 8;
      const jobQuery = supabase
        .from('jobs')
        .select('id, title, company, url, description')
        .eq('user_id', ADMIN_USER_ID);
      const { data: job } = await (isShort
        ? jobQuery.ilike('id', `${token}%`).single()
        : jobQuery.eq('id', token).single());

      if (!job) {
        await send(chatId, `Vacature \`${token}\` niet gevonden.`);
        return NextResponse.json({ ok: true });
      }

      const jobId = (job as { id: string }).id;

      // Return cached analysis if available
      const { data: app } = await supabase
        .from('applications')
        .select('match_score, reasoning')
        .eq('job_id', jobId)
        .eq('user_id', ADMIN_USER_ID)
        .single();

      if (app?.match_score != null && app?.reasoning) {
        await send(
          chatId,
          `🔍 *${esc(job.title)}* — ${esc(job.company)}\n\nScore: *${app.match_score}%*\n\n${app.reasoning}`,
        );
        return NextResponse.json({ ok: true });
      }

      await send(chatId, `⏳ Analyse loopt voor *${esc(job.title)}*…`);

      const settings = await fetchAdminSettings(supabase);
      const groqKey = (settings?.groq_api_key as string | null)?.trim() || process.env.GROQ_API_KEY || '';
      if (!groqKey) {
        await send(chatId, '❌ Geen Groq API-sleutel ingesteld.');
        return NextResponse.json({ ok: true });
      }

      let description = (job.description as string | null) ?? '';
      if ((!description || description.length < 80) && job.url) {
        description = await scrapeJobDescription(job.url as string).catch(() => '');
      }
      if (!description || description.length < 80) {
        await send(chatId, '❌ Kon vacaturetekst niet ophalen.');
        return NextResponse.json({ ok: true });
      }

      const result = await scoreJob(
        description,
        (job.title as string) ?? '',
        (job.company as string) ?? '',
        groqKey,
        (settings?.cv_text as string) ?? '',
        ((settings?.keywords as string[] | null) ?? []).join(', '),
        undefined,
        (settings?.cv_structured as CvStructuredInput | null) ?? undefined,
        (settings?.city as string | null) ?? null,
        typeof settings?.radius === 'number' ? settings.radius : null,
      );

      await send(
        chatId,
        `🔍 *${esc(job.title)}* — ${esc(job.company)}\n\nScore: *${result.match_score}%*\n\n${result.reasoning}`,
      );
      return NextResponse.json({ ok: true });
    }

    // ── /save {url} ────────────────────────────────────────────────────────
    if (cmd === '/save') {
      const url = args[0];
      if (!url || !/^https?:\/\//i.test(url)) {
        await send(chatId, 'Gebruik: `/save {url}`');
        return NextResponse.json({ ok: true });
      }
      try { assertSafeUrl(url); } catch {
        await send(chatId, '❌ Ongeldige of onveilige URL.');
        return NextResponse.json({ ok: true });
      }

      await send(chatId, '⏳ Vacature ophalen en analyseren…');

      const settings = await fetchAdminSettings(supabase);
      const groqKey = (settings?.groq_api_key as string | null)?.trim() || process.env.GROQ_API_KEY || '';
      if (!groqKey) {
        await send(chatId, '❌ Geen Groq API-sleutel ingesteld.');
        return NextResponse.json({ ok: true });
      }

      let description = '';
      try {
        description = await scrapeJobDescription(url);
      } catch (e) {
        await send(chatId, `❌ Scraping mislukt: ${e instanceof Error ? e.message : String(e)}`);
        return NextResponse.json({ ok: true });
      }
      if (!description || description.trim().length < 80) {
        await send(chatId, '❌ Vacaturetekst te kort of niet leesbaar.');
        return NextResponse.json({ ok: true });
      }

      // Extract title + company
      const extractionRaw = await callGroq({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'Extraheer job-informatie. Output: alleen JSON.' },
          {
            role: 'user',
            content: `${sanitizePromptInput(description).slice(0, 2000)}\n\nJSON: {"titel":"...","bedrijf":"..."}`,
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }, groqKey);
      const extracted = JSON.parse(extractionRaw.choices[0]?.message?.content ?? '{}') as Record<string, string>;
      const titel   = (extracted.titel  ?? 'Onbekend').slice(0, 100);
      const bedrijf = (extracted.bedrijf ?? 'Onbekend').slice(0, 100);

      const result = await scoreJob(
        description,
        titel,
        bedrijf,
        groqKey,
        (settings?.cv_text as string) ?? '',
        ((settings?.keywords as string[] | null) ?? []).join(', '),
        undefined,
        (settings?.cv_structured as CvStructuredInput | null) ?? undefined,
        (settings?.city as string | null) ?? null,
        typeof settings?.radius === 'number' ? settings.radius : null,
      );

      const { data: jobRow, error: jobErr } = await supabase
        .from('jobs')
        .upsert(
          { user_id: ADMIN_USER_ID, source_id: url, source: 'analyse', title: titel, company: bedrijf, url, description },
          { onConflict: 'user_id,source_id' },
        )
        .select('id')
        .single();

      if (jobErr || !jobRow) {
        await send(chatId, `❌ Opslaan mislukt: ${jobErr?.message}`);
        return NextResponse.json({ ok: true });
      }

      await supabase
        .from('applications')
        .upsert(
          { user_id: ADMIN_USER_ID, job_id: jobRow.id, match_score: result.match_score, status: 'saved' },
          { onConflict: 'user_id,job_id', ignoreDuplicates: true },
        );

      await slog.info('telegram', 'Vacature opgeslagen via bot', { url, score: result.match_score });
      await send(chatId, `✅ Opgeslagen\n\n*${esc(titel)}* @ ${esc(bedrijf)}\nScore: *${result.match_score}%*`);
      return NextResponse.json({ ok: true });
    }

    await send(
      chatId,
      'Beschikbare commando\'s:\n`/pipeline` — start de pipeline\n`/queue` — toon wachtrij\n`/analyse {id}` — analyseer vacature\n`/save {url}` — voeg vacature toe via URL',
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    await slog.error('telegram', 'Webhook fout', { error: String(err) });
    return NextResponse.json({ ok: true });
  }
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[_*`[]/g, '\\$&');
}

interface TelegramUpdate {
  message?: {
    from?: { id: number };
    chat: { id: number };
    text?: string;
  };
}

interface AppWithJob {
  match_score: number | null;
  status: string;
  jobs: { id: string; title: string; company: string } | null;
}
