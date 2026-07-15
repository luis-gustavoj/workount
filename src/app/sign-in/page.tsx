import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

import { GoogleSignInButton } from "./google-sign-in-button";

// The whole app is behind auth (ADR-0003), and this is the one door. It is a
// public route (see isPublicPath), so an already-signed-in visitor who lands
// here is bounced straight to the app — no reason to show them a sign-in button.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  const t = await getTranslations("SignIn");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[400px] flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold">Workount</h1>
        <p className="text-ink-muted text-sm">{t("tagline")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <GoogleSignInButton />
        {error ? (
          // The callback bounces here with ?error=… when the OAuth exchange
          // fails. The most common cause is the provider not being configured
          // yet (ticket 005 prerequisite), which no amount of app code can fix —
          // so the copy points at retrying rather than implying a bug.
          <p role="alert" className="text-danger text-sm">
            {t("error")}
          </p>
        ) : null}
        <p className="text-ink-faint text-center text-xs">{t("passwordless")}</p>
      </div>
    </main>
  );
}
