# Auto Apply Agent

I built this as a personal “job pipeline” that runs end-to-end: scrape fresh listings, store them in Supabase, score them against my profile, and draft application material so I can review everything in one queue.

It’s intentionally opinionated (Belgium-focused sources + my own workflow), but the pieces are modular.

## What it does

- **Scrape** job boards into a `jobs` table (deduped by `source_id`).
- **Process** new jobs with an LLM to create an `applications` row per job (match score + drafts).
- **Review queue** UI to approve / reject / iterate.
- Optional **Vercel Cron** to run the scrape automatically.

## Tech

- Next.js (App Router)
- TypeScript + Tailwind
- Supabase (Postgres)
- Cheerio for HTML parsing
- LLM evaluation/drafting (see `lib/openai`)

## Quick start (local)

1) Install

```bash
npm i
```

2) Create `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# scraping
SCRAPER_API_KEY=...

# LLM
OPENAI_API_KEY=...

# optional: protect cron-triggered scrape
CRON_SECRET=some-long-random-string
```

3) Run Supabase schema

Run `supabase/schema.sql` in your Supabase SQL editor.

4) Start

```bash
npm run dev
```

## Endpoints

- `GET /api/scrape` — scrapes and upserts jobs (also supports `POST`).
  - If `CRON_SECRET` is set, pass `?secret=...` or header `x-cron-secret: ...`.
- `POST /api/process` — picks recent jobs not yet in `applications`, evaluates them, and inserts drafts.

## Vercel notes

- Add env vars in Vercel Project → Settings → Environment Variables, then redeploy.
- If you enable cron (see `vercel.json`), make sure the route is accessible (and add the secret if you locked it down).

## Why this exists

I wanted something that reduces “job board scrolling” into a daily review flow: scrape → score → drafts → approve.
