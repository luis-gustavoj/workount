// The i18n vocabulary, shared by the server (request config, OAuth callback,
// Server Actions) and the client (locale switcher). ADR-0005: locale is a
// *display* preference — it governs which message catalog and which Intl
// formats render, nothing about the domain. It is stored on `profiles.locale`
// (source of truth) and mirrored into a cookie so the root layout can resolve
// it without a per-render database read.

export const LOCALES = ["en", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

// The fallback when nothing else resolves. Mirrors the `profiles.locale` column
// default and its CHECK constraint (supabase/migrations/0001_init.sql).
export const DEFAULT_LOCALE: Locale = "en";

// The cookie the render path reads. Written on sign-in (OAuth callback) and on
// every explicit change (the setLocale Server Action), always from the profile
// value — so it is a fast mirror of the source of truth, never a second source.
export const LOCALE_COOKIE = "locale";

// Shared by the two sites that write the cookie (callback + setLocale action) so
// they can't drift. A year-long, lax, root-path cookie: it's a non-sensitive
// display preference, refreshed from the profile on every sign-in.
export const LOCALE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
} as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Coerce an arbitrary string (a cookie value, a stored `profiles.locale`) to a
 * known Locale, or `null` if it is not one. Callers decide the fallback, so a
 * corrupt cookie doesn't silently masquerade as English at every layer.
 */
export function asLocale(value: unknown): Locale | null {
  return isLocale(value) ? value : null;
}

/**
 * Resolve a locale from an `Accept-Language` header. ADR-0005 / ticket 022: map
 * any Portuguese tag (`pt`, `pt-BR`, `pt-PT`, …) to our single `pt-BR` catalog,
 * everything else to English. This is the *only* place the header decides a
 * locale — the pre-auth sign-in screen (no profile yet) and the first-sign-in
 * seed both route through here.
 *
 * The header is a comma-separated, q-weighted preference list
 * (`pt-BR,pt;q=0.9,en;q=0.8`); we honour the weights and pick the
 * highest-priority tag we can serve, so `en-US,pt;q=0.5` stays English.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(weight) ? 0 : weight };
    })
    .filter((entry) => entry.tag.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (tag === "pt" || tag.startsWith("pt-")) return "pt-BR";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }

  return DEFAULT_LOCALE;
}

/**
 * Whether a signed-in user's profile locale should be seeded from their
 * `Accept-Language` right now.
 *
 * The seeding has to happen app-side: the `handle_new_user` trigger that
 * creates the profile row is pure SQL and cannot see an HTTP header, so it
 * writes the column default (`'en'`). The OAuth callback — which *does* have the
 * header — corrects that on the first sign-in only, so a returning user who
 * deliberately chose English is never flipped back to Portuguese by their
 * browser. "First sign-in" is detected by the auth user's `created_at` being
 * within a short window of now: the profile was created microseconds ago by the
 * trigger inside the same auth.users insert.
 */
export function shouldSeedLocale(
  user: { created_at?: string | null | undefined },
  nowMs: number,
  windowMs = 60_000,
): boolean {
  if (!user.created_at) return false;
  const created = Date.parse(user.created_at);
  if (Number.isNaN(created)) return false;
  return Math.abs(nowMs - created) < windowMs;
}
