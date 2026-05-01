# Auto Apply Agent

A personalised job pipeline for the Belgian market. Scrapes job boards daily, scores listings against your profile with an LLM, drafts cover letters, and surfaces everything in a mobile-first review queue. 

[![Build IPA](https://github.com/Jordybeer/auto-apply-agent/actions/workflows/ios-build.yml/badge.svg)](https://github.com/Jordybeer/auto-apply-agent/actions/workflows/ios-build.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs)
![React 19](https://img.shields.io/badge/React-19-07111d?style=for-the-badge&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-iad1-000000?style=for-the-badge&logo=vercel&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-0ea5a4?style=for-the-badge)

# Supported platforms

## iOS native app

An `.ipa` build is available via the GitHub Actions workflow above. Use [SideStore](https://sidestore.io/) for local signing.

## Next.js webapp

Easily accessible cross platforms through your favourite webbrowser with carefully tailored UI-UX design philosophy to make the process as smooth as baby cheeks. 

## PWA support 
For iOS, Android, Linux, Windows & MacOS without having to rely on an actual app install while enabling extra features like chron jobs, optimised localStorage caching and notification support. 

# Why this exists

Scrolling through job boards is tedious and repetitive, especially when using multiple platforms to maximise your chances of landing a job. Current algorithms aren’t always accurate, wasting valuable time. Furthermore, the same job offers are often cross-posted across different platforms. 

This boils down to a pipeline: run, review, score, and send applications. The process involves deduplicating identical offers while maintaining a highly personalised approach. 

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
- **Native iOS app** - Installable on Apple AppStore for easier access while providing a native, premium feel user experience. 

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


