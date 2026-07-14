# 020 — Forgot-to-finish push reminder

**Blocked by:** 019 · **Blocks:** —

## Goal

The user finishes training, showers, drives home, and never taps **Finish**. Nudge them, so the session gets committed while they still remember what they lifted.

## Scope

- **Migration:** `push_subscriptions` (user_id, endpoint, p256dh, auth, created_at). RLS: own rows only.
- Ask for notification permission **at a moment when it makes sense** — after the user's *first completed session*, not on first load. A permission prompt before the user has any idea what the app does gets denied, and browsers give you exactly one shot.
- A **`pg_cron`** job (or Supabase scheduled Edge Function): find `sessions` with `status = 'active'` and `started_at < now() - interval '3 hours'`, and send a Web Push: *"Still training? Your session is still open."* Send **once** per session — track a `reminded_at` column, or you will nag someone every hour all night.
- Service worker `push` handler → notification → tapping it opens `/session`.

## The fallback matters more than the push

Most users will decline notification permission, and iOS Web Push only works **if the app was installed to the home screen** (hence the 019 dependency) and remains historically flaky. So the reminder is a nice-to-have, and **the fallback is the real feature**:

> On next app open, a draft older than ~12 hours prompts **Resume / Finish now / Discard**.

That's already in the 015 resolver. It requires no permissions, no cron, no push infrastructure, and it catches every case the push does. **Build the fallback first and confirm it works.** If push turns out to be more trouble than it's worth, the fallback alone is genuinely enough, and this ticket can be closed unbuilt without the user losing anything important.

## Acceptance

- A session left `active` for >3h triggers exactly **one** push (not one per cron tick).
- Tapping it opens the session, draft intact.
- A user who **declined** notifications still gets the stale-draft prompt on next open. This path must work.
- No push is sent for a session that was completed or abandoned.
