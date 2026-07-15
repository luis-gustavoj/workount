"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * The one button (ADR-0003). Starts the Google OAuth dance from the browser:
 * `signInWithOAuth` redirects the whole page to Google, so on success this
 * component never re-renders — Google comes back to `/auth/callback`, which
 * exchanges the code and sends the user to `/`.
 *
 * `redirectTo` is built from `window.location.origin` so the same code works on
 * localhost and in production without an env var; the origin must be registered
 * in Supabase's allowed redirect URLs (supabase/config.toml locally).
 */
export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser has already navigated to Google, so we only reach
    // here on a failure to *start* the flow (e.g. the provider isn't configured
    // — see the ticket 005 prerequisite). Re-enable the button so it's retryable.
    if (error) setPending(false);
  }

  return (
    <Button
      size="lg"
      className="h-11 w-full text-base"
      onClick={signIn}
      disabled={pending}
    >
      {pending ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}
