import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Supabase client for Client Components (the browser). `createBrowserClient`
 * is a singleton under the hood, so calling this repeatedly is cheap and
 * returns the same instance per browser context.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
