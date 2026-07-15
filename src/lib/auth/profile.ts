import type { User } from "@supabase/supabase-js";

import { localeFromAcceptLanguage } from "@/lib/i18n/locales";
import type { TablesInsert } from "@/lib/types/database";

/**
 * Derive the `profiles` row to seed for a freshly-authenticated user from their
 * identity metadata.
 *
 * This is the app-side twin of the `handle_new_user` trigger (migration 0002),
 * and it exists for the self-heal path: the trigger is the normal way a profile
 * is born, but "triggers are the kind of thing that works in dev and surprises
 * you once" (ticket 005), so the (app) layout repairs a missing row on the next
 * request instead of crashing. Keep this derivation in lockstep with the SQL —
 * they must produce the same row.
 *
 * Google's OAuth identity payload lands in `user_metadata` (the client-side name
 * for `raw_user_meta_data`): the name in `full_name` (or `name`), the avatar in
 * `avatar_url` (or `picture`). Any may be absent — `display_name` and
 * `avatar_url` are both nullable. `default_rest_seconds` is deliberately left
 * off the payload so the column default of 90 applies (acceptance criterion).
 *
 * `locale` (ADR-0005 / ticket 022) is seeded from the request's `Accept-Language`
 * so a Portuguese-browser user gets a Portuguese profile from its very first
 * render. This is the self-heal counterpart to the OAuth callback's seed: the
 * `handle_new_user` trigger cannot read an HTTP header, so the header-derived
 * locale is applied wherever the app itself creates the row. Absent a header we
 * fall back to `'en'`, matching the column default.
 */
export function profileFromUser(
  user: Pick<User, "id" | "user_metadata">,
  acceptLanguage?: string | null,
): TablesInsert<"profiles"> {
  const meta = user.user_metadata ?? {};

  const str = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

  return {
    id: user.id,
    display_name: str(meta.full_name) ?? str(meta.name),
    avatar_url: str(meta.avatar_url) ?? str(meta.picture),
    locale: localeFromAcceptLanguage(acceptLanguage),
  };
}
