# JobTide

A personalised job pipeline for the Belgian market. Scrapes job boards, scores listings against your CV with an LLM, drafts cover letters, and surfaces everything in a mobile-first review queue.

[![Build IPA](https://github.com/Jordybeer/auto-apply-agent/actions/workflows/ios-build.yml/badge.svg)](https://github.com/Jordybeer/auto-apply-agent/actions/workflows/ios-build.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs)
![React 19](https://img.shields.io/badge/React-19-07111d?style=for-the-badge&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-deployed-000000?style=for-the-badge&logo=vercel&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-0ea5a4?style=for-the-badge)

## Platforms

**iOS native app** — `.ipa` via GitHub Actions. Use [SideStore](https://sidestore.io/) for local signing.

**Web / PWA** — installable on iOS, Android, desktop. Bottom-tab navigation, offline fallback, push notifications.

**Telegram bot** — quick commands for pipeline control and alerts. [@codebearbot](https://t.me/codebearbot)

## Why

Scrolling multiple Belgian job boards is tedious. Same listings appear everywhere. This pipeline deduplicates, scores against your profile, and drafts a personalised cover letter so you only touch the jobs worth applying to.

## Features

- **Multi-source scraping** — Adzuna REST API · Jobat / Stepstone / Indeed / VDAB via Jina AI reader + Cheerio
- **LLM scoring** — 6-criterion rubric (function match, experience, sector, language, contract, growth) via Groq Llama 70B · deterministic skill-match layer on top
- **Anthropic-powered premium features** — CV parsing (Sonnet), pipeline scoring (Haiku), cover letters (Sonnet), job analysis (Sonnet)
- **Freemium model** — free tier: 5 manual evaluations/day, 1 job analysis · premium (€2.99/wk or €9.99/mo): unlimited, Anthropic models
- **Fire-and-forget pipeline** — runs as independent Vercel serverless invocation; browser backgrounding can't kill it
- **Review queue** — score, save, skip, apply with cover letter · auto-apply below configurable threshold
- **Job analysis page** — paste any Belgian job URL, get Sonnet-powered match score + pros/cons/advice
- **Push notifications** — Web Push (VAPID) on pipeline completion · in-app notification center · iOS APNs plumbing ready
- **CV intelligence** — PDF upload → Sonnet extracts structured skills/tools/languages/experience · used in every scoring call
- **Admin panel** — colour-coded live logs by source, pipeline controls, API cost estimate (7d/30d/all), tier toggle
- **Auto-apply** — Telegram approval flow for high-score jobs (≥85%), email via Resend
- **Application notes** — multi-note sheet per application
- **Onboarding walkthrough** — spotlight-guided first run
- **Dark / light mode**
- **Security** — RLS on all tables · CRON_SECRET guard · timing-safe auth · URL allowlist · prompt injection sanitization

## LLM routing

| Action | Free | Premium |
|---|---|---|
| Pipeline batch scoring | Groq Llama 70B | Claude Haiku 4.5 |
| Manual evaluate — score | Groq Llama 70B (5/day) | Claude Haiku 4.5 |
| Manual evaluate — letter | Groq Llama 70B | Claude Sonnet 4.6 |
| Job analysis (/analyse) | Claude Sonnet 4.6 (1 free) | Claude Sonnet 4.6 |
| CV parsing on upload | Claude Sonnet 4.6 | Claude Sonnet 4.6 |

## Pages

| Route | Description |
|---|---|
| `/` | Home — keyword tags, trigger pipeline |
| `/queue` | Review queue — score, draft, approve/skip |
| `/saved` | Saved jobs |
| `/applied` | Sent applications with notes |
| `/analyse` | Paste a job URL → Sonnet analysis |
| `/notifications` | In-app notification center |
| `/profiel` | Profile / CV management (PDF upload) |
| `/settings` | Keywords, location, push notifications, subscription |
| `/upgrade` | Premium subscription (Stripe) |
| `/admin` | System logs, pipeline controls, cost estimate |
| `/onboarding` | Guided setup walkthrough |

## API routes

| Route | Method | Description |
|---|---|---|
| `/api/pipeline/trigger` | POST | Fire-and-forget pipeline start (returns 202 immediately) |
| `/api/pipeline/run` | POST | Full pipeline — scrape → score → notify (CRON_SECRET) |
| `/api/scrape/stream` | POST | Scrape job boards, stream NDJSON logs |
| `/api/process` | POST | Score + filter new jobs via Haiku/Groq |
| `/api/apply` | POST/PATCH/DELETE | Evaluate job, generate letter, auto-apply |
| `/api/analyse` | POST | Sonnet-powered single-job analysis |
| `/api/analyse/save` | POST/DELETE | Save/remove an analysed job |
| `/api/queue` | GET | Fetch pending review queue |
| `/api/saved` | GET | Saved jobs |
| `/api/applied` | GET | Applied jobs |
| `/api/cv` | GET/POST | CV upload + structured extraction |
| `/api/profiel` | GET/POST | Profile data |
| `/api/settings` | GET/POST/DELETE | User settings |
| `/api/logs` | GET/DELETE | System logs (admin) |
| `/api/admin/cost` | GET | Estimated Anthropic API spend by period |
| `/api/notifications` | GET/POST | In-app notifications |
| `/api/push/device-token` | POST/DELETE | APNs device token |
| `/api/subscription/status` | GET | Premium status |
| `/api/version` | GET | Min supported iOS build + latest versions |
| `/api/cron/daily-scrape` | POST | Cron-triggered daily scrape |

## Local setup

```bash
npm i
```

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ANTHROPIC_API_KEY=        # CV parsing, pipeline scoring, analyse, premium letters
GROQ_API_KEY=             # Free-tier scoring + letters, skill extraction, fallback
JINA_API_KEY=             # Job description scraping
RESEND_API_KEY=           # Application emails
RESEND_FROM_ADDRESS=

# Web Push (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

CRON_SECRET=              # Guards /api/pipeline/run and /api/process
ADMIN_USER_ID=            # Supabase user ID with admin access
APP_URL=                  # e.g. https://yourdomain.vercel.app
NEXT_PUBLIC_APP_URL=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Adzuna
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

Run the schema:

```bash
# Paste supabase/schema.sql into your Supabase SQL editor
# Then apply migrations in supabase/migrations/ in order
```

Start dev server:

```bash
npm run dev
npm test
```

## Project structure

```
app/
  page.tsx              # Home / pipeline trigger
  admin/                # Admin panel (logs, cost, controls)
  analyse/              # Single-job Sonnet analysis
  applied/              # Sent applications + notes
  notifications/        # In-app notification center
  queue/                # Review queue
  settings/             # User settings + subscription
  upgrade/              # Premium subscription
  api/                  # All API routes
components/
  NavBar.tsx            # Fixed bottom tab bar
  ApplyModal.tsx        # Cover letter review + send
  MoneyRain.tsx         # Pipeline run animation
  SettingsMenu.tsx      # Settings drawer
lib/
  groq.ts               # Scoring rubric, cover letter, skill matching
  anthropic.ts          # Haiku scoring, Sonnet letter/CV/analyse
  parse-cv-structured.ts# CV PDF → structured skills (Sonnet)
  location-score.ts     # Deterministic Belgian location bonus
  parse-job-skills.ts   # Deterministic skill extraction
supabase/
  schema.sql            # Full DB schema + migrations
ios/
  JobTide/              # Swift/SwiftUI native app
```
