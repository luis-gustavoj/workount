import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { signOut } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LOCALES } from "@/lib/i18n/locales";
import { setLocale } from "@/lib/settings/actions";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

/**
 * Settings. Hosts the account block and the language switcher (ticket 022);
 * later tickets add weight-unit, default rest, etc. beside them.
 *
 * The account block lives here rather than in a global header: identity and
 * sign-out are things you go *looking* for once in a while, and a persistent
 * top bar showing your own name back to you costs vertical space on every
 * screen to answer a question nobody asks mid-set.
 *
 * The switcher is a plain `<form action={setLocale}>` with one submit button per
 * locale — it works without client JS (CLAUDE.md: Server Actions for mutations),
 * and the active locale is known server-side from `getLocale()`, so no client
 * state is needed to highlight it.
 */
export default async function SettingsPage() {
  const t = await getTranslations("Settings");
  const tLocale = await getTranslations("Locale");
  const current = await getLocale();

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // The one screen that still reads the profile for display. `maybeSingle`
  // tolerates an absent row (repaired at sign-in) rather than erroring.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name ?? null;
  const avatarUrl = profile?.avatar_url ?? null;
  const label = displayName ?? user.email ?? t("account");

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-8 px-4 py-8">
      <h1 className="text-[1.375rem] leading-tight font-semibold">
        {t("title")}
      </h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">{t("account")}</h2>

        <div className="flex min-w-0 items-center gap-3">
          {avatarUrl ? (
            // A single remote Google avatar; not worth a next/image
            // remotePatterns entry.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              width={40}
              height={40}
              // Google's avatar CDN (lh3.googleusercontent.com) returns 403
              // when a cross-origin Referer is sent; without this the image
              // silently breaks, and the initials fallback only covers a null
              // avatar_url, not a failed load.
              referrerPolicy="no-referrer"
              className="border-line size-10 shrink-0 rounded-full border object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="bg-raised text-ink-muted grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium"
            >
              {label.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <span className="text-ink truncate text-sm font-medium">
              {label}
            </span>
            {displayName && user.email && (
              <span className="text-ink-muted truncate text-sm">
                {user.email}
              </span>
            )}
          </div>
        </div>

        <form action={signOut}>
          <Button type="submit" variant="outline">
            {t("signOut")}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">{t("language")}</h2>
          <p className="text-ink-muted mt-0.5 text-sm">
            {t("languageDescription")}
          </p>
        </div>

        <form action={setLocale} className="flex flex-wrap gap-2">
          {LOCALES.map((locale) => (
            <Button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              variant={locale === current ? "default" : "outline"}
              aria-pressed={locale === current}
            >
              {tLocale(locale)}
            </Button>
          ))}
        </form>
      </section>
    </main>
  );
}
