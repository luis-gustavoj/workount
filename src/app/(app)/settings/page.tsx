import { getLocale, getTranslations } from "next-intl/server";

import { LOCALES } from "@/lib/i18n/locales";
import { setLocale } from "@/lib/settings/actions";
import { Button } from "@/components/ui/button";

/**
 * Settings. For now it hosts the language switcher (ticket 022); later tickets
 * add weight-unit, default rest, etc. beside it.
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

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-8 px-4 py-8">
      <h1 className="text-[1.375rem] leading-tight font-semibold">
        {t("title")}
      </h1>

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
