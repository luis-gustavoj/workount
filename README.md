# Workount

Track your training programs and log your sessions — from your phone, in the gym, with no signal.

## What it does

- **Build a program** — multi-day training plans ("Push A" on Monday), each day prescribing exercises with target sets, rep ranges, rest, and notes. Supersets supported.
- **Follow one program at a time** — the home screen tells you what to train today, and whether you've already done it.
- **Log a session, offline** — the session player prefetches everything it needs and then runs with **zero network**. Gyms are basements; this app doesn't care. Kill the browser mid-workout and nothing is lost.
- **See what you did last time** — next to every set: *"Last time: 80×8, 80×8, 77.5×7."* Progressive overload is impossible without it.
- **Rest timer** — defaults to 90s, respects per-exercise overrides, ±15s.
- **Per-program analytics** — volume, estimated 1RM progression, PRs, adherence.

## Stack

Next.js (App Router, TypeScript) · Supabase (Postgres + RLS + Google auth) · Tailwind + shadcn/ui · Zustand + IndexedDB · Recharts. Deployed on Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL + anon key
supabase link --project-ref <ref>
supabase db push               # apply migrations
npm run dev
```

You'll need a Supabase project and a Google OAuth client (configured under Authentication → Providers).

## Docs

| | |
|---|---|
| [docs/CONTEXT.md](docs/CONTEXT.md) | The domain vocabulary. **Start here** — "workout" and "session" mean specific, different things. |
| [docs/SPEC.md](docs/SPEC.md) | Data model, RPCs, screens, acceptance criteria. |
| [docs/adr/](docs/adr/) | Decisions that were expensive to make and would be expensive to reverse. |
