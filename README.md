# Auto Apply Agent

A personal job pipeline PWA for the Belgian market. Scrapes job boards daily, scores listings against your profile with an LLM, drafts cover letters, and surfaces everything in a mobile-first review queue.

[![Build IPA](https://github.com/Jordybeer/auto-apply-agent/actions/workflows/ios-build.yml/badge.svg?event=workflow_dispatch)](https://github.com/Jordybeer/auto-apply-agent/actions/workflows/ios-build.yml)

## Features

- **Multi-source scraping** — Adzuna, Jobat, Stepstone, Indeed, VDAB via Jina AI reader
- **LLM scoring & drafting** — Groq evaluates each job against your profile, produces a match score and a ready-to-edit cover letter
- **Daily cron scrape** — automated pipeline at 10:00 GMT+1 with per-user opt-in/out toggle
- **Review queue** — swipe-style approve / reject / save flow
- **Auto-apply** — sends cover letter by email via Resend
- **Application notes** — multi-note sheet per application (add / edit / remove)
- **Push notifications** — Web Push (service worker), iOS PWA prompt, per-user toggle in settings
- **Onboarding** — guided walkthrough; gated features unlock on completion
- **Admin panel** — live system logs, pipeline controls, user management, moderation (`is_active` flag)
- **Insights** — match-score trends and job title frequency analysis with save/delete
- **PDF support** — upload and parse CV as PDF; generate application PDFs
- **PWA** — installable, offline fallback page, bottom-tab navigation, apple-touch-icon
- **Dark / light mode**
- **Security hardened** — RLS on all tables, rate limiting (20 LLM calls/day), CRON_SECRET guard, security headers

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + tailwindcss-animate |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth |
| LLM | Groq (llama-3) |
| Scraping | Cheerio + Jina AI reader |
| Email | Resend |
| Push | Web Push (web-push) |
| PDF | pdf-parse + PDFKit |
| Animations | Framer Motion 12 + @lottiefiles/dotlottie-react |
| Icons | Lucide React + Radix Icons |
| Testing | Vitest |
| Deployment | Vercel (iad1) |

## Pages

| Route | Description |
|---|---|
| `/` | Home — keyword tags, run pipeline, live log stream |
| `/queue` | Review queue — score, draft, approve/reject |
| `/saved` | Saved jobs |
| `/applied` | Sent applications with multi-note sheet |
| `/analyse` | Job title frequency insights |
| `/insights` | Match score trends |
| `/profiel` | Profile / CV management (PDF upload) |
| `/settings` | Keywords, daily scrape toggle, push notifications |
| `/admin` | System logs, pipeline status, admin tools |
| `/onboarding` | Guided setup walkthrough |
| `/login` | Login |
| `/auth` | Supabase auth callback |
| `/offline` | PWA offline fallback |
| `/debug` | Debug utilities |

## API routes

| Route | Method | Description |
|---|---|---|
| `/api/scrape/stream` | POST | Streams scrape logs as NDJSON, inserts jobs |
| `/api/process` | POST | Scores + drafts unprocessed jobs via Groq |
| `/api/pipeline/run` | POST | Trigger pipeline for a user |
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
| `/api/settings` | GET/POST | Keyword + notification settings |
| `/api/logs` | GET | System log entries (admin) |
| `/api/title-suggestions` | GET | LLM-powered job title suggestions (auth-gated, 7-day cache) |
| `/api/push` | GET/POST/DELETE | Web Push subscription management |
| `/api/cron/daily-scrape` | POST | Cron-triggered daily scrape (CRON_SECRET required) |

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

# Web Push (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

# Locks the cron-triggered scrape endpoint
CRON_SECRET=
```

Run the schema:

```bash
# Paste supabase/schema.sql into your Supabase SQL editor
# Then apply migrations in supabase/migrations/ in order
```

Start dev server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

## Project structure

```
app/
  page.tsx              # Home / pipeline trigger
  admin/                # Admin panel
  analyse/              # Job title insights
  applied/              # Sent applications
  auth/                 # Supabase auth callback
  debug/                # Debug utilities
  insights/             # Match score trends
  login/                # Login page
  offline/              # PWA offline fallback
  onboarding/           # Guided setup walkthrough
  profiel/              # Profile / CV
  queue/                # Review queue
  saved/                # Saved jobs
  settings/             # User settings
  api/                  # All API routes
components/
  NavBar.tsx            # Fixed bottom tab bar
  ApplyModal.tsx        # Cover letter review + send
  NoteSheet.tsx         # Multi-note sheet for applications
  SplashScreen.tsx      # Animated splash / wordmark
  SettingsMenu.tsx      # User settings drawer
  ...
lib/
  scraper/              # Per-source scraping logic
  groq.ts               # LLM scoring + drafting
  supabase.ts           # DB helpers
public/
  sw.js                 # Service worker (PWA + push)
supabase/
  schema.sql            # Full DB schema
  migrations/           # Incremental migrations
.claude/
  settings.json         # Claude Code permissions
```

## iOS

An `.ipa` build is available via the GitHub Actions workflow above. Use [SideStore](https://sidestore.io/) for local signing.

## Why this exists

Job board scrolling is slow and repetitive. This reduces it to: run pipeline → review scored queue → send applications.
