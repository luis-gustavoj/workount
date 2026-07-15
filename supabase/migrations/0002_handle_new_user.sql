-- 0002_handle_new_user.sql — auto-create a profiles row when an auth user is born.
--
-- ADR-0003: there is NO signup form. Google OAuth is the only provider, so this
-- trigger is the *only* path by which a profiles row is ever created. If it
-- fails, sign-up fails for every user — so it is written defensively, and the
-- app also self-heals a missing profile on the next request (see the (app)
-- layout and src/lib/auth/profile.ts). "Triggers are the kind of thing that
-- works in dev and surprises you once" (ticket 005).
--
-- SECURITY DEFINER is mandatory. The trigger fires inside the auth system's
-- INSERT into auth.users, but it writes public.profiles, which RLS locks to
-- `id = auth.uid()`. At this point there is no auth.uid() yet, so an
-- INVOKER-rights function would be rejected by RLS and every sign-up would
-- fail. DEFINER runs it as the function owner (the migration superuser), which
-- bypasses RLS.
--
-- Because DEFINER escalates privilege, `search_path` is pinned to '' and every
-- object is fully schema-qualified (public.profiles). Without this, a crafted
-- search_path could resolve an unqualified `profiles` to an attacker-controlled
-- table — the classic SECURITY DEFINER privilege-escalation hole (ticket 005).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- Google's identity payload lands in raw_user_meta_data: the name in
    -- full_name (falling back to name), the avatar in avatar_url (falling back
    -- to picture). All are optional — display_name and avatar_url are nullable,
    -- so a profile of just an id is valid. default_rest_seconds is left to its
    -- column default of 90 (0001_init.sql), which is the acceptance criterion.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  -- Idempotent by construction: the row is keyed on auth.users.id, so a second
  -- sign-in (or a race with the app-side self-heal) neither creates a duplicate
  -- nor clobbers the existing row. Acceptance: signing in twice yields one
  -- profile.
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Recreate idempotently so the migration is safe to re-run against a database
-- that already has the trigger.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
