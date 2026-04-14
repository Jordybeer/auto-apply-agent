## Project

Next.js 16 PWA (App Router, TypeScript, Tailwind v3/PostCSS). Scrapes Belgian job boards, scores with Groq LLM, drafts cover letters, surfaces a mobile-first review queue. Deployed on Vercel, backed by Supabase.

## Conventions

- **Dutch UI** — all user-facing strings in Dutch (nl-BE). Keep them Dutch.
- **Mobile-first** — phone portrait is primary. Design UI mobile-first.
- **Supabase clients** — `createBrowserClient` (client), `createServerClient` (server/routes). Never import admin client in client components.
- **LLM** — all calls via `lib/groq.ts`, model `llama-3.3-70b-versatile`. No `openai` SDK.
- **Scraping** — Adzuna: REST API. Jobat/Stepstone/Indeed/VDAB: Jina AI reader (`r.jina.ai`) → Cheerio.
- **Logging** — API routes write to `system_logs` via db logger pattern.
- **Animations** — Framer Motion for transitions; `lottie-react` for `MoneyRain.tsx`.
- **State** — No `localStorage` in new code. Use Supabase or in-memory. Exception: UI-only flags (`ja_walkthrough_*`, `ja_theme`).
- **Packages** — Check existing deps before adding new ones: `framer-motion`, `lottie-react`, `lucide-react`, `@radix-ui/*` are available.

## Key Files

| File | Purpose |
|---|---|
| `app/page.tsx` | Home — pipeline trigger, live log stream, keyword tags |
| `app/admin/page.tsx` | Admin — system logs, pipeline controls |
| `app/api/scrape/stream/route.ts` | Scrape endpoint, streams NDJSON logs |
| `app/api/process/route.ts` | LLM scoring + cover letter drafting |
| `components/MoneyRain.tsx` | Full-screen Lottie during pipeline run |
| `components/NavBar.tsx` | Fixed bottom tab bar (z-100) |
| `components/OnboardingWalkthrough.tsx` | First-run spotlight walkthrough |
| `lib/scraper/` | Per-source scraping modules |
| `supabase/schema.sql` | Full DB schema |

## Database

- `jobs` — scraped listings, deduped by `source_id`
- `applications` — match score + cover letter + status per job
- `user_settings` — keyword tags and preferences
- `system_logs` — structured API log entries
- `profiles` — user CV text for LLM matching

## Env Vars

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GROQ_API_KEY
JINA_API_KEY
RESEND_API_KEY
CRON_SECRET
