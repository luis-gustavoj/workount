# 002 — Wire up Supabase clients and middleware

**Blocked by:** 001 · **Blocks:** 003

## Goal

Server, browser, and middleware Supabase clients, with cookie-based session handling that actually refreshes tokens. Nothing user-facing yet.

## Prerequisite (human, not agent)

The user must create the Supabase project and put the URL + anon key in `.env.local`. **You cannot do this** — it requires account creation. If `.env.local` is absent, stop and ask.

## Scope

- `supabase init` — migrations live in `supabase/migrations/`, committed. **The schema is never edited through the dashboard.**
- `src/lib/supabase/server.ts` — server client for RSCs and Server Actions, using `@supabase/ssr`'s `createServerClient` with the Next.js `cookies()` store.
- `src/lib/supabase/client.ts` — browser client (`createBrowserClient`).
- `src/lib/supabase/middleware.ts` + `src/middleware.ts` — refreshes the auth token on every request and guards the `/(app)` route group, redirecting unauthenticated users to `/sign-in`.
- `src/lib/types/database.ts` — generated types placeholder; regenerate with `supabase gen types typescript` after 003 lands.

## Acceptance

- `npm run build` succeeds with the clients imported somewhere.
- Hitting a route under `/(app)` while signed out redirects to `/sign-in`.

## Notes

**Do not write the middleware from memory.** `@supabase/ssr`'s cookie handling is fiddly and has changed across versions; getting it subtly wrong produces sessions that appear to work and then silently fail to refresh, logging users out mid-session. Follow the current official Supabase + Next.js App Router guide. The `getAll`/`setAll` cookie interface is the current one — `get`/`set`/`remove` is deprecated.

The middleware **must** return the `supabaseResponse` object it was given, with cookies intact. Constructing a fresh `NextResponse` and returning that instead is the single most common way to break this, and it breaks it invisibly.
