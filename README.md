# Auto Apply Agent

A personal job pipeline PWA. Scrapes Belgian job boards, scores listings against your profile with an LLM, drafts cover letters, and surfaces everything in a mobile-first review queue.

## Features

- **Multi-source scraping** — Adzuna, Jobat, Stepstone, Indeed, VDAB via Jina AI reader
- **LLM scoring & drafting** — Groq evaluates each job against your profile, produces a match score and a ready-to-edit cover letter
- **Review queue** — swipe-style approve / reject / save flow
- **Auto-apply** — sends applications by email via Resend
- **Admin panel** — live system logs, pipeline controls, user management
- **Insights** — job title frequency analysis and match-score trends
- **PWA** — installable, works offline, bottom-tab navigation
- **Dark / light mode**

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| LLM | Groq (llama-3) |
| Scraping | Cheerio + Jina AI reader |
| Email | Resend |
| Animations | Framer Motion + Lottie |

## Pages

| Route | Description |
|---|---|
| `/` | Home — keyword tags, run pipeline, live log stream |
| `/queue` | Review queue — score, draft, approve/reject |
| `/saved` | Saved jobs |
| `/applied` | Sent applications |
| `/analyse` | Job title insights |
| `/insights` | Match score trends |
| `/profiel` | Profile / CV management |
| `/settings` | User settings, keywords |
| `/admin` | System logs, pipeline status, admin tools |

## API routes

| Route | Method | Description |
|---|---|---|
| `/api/scrape/stream` | POST | Streams scrape logs as NDJSON, inserts jobs |
| `/api/process` | POST | Scores + drafts unprocessed jobs via Groq |
| `/api/applications` | GET/PATCH | Fetch / update application rows |
| `/api/apply` | POST | Trigger auto-apply for a job |
| `/api/send-application` | POST | Send cover letter email via Resend |
| `/api/queue` | GET | Fetch pending review queue |
| `/api/saved` | GET/POST | Saved jobs |
| `/api/applied` | GET | Applied jobs |
| `/api/rematch` | POST | Re-score a job against updated profile |
| `/api/analyse` | GET | Aggregated job title stats |
| `/api/cv` | GET/POST | CV text management |
| `/api/profiel` | GET/POST | Profile data |
| `/api/settings` | GET/POST | Keyword settings |
| `/api/logs` | GET | System log entries (admin) |
| `/api/title-suggestions` | GET | LLM-powered job title suggestions |

## Local setup

```bash
npm i
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GROQ_API_KEY=
JINA_API_KEY=
RESEND_API_KEY=

# optional — locks the cron-triggered scrape endpoint
CRON_SECRET=
```

Run the schema:

```bash
# paste supabase/schema.sql into your Supabase SQL editor
```

Start dev server:

```bash
npm run dev
```

## Project structure

```
app/
  page.tsx              # Home / pipeline trigger
  admin/                # Admin panel
  queue/                # Review queue
  api/                  # All API routes
  ...
components/
  MoneyRain.tsx         # Lottie background animation (pipeline active)
  NavBar.tsx            # Fixed bottom tab bar
  ApplyModal.tsx        # Cover letter review + send
  SettingsMenu.tsx      # User settings drawer
  ...
lib/
  scraper/              # Per-source scraping logic
  groq.ts               # LLM scoring + drafting
  supabase.ts           # DB helpers
public/
  lottie/               # Lottie animation assets
supabase/
  schema.sql            # Full DB schema
.claude/
  settings.json         # Claude Code permissions
```

## Why this exists

Job board scrolling is slow and repetitive. This reduces it to: run pipeline → review scored queue → send applications.
