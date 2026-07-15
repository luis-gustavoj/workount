import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * The OAuth callback. Google redirects here with a `code`; we exchange it for a
 * session (which `createClient` writes to the auth cookies) and send the user
 * into the app. Their `profiles` row is created by the `handle_new_user`
 * trigger (migration 0002) as a side effect of the auth.users insert, and the
 * (app) layout self-heals it if the trigger ever fails.
 *
 * This route must stay reachable while signed out — it is allowlisted under
 * `/auth` in isPublicPath.
 */
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
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/sign-in?error=exchange`);
  }

  return NextResponse.redirect(`${base}/`);
}
