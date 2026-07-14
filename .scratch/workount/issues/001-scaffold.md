# 001 — Scaffold Next.js app and tooling

**Blocked by:** nothing · **Blocks:** 002

## Goal

An empty but correctly-configured Next.js app that builds, lints, and runs a passing (trivial) test.

## Scope

- `create-next-app` into the repo root: TypeScript, App Router, Tailwind, ESLint, `src/` directory, import alias `@/*`.
- Dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `zustand`, `idb-keyval`, `recharts`, `date-fns`.
- Dev dependencies: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@playwright/test`, `prettier`.
- shadcn/ui init. Add the components we know we need: `button`, `input`, `card`, `dialog`, `select`, `sheet`, `badge`.
- Scripts in `package.json`: `dev`, `build`, `lint`, `test` (vitest), `test:e2e` (playwright).
- `git init` and an initial commit. `.gitignore` must cover `.env*.local`.
- `.env.example` committed with the two keys (empty values):
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  ```

## Out of scope

Any Supabase client code (that's 002). Any app screens.

## Acceptance

- `npm run dev` serves the default page.
- `npm run build` succeeds.
- `npm run test` runs and passes (one trivial test is fine — the point is that the runner is wired).
- `.env.local` is git-ignored; `.env.example` is committed.

## Notes

Tailwind v4 changed configuration substantially (CSS-first, `@theme`). Use whatever `create-next-app` scaffolds rather than hand-writing a `tailwind.config.ts` from memory — it will be wrong.
