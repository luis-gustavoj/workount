import type { User } from "@supabase/supabase-js";

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
 */
export function profileFromUser(
  user: Pick<User, "id" | "user_metadata">,
): TablesInsert<"profiles"> {
  const meta = user.user_metadata ?? {};

  const str = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

  return {
    id: user.id,
    display_name: str(meta.full_name) ?? str(meta.name),
    avatar_url: str(meta.avatar_url) ?? str(meta.picture),
  };
}
