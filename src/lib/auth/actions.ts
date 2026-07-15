"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign out and return to the sign-in screen. `signOut` clears the Supabase auth
 * cookies; the subsequent `/sign-in` load has no session, so the middleware
 * leaves it be (it's a public path) and the app is sealed again.
 *
 * A Server Action rather than a route handler so the sign-out control is a
 * progressively-enhanced `<form action={signOut}>` — it works without client JS
 * (CLAUDE.md: Server Actions for mutations). There is no input to validate.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
