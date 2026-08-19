import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/types/database";

/**
 * Supabase client for React Server Components, Server Actions, and Route
 * Handlers. Reads and writes the auth session through Next's request `cookies()`
 * store, so it must be created per-request (never cached at module scope).
 *
 * Follows the current `@supabase/ssr` cookie contract: `getAll` / `setAll`, not
 * the deprecated `get` / `set` / `remove`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component, where the cookie
            // store is read-only. This is safe to ignore: the proxy
            // (`updateSession`) refreshes the session on every request, so the
            // refreshed cookies are still written there.
          }
        },
      },
    },
  );
}
