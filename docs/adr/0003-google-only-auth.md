# ADR-0003 — Google OAuth only; no email/password

**Status:** Accepted · 2026-07-14

## Context

The app needs accounts (data is per-user, and RLS gates on `auth.uid()`), but authentication is not the product. Every hour spent on it is an hour not spent on the session player.

Email/password looks cheap and isn't. It drags in: a signup form, email verification, password reset, a transactional email provider, rate limiting on the login endpoint, password strength rules, and the permanent obligation to store credentials responsibly. All of it is undifferentiated, all of it is a security surface, and all of it is a liability the moment it's done carelessly.

## Decision

**Supabase Auth with Google OAuth as the only provider.** No email/password, ever.

- The sign-in screen is **one button**.
- No credential is stored by us — not a hash, not a salt, nothing.
- Password reset, email verification, and credential storage are not features we have, therefore not features we can get wrong.
- A trigger on `auth.users` insert creates the `profiles` row, seeding `display_name` and avatar from Google's identity payload. There is no signup form to collect them.

**Apple Sign In was explicitly considered and dropped.** It requires a paid Apple Developer account ($99/yr) plus a Service ID and signing key. Apple only *mandates* it for native iOS apps — this is a PWA, so it doesn't apply. Not worth $99 and an afternoon before the app exists.

## Consequences

**Good.** Auth is roughly a day's work, most of it dashboard configuration. Zero credential liability.

**Accepted costs.**
- **Users without a Google account cannot sign up.** For a personal-and-friends training app this is fine. If that ever stops being true, it's a dashboard toggle plus a button — the schema keys off `auth.users.id` and is entirely provider-agnostic, so **adding a provider later requires no migration and no application code changes.** This is the property that makes the decision cheap to reverse, and it's why it's safe to make now.
- **E2E tests cannot script Google's consent screen** (and shouldn't try — it has bot detection, and automating it is fragile and against the spirit of the thing). Playwright authenticates instead by injecting a Supabase session cookie for a seeded test user.
