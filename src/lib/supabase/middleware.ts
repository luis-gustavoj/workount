import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths an unauthenticated visitor is allowed to reach. Everything else in the
 * app requires a session and is redirected to `/sign-in`.
 *
 * - `/sign-in` — the one-button Google sign-in screen (ADR-0003).
 * - `/auth` — the OAuth callback (`/auth/callback`) that exchanges the code for
 *   a session; it must be reachable while still signed out.
 */
const PUBLIC_PATHS = ["/sign-in", "/auth"];

/**
 * Whether an unauthenticated request to `pathname` is allowed through. A path
 * is public if it exactly equals a public path or sits under it (`/auth` also
 * covers `/auth/callback`). The trailing-slash boundary is deliberate: it stops
 * `/sign-in-later` from matching `/sign-in`.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * Refreshes the Supabase auth session on every request and guards protected
 * routes. Called from `src/middleware.ts`.
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
 * Do not insert logic between `createServerClient` and `getUser()`: `getUser`
 * is what actually revalidates the token, and anything racing it can desync the
 * session.
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

  // IMPORTANT: no code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: return supabaseResponse as-is so its refreshed auth cookies
  // reach the browser. Do not swap in a new NextResponse here.
  return supabaseResponse;
}
