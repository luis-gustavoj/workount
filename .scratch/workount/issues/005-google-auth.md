# 005 — Google sign-in and profile creation

**Blocked by:** 003 · **Blocks:** 006

## Goal

Sign in with Google, land in the app with a `profiles` row already created. **This is the first checkpoint** — it's unglamorous, but a working sign-in proves the entire stack is wired end to end.

## Prerequisite (human, not agent)

The user must create a Google OAuth client (Google Cloud Console) and paste the client ID/secret into Supabase → Authentication → Providers → Google. **You cannot do this** — it requires account access and handling a secret. If Google sign-in returns a provider error, this is why; stop and tell them.

The authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.

## Scope

- `/sign-in` — one button. No form, no email field, no password. See [ADR-0003](../../../docs/adr/0003-google-only-auth.md).
- `src/app/auth/callback/route.ts` — exchanges the OAuth `code` for a session (`exchangeCodeForSession`), then redirects to `/`.
- **Migration:** a trigger on `auth.users` insert → `INSERT INTO profiles`, seeding `display_name` and `avatar_url` from `new.raw_user_meta_data` (Google puts them in `full_name`/`name` and `avatar_url`). There is no signup form, so this trigger is the *only* way a profile ever gets created.
- Sign out.
- The `/(app)` route group renders the signed-in shell.

## Acceptance

- Signing in with Google lands on `/` with a `profiles` row auto-created, `default_rest_seconds = 90`.
- Signing out and hitting `/` redirects to `/sign-in`.
- Signing in a **second** time does not create a second profile.

## Notes

The trigger must be `SECURITY DEFINER` — it runs in the context of the auth system inserting into a table that RLS protects, and without it the insert is rejected and **sign-up fails for every user**. Set `search_path = ''` on it and fully qualify `public.profiles`, or you have a privilege-escalation hole.

Handle the trigger failing gracefully in the app anyway: a signed-in user with no profile row should be repaired on next request, not shown a crash. Triggers are the kind of thing that works in dev and surprises you once.
