# Agent Team Playbook

Run each agent in its own git worktree so they never conflict.

```bash
git worktree add ../aa-db       main
git worktree add ../aa-auth     main
git worktree add ../aa-pwa      main
git worktree add ../aa-ui       main
git worktree add ../aa-wildcard main
```

## Agents

| Agent | Worktree | Scope | Touches |
|-------|----------|-------|---------|
| **DB** | `../aa-db` | Supabase schema, queries, lib helpers | `lib/`, `supabase/` |
| **Auth** | `../aa-auth` | Session, middleware, auth API routes | `middleware.ts`, `app/api/auth/` |
| **PWA** | `../aa-pwa` | Serwist config, caching strategy, manifest | `next.config.ts`, `public/`, `app/sw.ts` |
| **UI** | `../aa-ui` | Components, pages, Framer Motion animations | `components/`, `app/` (UI only) |
| **Wildcard** | `../aa-wildcard` | Types cleanup, dead code, performance — no new features | anything not listed above |

## Agent Rules

### DB Agent
- Never guess schema — ask if ambiguous. Always add RLS policies with migrations. Only agent allowed to touch `lib/`.

### Auth Agent
- Rate limit all auth endpoints. Never log tokens or email addresses.

### PWA Agent
- Stale-while-revalidate for API routes, cache-first for static. Test offline fallback on every change.

### UI Agent
- Never import from Supabase directly — use `lib/` helpers only. Framer Motion only, no raw CSS transitions.

### Wildcard Agent
- Runs last after all merges. No new features. Types, dead code, performance only.

## Workflow

1. Use plan mode first: `claude --plan` — define task + files touched, confirm no overlap
2. Start agents in table order (DB first — others depend on it; Wildcard always runs last after all merges)
3. Each agent reads its row above and ONLY modifies listed paths
4. Status is tracked in `TASKS.md` (create per session, not committed)
5. When an agent needs review → pause, inspect diff, continue
6. Merge order: DB → Auth → PWA → UI → Wildcard

## Shared file rule

Only the DB agent may touch shared files (e.g. `lib/supabase-request.ts`, `lib/supabase-service.ts`). All others wait for its merge.

## Token hygiene per agent session

- Point at specific files: `@lib/groq.ts` not "look at the codebase"
- Run `/compact` before context hits 50%
- `/clear` between unrelated tasks — don't chain sessions
