import type { JwtPayload } from "@supabase/supabase-js";

/**
 * The signed-in identity, as the rest of the app needs it. Deliberately
 * narrow: `id` is what every RLS-scoped query keys on, and `email` is the
 * last-resort display label. Anything richer belongs in `profiles`, not in a
 * token we now read without asking the auth server.
 */
export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * Turn verified JWT claims into a `CurrentUser` (ADR-0006).
 *
 * This runs *after* `getClaims()` has verified the signature, so the claims
 * are trustworthy — but "trustworthy" is not "the right kind of token". Two
 * checks are load-bearing:
 *
 *  - `role` must be `authenticated`. Supabase's own anon key is a validly
 *    signed JWT for the same project; it verifies perfectly and carries
 *    `role: 'anon'`. Without this check a request presenting it would read as
 *    a signed-in user to the app (Postgres would still refuse it under RLS,
 *    but the app would have already rendered a signed-in shell).
 *  - `sub` must be a non-empty string. It is the user id every query is
 *    scoped by; an absent one must fail closed, not produce `undefined`.
 *
 * Returns `null` rather than throwing: "not signed in" is a normal state on
 * every public route, not an error.
 */
export function userFromClaims(claims: JwtPayload | null | undefined): CurrentUser | null {
  if (!claims) return null;
  if (claims.role !== "authenticated") return null;

  const id = typeof claims.sub === "string" ? claims.sub : "";
  if (id.length === 0) return null;

  const email =
    typeof claims.email === "string" && claims.email.length > 0
      ? claims.email
      : null;

  return { id, email };
}
