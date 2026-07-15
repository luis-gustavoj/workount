import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import {
  asLocale,
  localeFromAcceptLanguage,
  LOCALE_COOKIE,
  type Locale,
} from "@/lib/i18n/locales";

/**
 * next-intl in "without i18n routing" mode (ADR-0005 decision 1): there is no
 * `[locale]` URL segment and no locale middleware rewrite, so *this* is where
 * the active locale is decided, once per request.
 *
 * Resolution order:
 *   1. The `locale` cookie — a fast mirror of `profiles.locale`, written on
 *      sign-in and on every explicit change (both from the profile value). This
 *      keeps the render path off the database: no `getUser()` + profile read on
 *      every server render.
 *   2. `Accept-Language` — the pre-auth surface (the sign-in screen, which has
 *      no profile and no cookie yet) and any request whose cookie is missing.
 *
 * The cookie is refreshed from the profile on every sign-in, so clearing it or
 * signing in on a new device re-syncs it to the stored preference next time.
 */
async function resolveLocale(): Promise<Locale> {
  const cookieLocale = asLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;

  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  return {
    locale,
    // Bundled at build time (ADR-0005): the whole catalog ships in the JS, so it
    // is available to the offline-first session player with zero network.
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
