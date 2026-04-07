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

- `/` — Queue (swipe-card review UI for draft applications). `/saved` and `/applied` redirect here as tabs.
- `/insights` — Job title insights
- `/analyse` — Ad-hoc fit-check for any job URL
- `/profiel` — Profile management (CV upload, keywords, city)
- `/settings` — API key management (Adzuna, Groq)

The app is a PWA (manifest + service worker) with dark/light theming via `data-theme` on `<html>`, stored in `localStorage` as `ja_theme`.

### Design system

All styles live in `app/globals.css`. Use only the CSS custom properties defined there — do not invent new ones.

Key CSS variables: `--text`, `--text2`–`--text4`, `--surface`–`--surface3`, `--accent`, `--accent-dim`, `--accent-bright`, `--green`, `--green-dim`, `--yellow`, `--yellow-dim`, `--red`, `--red-dim`, `--border`, `--border-bright`, `--divider`, `--navbar-h`, `--safe-top/bottom/left/right`.

Key utility classes: `.page-shell`, `.glass`, `.glass-card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-lg`, `.btn-sm`, `.btn-ghost-accent`, `.field-input`, `.field-textarea`, `.field-label`, `.badge-*`, `.modal-overlay`, `.modal-overlay--sheet`, `.modal-dialog`, `.modal-dialog--sheet`, `.modal-header`, `.modal-body`, `.modal-footer`, `.modal-close-btn`.

### Z-index layer system

Always use these exact values — do not introduce new ones without updating this table:

| z-index | Layer |
|---|---|
| `1` | Stacking context base / page content |
| `10` | Relative stacking within cards (`z-10`) |
| `100` | NavBar |
| `110` | Bottom-sheet overlays (NoteSheet in QueueContent) |
| `120` | PwaInstallToast |
| `200` | Modal overlays (ApplyModal, ManualApplyModal, NoteButton) |
| `300` | In-modal toasts |
| `400` | Popovers and dropdowns (StatusPicker, CityCombobox, popover.tsx) |
| `9999` | SplashScreen |

### Scraping

`lib/scrape-job-description.ts` handles description enrichment:
1. For hosts in `JINA_ONLY_HOSTS` (jobat.be, stepstone.be/nl, indeed.com, vdab.be, monster.be/com) — skip direct fetch entirely, go straight to Jina Reader.
2. For all other hosts — direct browser-like HTTP fetch + Cheerio selector cascade, then Jina Reader fallback if result < 150 chars.

### Vercel cron

`vercel.json` schedules weekday scrape at 09:00 and process at 09:20 (UTC). Protected by `CRON_SECRET` if set.

### Schema changes

Run migrations in Supabase SQL Editor. The `supabase/migrations/` directory contains additional RPCs (`try_claim_scrape`, `increment_adzuna_calls`).

---

## Roadmap

Suggestions for future improvements, roughly prioritised:

### High value / low effort

- **Rename `lib/openai.ts` → `lib/groq.ts`** — the current name is actively misleading. Update all imports.
- **Multi-source scraping** — Adzuna is the only source. Adding jobat.be, ictjob.be, or VDAB directly (via Jina Reader or their APIs) would multiply listings without changing the pipeline.
- **Push notifications** — When new jobs arrive via cron, send a push (Web Push API + service worker already in place). Notify the user so they don't have to open the app to check.
- **Swipe gestures on queue cards** — The queue shows list cards; native swipe-left/right (Framer Motion `drag`) would make the review flow feel more native on mobile.

### Medium effort / high impact

- **Cover letter editing before sending** — Currently the draft is shown in the modal but can't be edited inline. Adding a textarea in the apply flow so the user can tweak before copying would be very useful.
- **Per-job status timeline** — Store timestamped status changes (applied → in_progress → interview → rejected) so the applied tab shows a visual timeline per application.
- **Duplicate job detection** — Same role at same company can appear from multiple Adzuna pages. Dedup by fuzzy title+company match at the `jobs` insert step.
- **Email integration** — Detect reply emails (via a catch-all or forwarding rule) and auto-update application status (e.g. interview invite → `in_progress`).

### Longer term

- **Multi-user / shared account** — Currently single-user per Supabase auth. Allowing a recruiter or career coach to view a candidate's pipeline would open new use cases.
- **Analytics dashboard** — Response rate by job board, by keyword, by week — surfaced in the Insights page.
- **CV versioning** — Store multiple CV variants in `user_settings` and let the user pick which to use per application. Useful when applying across different industries.
- **Offline queue** — Cache draft cards in IndexedDB so the user can swipe through and make decisions even without connectivity; sync on reconnect.
