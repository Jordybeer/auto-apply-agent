# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start local dev server (Next.js)
npm run build    # Production build
npm run lint     # ESLint via next lint
```

No test suite exists in this project.

## Environment variables

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
ADZUNA_APP_ID=      # optional fallback (users can store their own in user_settings)
ADZUNA_APP_KEY=
CRON_SECRET=        # optional, protects cron-triggered scrape endpoint
```

## Architecture

### Data flow

```
/api/scrape  →  jobs table  →  /api/process  →  applications table  →  Queue UI
```

1. **`/api/scrape`** — Fetches listings from Adzuna using per-user keywords/city/radius from `user_settings`. Dedupes by `(user_id, source_id)`. Short/missing descriptions are enriched: first tries direct HTML fetch + Cheerio parsing, then falls back to Jina Reader (`r.jina.ai`). Has a 60-second cooldown per user via `try_claim_scrape` Postgres RPC.

2. **`/api/process`** — Creates stub `applications` rows (status `draft`, no score yet) for any jobs not yet in `applications`. Cover letter and score are generated lazily.

3. **Apply modal / `/api/apply`** — When a user opens the apply modal, `evaluateJob()` in `lib/openai.ts` (which actually uses Groq, not OpenAI — despite the filename) generates a `match_score`, `cover_letter_draft`, and `resume_bullets_draft`.

### LLM

`lib/openai.ts` exports `evaluateJob()` using the Groq SDK with model `llama-3.3-70b-versatile`. The file is misnamed — it contains no OpenAI calls. The function takes an optional `groqApiKey` argument; if omitted it reads `GROQ_API_KEY` from env. Retries up to 4 times with exponential backoff on 429s.

`filterCoverLetter()` post-processes the generated letter to strip known AI clichés (Dutch phrases like "ik kijk ernaar uit", "trekt mij aan", etc.).

### Supabase

- **`lib/supabase-request.ts`** — server-side Supabase client (uses cookies, for API routes).
- **`lib/supabase-client.ts`** — client-side Supabase client (for browser components).
- All tables have RLS enabled: `auth.uid() = user_id`.
- `NEXT_PUBLIC_*` env vars are accessed via constants in `lib/env.ts` (required for Next.js static bundling). Server-only vars use `requireServerEnv()`.

### Key tables (Supabase Postgres)

| Table | Purpose |
|---|---|
| `jobs` | Raw scraped listings, deduped by `(user_id, source_id)` |
| `applications` | One row per job per user, holds score + drafts + status |
| `user_settings` | Per-user config: Adzuna keys, Groq key, keywords, city, radius, CV text |

Application statuses: `draft` → `saved` / `skipped` / `applied` / `in_progress` / `rejected`.

CV text is stored in `user_settings.cv_text` and used by the LLM for personalised scoring.

### Frontend pages

- `/` — Queue (swipe-card review UI for draft applications)
- `/saved` — Saved applications
- `/applied` — Applied/in-progress tracker
- `/insights` — Job title insights
- `/analyse` — Ad-hoc fit-check for any job URL
- `/profiel` — Profile management (CV upload, keywords, city)
- `/settings` — API key management (Adzuna, Groq)

The app is a PWA (manifest + service worker) with dark/light theming via `data-theme` on `<html>`, stored in `localStorage` as `ja_theme`.

### Scraping

`lib/scrape-job-description.ts` handles description enrichment:
1. Direct browser-like HTTP fetch + Cheerio selector cascade
2. Jina Reader fallback (`r.jina.ai/<url>`) for bot-blocked job boards (jobat.be, stepstone.be, etc.)

### Vercel cron

`vercel.json` schedules weekday scrape at 09:00 and process at 09:20 (UTC). Protected by `CRON_SECRET` if set.

### Schema changes

Run migrations in Supabase SQL Editor. The `supabase/migrations/` directory contains additional RPCs (`try_claim_scrape`, `increment_adzuna_calls`).
