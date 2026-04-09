# CLAUDE.md

Context for Claude Code when working in this repo.

## Project summary

A Next.js 16 PWA (App Router, TypeScript, Tailwind) that scrapes Belgian job boards, scores listings with Groq LLM, drafts cover letters, and surfaces a mobile-first review queue. Deployed on Vercel, backed by Supabase.

## Key conventions

- **Dutch UI copy** — all user-facing strings are in Dutch (Belgian). Keep them Dutch.
- **Mobile-first** — this is primarily a phone app. All UI should be designed for portrait mobile first.
- **No build step for styles** — Tailwind v3 via PostCSS, no separate compile step needed.
- **`'use client'`** — most interactive components are client components. Server components are used for data fetching where possible.
- **Supabase clients** — use `createBrowserClient` from `@supabase/ssr` in client components, `createServerClient` in server components/routes. Never import the admin client in client components.
- **LLM calls go through Groq** — `lib/groq.ts`. Model: `llama-3.3-70b-versatile`.
- **Scraping** — Adzuna uses their REST API directly. Jobat/Stepstone/VDAB use Jina AI reader (`r.jina.ai`) for HTML-to-text, then Cheerio for parsing. Indeed removed (permanently Cloudflare-blocked).
- **Logging** — API routes that do meaningful work should write to `system_logs` via the db logger pattern. This feeds the Admin → Logs panel.
- **Animations** — Framer Motion for UI transitions. Lottie (`lottie-react`) for the pipeline background animation (`MoneyRain.tsx`).
- **PWA** — service worker via `public/sw.js`. Manifest at `app/manifest.ts`.

## Important files

| File | Purpose |
|---|---|
| `app/page.tsx` | Home page — pipeline trigger, live log stream, keyword tags |
| `app/admin/page.tsx` | Admin panel — system logs, pipeline controls |
| `app/api/scrape/stream/route.ts` | Main scrape endpoint, streams NDJSON logs |
| `app/api/process/route.ts` | LLM scoring + cover letter drafting |
| `components/MoneyRain.tsx` | Full-screen Lottie animation shown during pipeline run |
| `components/NavBar.tsx` | Fixed bottom tab bar, z-index 100 |
| `components/OnboardingWalkthrough.tsx` | First-run walkthrough with spotlight; restart via settings |
| `lib/scraper/` | Per-source scraping modules |
| `supabase/schema.sql` | Full DB schema — run this first |
| `.claude/settings.json` | Claude Code file access permissions |

## Database tables (key ones)

- `jobs` — raw scraped listings, deduped by `source_id`
- `applications` — one row per job, holds match score + cover letter draft + status
- `user_settings` — per-user keyword tags and preferences
- `system_logs` — structured log entries from API routes (level, message, timestamp)
- `profiles` — user profile / CV text used for LLM matching

## Env vars needed

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
JINA_API_KEY
RESEND_API_KEY
CRON_SECRET          # optional
```

## Z-index layer system

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
| `500` | OnboardingWalkthrough backdrop / SVG mask |
| `501` | OnboardingWalkthrough card + pulse ring |
| `9999` | SplashScreen |

## What to avoid

- Don't add Vercel-specific deploy instructions — deployment is handled outside this repo.
- Don't use `localStorage` in new code — the app runs in contexts where storage may be sandboxed. Use Supabase or in-memory state. Exception: lightweight UI-only state like onboarding seen flags (`ja_walkthrough_*`, `ja_theme`).
- Don't use `openai` SDK — LLM calls use `groq-sdk`.
- Don't touch `public/sw.js` or `app/manifest.ts` without understanding the PWA cache strategy.
- Don't add new npm packages without checking if an existing dep already covers it (`framer-motion`, `lottie-react`, `@lottiefiles/dotlottie-react`, `lucide-react`, `@radix-ui/*` are all available).
