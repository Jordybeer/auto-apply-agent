import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-service';
import { slog } from '@/lib/logger';
import { scrapeJobDescription } from '@/lib/scrape-job-description';
import Anthropic from '@anthropic-ai/sdk';
import { scoreJobPremium } from '@/lib/anthropic';
import { assertSafeUrl } from '@/lib/url-guard';
import { sanitizePromptInput } from '@/lib/prompt-sanitize';
import { sendViaGmail } from '@/lib/gmail-smtp';
import { approvalMarkup } from '@/lib/telegram';
import { checkLlmRateLimit } from '@/lib/llm-rate-limit';

const BOT_TOKEN        = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_USER_ID    = process.env.ADMIN_USER_ID!;
const ALLOWED_USER_ID  = parseInt(process.env.TELEGRAM_ALLOWED_USER_ID ?? '0', 10);
const WEBHOOK_SECRET   = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

const BOT_COMMANDS = [
  { command: 'status',   description: 'Queue grootte, laatste pipeline, statistieken' },
  { command: 'top5',     description: 'Top 5 vacatures op score' },
  { command: 'queue',    description: 'Toon de huidige vacaturewachtrij' },
  { command: 'pipeline', description: 'Start de scrape + score pipeline' },
  { command: 'pause',    description: 'Pauzeer de dagelijkse pipeline' },
  { command: 'resume',   description: 'Hervat de dagelijkse pipeline' },
  { command: 'skip',     description: 'Sla vacature over: /skip 1' },
  { command: 'block',    description: 'Blokkeer bedrijf: /block {naam}' },
  { command: 'why',      description: 'Leg scoring uit: /why 1' },
  { command: 'analyse',  description: 'Analyseer vacature: /analyse 1' },
  { command: 'save',     description: 'Voeg vacature toe: /save {url}' },
];

async function tgPost(method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function send(chatId: number, text: string, replyMarkup?: object) {
  await tgPost('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'Markdown',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallback(callbackQueryId: string, text?: string) {
  await tgPost('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[_*`[]/g, '\\$&');
}

async function fetchAdminSettings(supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase
    .from('user_settings')
    .select('cv_text, keywords, full_name, email_signature, gmail_address, gmail_app_password')
    .eq('user_id', ADMIN_USER_ID)
    .single();
  return data;
}

async function callAnthropicHaiku(prompt: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}

type JobRow = { id: string; title: string; company: string; url: string | null; description: string | null };

async function findJobByToken(supabase: ReturnType<typeof createServiceClient>, token: string) {
  const isShort = token.length < 36;
  const q = supabase
    .from('jobs')
    .select('id, title, company, url, description')
    .eq('user_id', ADMIN_USER_ID);
  const { data } = await (isShort
    ? q.ilike('id', `${token}%`).limit(1).maybeSingle()
    : q.eq('id', token).maybeSingle());
  return data as JobRow | null;
}

// Resolve job by queue position (1-based) or fallback to hex prefix / UUID.
async function resolveJob(supabase: ReturnType<typeof createServiceClient>, token: string): Promise<JobRow | null> {
  const n = parseInt(token, 10);
  if (!isNaN(n) && n >= 1 && String(n) === token) {
    const { data } = await supabase
      .from('applications')
      .select('jobs(id, title, company, url, description)')
      .eq('user_id', ADMIN_USER_ID)
      .in('status', ['draft', 'saved'])
      .order('match_score', { ascending: false })
      .range(n - 1, n - 1)
      .maybeSingle();
    if (!data) return null;
    const j = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;
    return (j ?? null) as JobRow | null;
  }
  return findJobByToken(supabase, token);
}

export async function GET() {
  if (!BOT_TOKEN) return NextResponse.json({ ok: true });
  await tgPost('setMyCommands', { commands: BOT_COMMANDS });
  return NextResponse.json({ ok: true, commands: BOT_COMMANDS });
}

export async function POST(request: Request) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: true });
  if (WEBHOOK_SECRET) {
    const incoming = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
    if (incoming !== WEBHOOK_SECRET) return NextResponse.json({ ok: true }, { status: 403 });
  }
  void tgPost('setMyCommands', { commands: BOT_COMMANDS });
  try {
    const update = await request.json() as TelegramUpdate;
    const supabase = createServiceClient();

    // ── Callback queries (inline button presses) ───────────────────────────
    if (update.callback_query) {
      const cq     = update.callback_query;
      const chatId = cq.message?.chat.id ?? ALLOWED_USER_ID;

      if (cq.from.id !== ALLOWED_USER_ID) {
        await answerCallback(cq.id, 'Geen toegang.');
        return NextResponse.json({ ok: true });
      }
      await answerCallback(cq.id);

      const data  = cq.data ?? '';
      const token = data.startsWith('apply_') ? data.slice(6)
                  : data.startsWith('skip_')  ? data.slice(5)
                  : '';
      const action = data.startsWith('apply_') ? 'apply'
                   : data.startsWith('skip_')  ? 'skip'
                   : '';

      if (!action || !token) return NextResponse.json({ ok: true });

      const job = await findJobByToken(supabase, token);
      if (!job) {
        await send(chatId, '❌ Vacature niet gevonden.');
        return NextResponse.json({ ok: true });
      }

      if (action === 'skip') {
        await supabase.from('applications')
          .update({ status: 'skipped' })
          .eq('job_id', job.id)
          .eq('user_id', ADMIN_USER_ID);
        await send(chatId, `🚫 *${esc(job.title)}* overgeslagen.`);
        return NextResponse.json({ ok: true });
      }

      // action === 'apply'
      const { data: app } = await supabase
        .from('applications')
        .select('id, status, cover_letter_draft, contact_email')
        .eq('job_id', job.id)
        .eq('user_id', ADMIN_USER_ID)
        .maybeSingle();

      if (!app) {
        await send(chatId, '❌ Geen sollicitatie gevonden voor deze vacature.');
        return NextResponse.json({ ok: true });
      }
      if (['applied', 'in_progress'].includes(app.status as string)) {
        await send(chatId, `ℹ️ Al gesolliciteerd op *${esc(job.title)}*.`);
        return NextResponse.json({ ok: true });
      }

      const coverLetter  = (app.cover_letter_draft as string) ?? '';
      const contactEmail = (app.contact_email as string)      ?? '';

      if (!coverLetter || !contactEmail) {
        await supabase.from('applications')
          .update({ status: 'saved' })
          .eq('id', app.id)
          .eq('user_id', ADMIN_USER_ID);
        await send(chatId, `📋 *${esc(job.title)}* naar wachtrij verplaatst — geen brief of e-mailadres beschikbaar. Beoordeel via de app.`);
        return NextResponse.json({ ok: true });
      }

      const settings = await fetchAdminSettings(supabase);
      let cvPdf: Buffer | null = null;
      try {
        const { data: signed } = await supabase.storage
          .from('resumes').createSignedUrl(`${ADMIN_USER_ID}/cv.pdf`, 60);
        if (signed?.signedUrl) {
          const res = await fetch(signed.signedUrl);
          if (res.ok) cvPdf = Buffer.from(await res.arrayBuffer());
        }
      } catch { /* send without CV */ }

      const gmailAddress = (settings?.gmail_address as string | null)?.trim() ?? '';
      const gmailAppPass = (settings?.gmail_app_password as string | null)?.trim() ?? '';
      try {
        if (!gmailAddress || !gmailAppPass) throw new Error('Gmail niet geconfigureerd');
        await sendViaGmail({
          gmailAddress,
          appPassword: gmailAppPass,
          to:          contactEmail,
          subject:     `Sollicitatie: ${job.title} — ${job.company}`,
          body:        coverLetter,
          fromName:    (settings?.full_name  as string | null) ?? null,
          signature:   (settings?.email_signature as string | null) ?? null,
          attachmentPdf: cvPdf,
        });
        await supabase.from('applications').update({
          status:            'applied',
          applied_at:        new Date().toISOString(),
          sent_via_email:    true,
          approval_requested_at: null,
        }).eq('id', app.id).eq('user_id', ADMIN_USER_ID);
        await send(chatId, `✅ Gesolliciteerd op *${esc(job.title)}* bij *${esc(job.company)}*.`);
        void slog.info('telegram', 'Sollicitatie verstuurd via bot', { job_id: job.id });
      } catch (err) {
        await send(chatId, `❌ Versturen mislukt: ${err instanceof Error ? err.message : String(err)}`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Text messages ──────────────────────────────────────────────────────
    const message = update.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    if (message.from?.id !== ALLOWED_USER_ID) {
      await send(message.chat.id, `Je Telegram ID: \`${message.from?.id}\`\nVoeg dit toe als TELEGRAM_ALLOWED_USER_ID in Vercel.`);
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const [cmd, ...args] = message.text.trim().split(/\s+/);
    void slog.info('telegram', 'Command ontvangen', { cmd, args });

    // ── /status ───────────────────────────────────────────────────────────
    if (cmd === '/status') {
      const [
        { count: queueCount },
        { data: lastLog },
        { count: errorCount },
      ] = await Promise.all([
        supabase.from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', ADMIN_USER_ID)
          .in('status', ['draft', 'saved']),
        supabase.from('system_logs')
          .select('created_at, level')
          .in('source', ['scrape', 'process'])
          .eq('user_id', ADMIN_USER_ID)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase.from('system_logs')
          .select('*', { count: 'exact', head: true })
          .in('source', ['scrape', 'process'])
          .eq('level', 'error')
          .eq('user_id', ADMIN_USER_ID)
          .gte('created_at', new Date(Date.now() - 86_400_000).toISOString()),
      ]);

      const lastRunAt = lastLog?.[0]?.created_at
        ? new Date(lastLog[0].created_at as string).toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' })
        : 'Onbekend';

      await send(chatId,
        `📊 *Status*\n\n` +
        `📋 Wachtrij: *${queueCount ?? 0}* vacatures\n` +
        `⏰ Laatste pipeline: ${lastRunAt}\n` +
        `❌ Fouten (24u): *${errorCount ?? 0}*`,
      );
      return NextResponse.json({ ok: true });
    }

    // ── /top5 ─────────────────────────────────────────────────────────────
    if (cmd === '/top5') {
      const { data } = await supabase
        .from('applications')
        .select('match_score, jobs(id, title, company)')
        .eq('user_id', ADMIN_USER_ID)
        .in('status', ['draft', 'saved'])
        .not('match_score', 'is', null)
        .order('match_score', { ascending: false })
        .limit(5);

      if (!data?.length) {
        await send(chatId, 'Geen scorende vacatures in de wachtrij.');
        return NextResponse.json({ ok: true });
      }

      const lines = (data as unknown as AppWithJob[]).map((a, i) =>
        `*${i + 1}.* *${esc(a.jobs?.title)}* — ${esc(a.jobs?.company)}\n   Score: *${a.match_score ?? '?'}%*`
      );
      await send(chatId, `🏆 *Top 5*\n\n${lines.join('\n\n')}\n\n/skip 1 · /why 1 · /analyse 1`);
      return NextResponse.json({ ok: true });
    }

    // ── /skip {id} ────────────────────────────────────────────────────────
    if (cmd === '/skip') {
      const token = args[0];
      if (!token) { await send(chatId, 'Gebruik: `/skip {positie}` (nr uit /queue)'); return NextResponse.json({ ok: true }); }
      const job = await resolveJob(supabase, token);
      if (!job) { await send(chatId, `Vacature \`${esc(token)}\` niet gevonden.`); return NextResponse.json({ ok: true }); }
      await supabase.from('applications')
        .update({ status: 'skipped' })
        .eq('job_id', job.id)
        .eq('user_id', ADMIN_USER_ID);
      await send(chatId, `🚫 *${esc(job.title)}* bij *${esc(job.company)}* overgeslagen.`);
      return NextResponse.json({ ok: true });
    }

    // ── /block {company} ─────────────────────────────────────────────────
    if (cmd === '/block') {
      const company = args.join(' ').trim();
      if (!company) { await send(chatId, 'Gebruik: `/block {bedrijfsnaam}`'); return NextResponse.json({ ok: true }); }

      const { data: settings } = await supabase
        .from('user_settings').select('blocked_companies').eq('user_id', ADMIN_USER_ID).single();
      const existing: string[] = (settings?.blocked_companies as string[] | null) ?? [];
      if (!existing.map((c) => c.toLowerCase()).includes(company.toLowerCase())) {
        await supabase.from('user_settings')
          .update({ blocked_companies: [...existing, company] })
          .eq('user_id', ADMIN_USER_ID);
      }

      const { data: matchingJobs } = await supabase
        .from('jobs').select('id')
        .eq('user_id', ADMIN_USER_ID)
        .ilike('company', `%${company}%`);

      let skippedCount = 0;
      if (matchingJobs?.length) {
        const jobIds = (matchingJobs as { id: string }[]).map((j) => j.id);
        const { data: skipped } = await supabase.from('applications')
          .update({ status: 'skipped' })
          .eq('user_id', ADMIN_USER_ID)
          .in('job_id', jobIds)
          .in('status', ['draft', 'saved'])
          .select('id');
        skippedCount = skipped?.length ?? 0;
      }

      await send(chatId, `🚫 *${esc(company)}* geblokkeerd. ${skippedCount} actieve vacature(s) overgeslagen.`);
      void slog.info('telegram', 'Bedrijf geblokkeerd', { company, skipped: skippedCount });
      return NextResponse.json({ ok: true });
    }

    // ── /pause ────────────────────────────────────────────────────────────
    if (cmd === '/pause') {
      await supabase.from('user_settings')
        .update({ daily_scrape_enabled: false }).eq('user_id', ADMIN_USER_ID);
      await send(chatId, '⏸ Dagelijkse pipeline gepauzeerd. Gebruik `/resume` om te hervatten.');
      return NextResponse.json({ ok: true });
    }

    // ── /resume ───────────────────────────────────────────────────────────
    if (cmd === '/resume') {
      await supabase.from('user_settings')
        .update({ daily_scrape_enabled: true }).eq('user_id', ADMIN_USER_ID);
      await send(chatId, '▶️ Dagelijkse pipeline hervat.');
      return NextResponse.json({ ok: true });
    }

    // ── /why {id} ─────────────────────────────────────────────────────────
    if (cmd === '/why') {
      const token = args[0];
      if (!token) { await send(chatId, 'Gebruik: `/why {positie}` (nr uit /queue)'); return NextResponse.json({ ok: true }); }
      const job = await resolveJob(supabase, token);
      if (!job) { await send(chatId, `Vacature \`${esc(token)}\` niet gevonden.`); return NextResponse.json({ ok: true }); }

      const { data: app } = await supabase
        .from('applications').select('match_score, reasoning')
        .eq('job_id', job.id).eq('user_id', ADMIN_USER_ID).maybeSingle();

      if (!app?.reasoning) {
        await send(chatId, `Geen analyse voor \`${esc(token)}\`. Gebruik /analyse om te scoren.`);
        return NextResponse.json({ ok: true });
      }
      await send(chatId,
        `🔍 *${esc(job.title)}* — ${esc(job.company)}\n\nScore: *${app.match_score ?? '?'}%*\n\n${app.reasoning}`,
      );
      return NextResponse.json({ ok: true });
    }

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

      await send(chatId, '🚀 Pipeline gestart. Je krijgt een melding als er nieuwe vacatures zijn.');
      const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
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
      const lines = (data as unknown as AppWithJob[]).map((a, i) =>
        `${badge(a.status)} *${i + 1}.* *${esc(a.jobs?.title)}* — ${esc(a.jobs?.company)}\nScore: ${a.match_score ?? '?'}%`
      );
      await send(chatId, `📋 *Wachtrij (${data.length})*\n\n${lines.join('\n\n')}\n\n/skip 1 · /why 1 · /analyse 1`);
      return NextResponse.json({ ok: true });
    }

    // ── /analyse {id} ─────────────────────────────────────────────────────
    if (cmd === '/analyse') {
      const token = args[0];
      if (!token) {
        await send(chatId, 'Gebruik: `/analyse {positie}` (nr uit /queue)');
        return NextResponse.json({ ok: true });
      }

      const job = await resolveJob(supabase, token);
      if (!job) {
        await send(chatId, `Vacature \`${esc(token)}\` niet gevonden.`);
        return NextResponse.json({ ok: true });
      }

      const { data: app } = await supabase
        .from('applications')
        .select('match_score, reasoning')
        .eq('job_id', job.id)
        .eq('user_id', ADMIN_USER_ID)
        .maybeSingle();

      if (app?.match_score != null && app?.reasoning) {
        await send(chatId,
          `🔍 *${esc(job.title)}* — ${esc(job.company)}\n\nScore: *${app.match_score}%*\n\n${app.reasoning}`,
        );
        return NextResponse.json({ ok: true });
      }

      await send(chatId, `⏳ Analyse loopt voor *${esc(job.title)}*…`);

      const { allowed: analyseAllowed } = await checkLlmRateLimit(ADMIN_USER_ID, supabase);
      if (!analyseAllowed) {
        await send(chatId, '❌ LLM rate limit bereikt. Probeer later opnieuw.');
        return NextResponse.json({ ok: true });
      }

      const settings = await fetchAdminSettings(supabase);

      let description = (job.description as string | null) ?? '';
      if ((!description || description.length < 80) && job.url) {
        description = await scrapeJobDescription(job.url).catch(() => '');
      }
      if (!description || description.length < 80) {
        await send(chatId, '❌ Kon vacaturetekst niet ophalen.');
        return NextResponse.json({ ok: true });
      }

      const result = await scoreJobPremium({
        jobDescription: description,
        cvText: (settings?.cv_text as string) ?? '',
        keywords: (settings?.keywords as string[] | null) ?? [],
        location: '',
        userId: ADMIN_USER_ID,
      });

      await send(chatId,
        `🔍 *${esc(job.title)}* — ${esc(job.company)}\n\nScore: *${result.score}%*\n\n${result.reasoning}`,
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

      const { allowed: saveAllowed } = await checkLlmRateLimit(ADMIN_USER_ID, supabase);
      if (!saveAllowed) {
        await send(chatId, '❌ LLM rate limit bereikt. Probeer later opnieuw.');
        return NextResponse.json({ ok: true });
      }

      await send(chatId, '⏳ Vacature ophalen en analyseren…');

      const settings = await fetchAdminSettings(supabase);

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

      const extractionText = await callAnthropicHaiku(
        `${sanitizePromptInput(description).slice(0, 2000)}\n\nExtraheer job-informatie. Geef alleen JSON: {"titel":"...","bedrijf":"..."}`
      );
      const extracted = JSON.parse(extractionText.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as Record<string, string>;
      const titel   = (extracted.titel   ?? 'Onbekend').slice(0, 100);
      const bedrijf = (extracted.bedrijf ?? 'Onbekend').slice(0, 100);

      const result = await scoreJobPremium({
        jobDescription: description,
        cvText: (settings?.cv_text as string) ?? '',
        keywords: (settings?.keywords as string[] | null) ?? [],
        location: '',
        userId: ADMIN_USER_ID,
      });

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
          { user_id: ADMIN_USER_ID, job_id: jobRow.id, match_score: result.score, status: 'saved' },
          { onConflict: 'user_id,job_id', ignoreDuplicates: true },
        );

      void slog.info('telegram', 'Vacature opgeslagen via bot', { url, score: result.score });
      await send(chatId, `✅ Opgeslagen\n\n*${esc(titel)}* @ ${esc(bedrijf)}\nScore: *${result.score}%*`);
      return NextResponse.json({ ok: true });
    }

    await send(
      chatId,
      'Commando\'s:\n`/status` `/top5` `/queue` `/pipeline` `/pause` `/resume`\n`/skip {nr}` `/block {bedrijf}` `/why {nr}` `/analyse {nr}` `/save {url}`\n\n_{nr} = positie uit /queue, bijv. `/skip 1`_',
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    void slog.error('telegram', 'Webhook fout', { error: String(err) });
    return NextResponse.json({ ok: true });
  }
}

interface TelegramUpdate {
  message?: {
    from?: { id: number };
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { chat: { id: number } };
    data?: string;
  };
}

interface AppWithJob {
  match_score: number | null;
  status: string;
  jobs: { id: string; title: string; company: string } | null;
}
