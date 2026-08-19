import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { userFromClaims } from "@/lib/auth/claims";
import { isPublicPath } from "@/lib/nav/routes";

/**
 * Refreshes the Supabase auth session on every request and guards protected
 * routes. Called from `src/proxy.ts` (Next 16 renamed the `middleware` file
 * convention to `proxy`; the old name still builds but logs a deprecation).
 *
 * The cookie handling here is load-bearing and easy to break invisibly:
 *
 *  - It uses the current `getAll` / `setAll` contract, not the deprecated
 *    `get` / `set` / `remove`.
 *  - `setAll` writes refreshed cookies to BOTH `request` (so this request sees
 *    them) and `supabaseResponse` (so the browser stores them).
 *  - It returns the same `supabaseResponse` it built, cookies intact. Returning
 *    a freshly constructed `NextResponse` instead would drop the refreshed auth
 *    cookies and silently log users out mid-session.
 *
 * Do not insert logic between `createServerClient` and `getClaims()`: that call
 * is what reads — and, when expired, refreshes — the session, and anything
 * racing it can desync cookies.
 *
 * `getClaims()` rather than `getUser()` is ADR-0006: it verifies the token's
 * ES256 signature locally instead of spending a network round trip per request
 * to be told what the token already says. The refresh behaviour is unchanged —
 * `getClaims()` reads the session underneath, which is where refresh lives.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: no code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const user = userFromClaims(data?.claims);

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is so its refreshed auth cookies
  // reach the browser. Do not swap in a new NextResponse here.
  return supabaseResponse;
}
