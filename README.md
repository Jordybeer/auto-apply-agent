# Auto Apply Agent 🤖

A personalized, automated job application assistant built with Next.js, Supabase, and OpenAI. 
Scrapes job boards (VDAB, Jobat), scores them against your personal profile, and pre-drafts tailored cover letters and resume bullets for you to review once a day.

## Tech Stack
- Next.js 15 (App Router)
- TypeScript & Tailwind CSS
- Supabase (PostgreSQL)
- Cheerio (Scraping)
- OpenAI API (Drafting)

## Setup Instructions
1. `npm install` to grab dependencies
2. Create `.env.local` and add:
   - `NEXT_PUBLIC_SUPABASE_URL=`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=`
   - `SUPABASE_SERVICE_ROLE_KEY=` (for bypassing RLS on server)
   - `OPENAI_API_KEY=`
3. Run the SQL schema in `supabase/schema.sql` in your Supabase SQL editor.
4. `npm run dev` to start the app.