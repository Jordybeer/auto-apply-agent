# 🗺️ Auto-Apply Agent — Roadmap

This document mirrors the GitHub Milestones & Issues plan.

---

## Milestone 1 — Core UX Polish (current sprint)
- [ ] Swipe smoothness & velocity-based threshold
- [ ] Clickable skip/save buttons as swipe alternatives
- [ ] Queue sorted by match score (desc)
- [ ] "Thuis werken" / remote bonus in Groq rubric

## Milestone 2 — Pipeline & Automation
- [ ] Cron job: auto-fetch new jobs on schedule
- [ ] Background Groq evaluation queue (don't block UI)
- [ ] Dedup logic: skip already-seen job URLs
- [ ] Webhook / notification when high-score job arrives

## Milestone 3 — AI Quality
- [ ] Rematch all jobs when CV is updated
- [ ] Per-job reasoning stored & displayed in card
- [ ] Cover letter tone picker (formal / semi-formal)
- [ ] Multi-language support (NL / EN / FR)

## Milestone 4 — Custom Scraper Integration (future)
> Reimplementing custom website scraping to synergise with the current pipeline tool.
- [ ] VDAB scraper adapter
- [ ] Indeed scraper adapter
- [ ] Stepstone scraper adapter
- [ ] Unified scraper interface (pluggable source adapters)
- [ ] Rate limiting & proxy rotation for scrapers
- [ ] Map scraped jobs to existing `jobs` table schema

---

> Issues are tracked on GitHub. See [Issues tab](https://github.com/Jordybeer/auto-apply-agent/issues).
