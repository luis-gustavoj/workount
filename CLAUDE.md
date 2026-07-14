# Workount

Mobile-first web app for tracking strength-training **programs** and **sessions**. Next.js (App Router) + Supabase.

## Read before writing code

- **[docs/CONTEXT.md](docs/CONTEXT.md)** — the domain vocabulary. Read it first; the words are load-bearing.
- **[docs/SPEC.md](docs/SPEC.md)** — the data model, the RPCs, the screens, the acceptance criteria.
- **docs/adr/** — decisions that are expensive to reverse, with their reasoning. Don't relitigate them; if one is genuinely wrong, write a new ADR superseding it.
- **.scratch/workount/issues/** — the tickets. Work blockers-first.

## The five things that are easy to get wrong

1. **"Workout" ≠ "session".** A **workout** is the *plan* (a day in a program, editable). A **session** is the *performance* (what happened, immutable). English uses one word for both; this codebase never does. Getting this wrong corrupts the schema.

2. **Warmup sets never count.** Excluded from volume, e1RM, and PRs — everywhere, no exceptions. Forget this and week one of any program reports fake personal records.

3. **The rest timer is an end timestamp, not a counter.** Store `restEndsAt` (epoch ms) and derive the remaining time on render. A decrementing counter freezes or drifts when the phone locks the screen — which is precisely when the timer is running.

4. **The session player makes no network calls.** It prefetches a bundle at start and commits once at finish ([ADR-0001](docs/adr/0001-offline-first-session-player.md)). If you find yourself adding a `fetch` to the player, you have broken the core design. Every state change writes through to IndexedDB.

5. **Weights are stored in kilograms. Always.** `profiles.weight_unit` is a *display* preference; convert at the UI edge, never in the database.

## Conventions

- **RLS on every table, in the same migration that creates it.** Never "add it later."
- **Server Actions for all mutations**, Zod-validated at the boundary. No unvalidated input reaches the database.
- **Aggregation lives in Postgres** (views/RPCs), not in JavaScript ([ADR-0004](docs/adr/0004-analytics-are-scoped-to-a-program.md)).
- Migrations are files in `supabase/migrations/`, committed. Never edit the schema through the dashboard.

## Commands

```bash
npm run dev           # next dev
npm run build         # next build
npm run test          # vitest
npm run test:e2e      # playwright
supabase db reset     # rebuild local db from migrations + seed
supabase migration new <name>
```

## Environment

`.env.local` (see `.env.example`) needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
