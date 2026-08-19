import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { userFromClaims, type CurrentUser } from "./claims";

export type { CurrentUser };

/**
 * The signed-in user for the current request, or `null`.
 *
 * Two things make this cheap where `supabase.auth.getUser()` was not:
 *
 *  - `getClaims()` verifies the access token's ES256 signature locally with
 *    WebCrypto instead of asking the auth server who this is (ADR-0006). The
 *    JWKS is fetched once per server process and cached in auth-js's
 *    module-level `GLOBAL_JWKS`, shared across every per-request client.
 *  - React's `cache()` dedupes by request, so the layout and the page it
 *    renders share one call rather than each making their own.
 *
 * Both matter on every navigation: before this, a single screen change cost
 * three round trips to the auth server (proxy, layout, page) before anything
 * could paint.
 *
 * `cache()` is per-request by construction — nothing leaks between users.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  // getClaims() with no argument reads the session first, which is what still
  // refreshes an expired access token. Do not "optimise" that away by passing
  // a token read from the cookie directly.
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  return userFromClaims(data?.claims);
});
