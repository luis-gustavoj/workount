import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { profileFromUser } from "@/lib/auth/profile";
import {
  asLocale,
  localeFromAcceptLanguage,
  LOCALE_COOKIE,
  LOCALE_COOKIE_OPTIONS,
  shouldSeedLocale,
  type Locale,
} from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

/**
 * The OAuth callback. Google redirects here with a `code`; we exchange it for a
 * session (which `createClient` writes to the auth cookies) and send the user
 * into the app. Their `profiles` row is created by the `handle_new_user`
 * trigger (migration 0002) as a side effect of the auth.users insert, and
 * `ensureProfile` below self-heals it if the trigger ever fails.
 *
 * This route must stay reachable while signed out — it is allowlisted under
 * `/auth` in isPublicPath.
 */

/**
 * Self-heal a missing `profiles` row (ticket 005).
 *
 * The `handle_new_user` trigger (migration 0002) is the normal way a profile is
 * born, but "triggers are the kind of thing that works in dev and surprises you
 * once", so a signed-in user with no row must be repaired rather than shown a
 * crash.
 *
 * This used to live in the (app) layout, which meant paying a `profiles` SELECT
 * on *every* navigation to check for a row that is essentially always there.
 * Sign-in is the moment a profile can actually be missing, so the repair
 * belongs here — once per session instead of once per screen.
 *
 * `ignoreDuplicates` so a race with the trigger (or a second tab) is a no-op
 * rather than a unique violation. RLS permits this insert: the profiles policy
 * allows `id = auth.uid()`, and the session cookies were just written, so we
 * are that user.
 */
async function ensureProfile(
  supabase: SupabaseClient<Database>,
  user: User,
  acceptLanguage: string | null,
): Promise<void> {
  await supabase
    .from("profiles")
    .upsert(profileFromUser(user, acceptLanguage), {
      onConflict: "id",
      ignoreDuplicates: true,
    });
}

/**
 * Resolve the locale to render this user in, and keep `profiles.locale` honest
 * (ADR-0005 / ticket 022). On the *first* sign-in the trigger has written the
 * `'en'` column default — it can't read `Accept-Language` — so we correct it
 * here, where the header exists. On later sign-ins we read the stored value
 * (never overwriting a deliberate choice), falling back to the header only if
 * the row is somehow absent. Returned so the caller can mirror it into the
 * cookie the render path reads.
 */
async function resolveSignInLocale(
  supabase: SupabaseClient<Database>,
  user: User,
  acceptLanguage: string | null,
): Promise<Locale> {
  if (shouldSeedLocale(user, Date.now())) {
    const locale = localeFromAcceptLanguage(acceptLanguage);
    await supabase.from("profiles").update({ locale }).eq("id", user.id);
    return locale;
  }

  const { data } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", user.id)
    .maybeSingle();

  return asLocale(data?.locale) ?? localeFromAcceptLanguage(acceptLanguage);
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  // Resolve the origin to redirect back to. Behind Vercel's proxy the request
  // URL's host is the internal one, so prefer the forwarded host in production;
  // on localhost there is no proxy, so trust the request origin.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base =
    isLocal || !forwardedHost
      ? url.origin
      : `https://${forwardedHost}`;

  // Google can bounce back with ?error (user cancelled the consent screen), or
  // with no code at all if the provider isn't configured (ticket 005
  // prerequisite). Either way there is nothing to exchange — return to sign-in.
  if (oauthError || !code) {
    return NextResponse.redirect(`${base}/sign-in?error=oauth`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/sign-in?error=exchange`);
  }

  const response = NextResponse.redirect(`${base}/home`);

  // Seed/read the locale and mirror it into the cookie the root layout resolves
  // from, so the very first authenticated render is already in the right
  // language. The session cookies were just written by exchangeCodeForSession,
  // so this profiles write runs authenticated and RLS-clean (id = auth.uid()).
  if (data.user) {
    const acceptLanguage = request.headers.get("accept-language");
    // Before anything reads the row: repair it if the trigger missed.
    await ensureProfile(supabase, data.user, acceptLanguage);
    const locale = await resolveSignInLocale(
      supabase,
      data.user,
      acceptLanguage,
    );
    response.cookies.set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
  }

  return response;
}
