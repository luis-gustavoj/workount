// Pure helpers for the superset grouping UI in the prescription editor
// (ticket 009). Kept side-effect-free so the workout builder can recompute
// them on every render from whatever `workout_exercises` it currently has —
// no derived state to keep in sync by hand.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type SupersetGrouped = { supersetGroup: string | null };

/**
 * A superset group with only one member is meaningless — there's no peer to
 * alternate with (ticket 009 sanity rule). Rather than silently dropping the
 * group the moment it's lonely (which would fight a user who's about to add
 * the second exercise), the builder warns instead; this is what it warns
 * about.
 */
export function lonelySupersetGroups<T extends SupersetGrouped>(
  items: readonly T[],
): Set<string> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.supersetGroup === null) continue;
    counts.set(item.supersetGroup, (counts.get(item.supersetGroup) ?? 0) + 1);
  }

  const lonely = new Set<string>();
  for (const [group, count] of counts) {
    if (count === 1) lonely.add(group);
  }
  return lonely;
}

/**
 * The superset groups selectable for a workout: every group already in use
 * (so a newly added exercise can join an existing pair) plus the next unused
 * letter (so the user can start a new one). Gaps are filled before the
 * alphabet is extended — dropping the workout's only "B" makes "B" offerable
 * again rather than jumping straight to "C".
 */
export function availableSupersetGroups<T extends SupersetGrouped>(
  items: readonly T[],
): string[] {
  const used = new Set(
    items.map((item) => item.supersetGroup).filter((group): group is string => group !== null),
  );
  const nextUnused = ALPHABET.find((letter) => !used.has(letter));
  if (nextUnused) used.add(nextUnused);

  return ALPHABET.filter((letter) => used.has(letter));
}

// DESIGN.md reserves colour (the `signal`) for live state only — active set,
// running timer, new PR — so telling two *different* superset groups apart
// can't reach for a per-group hue. This is the size of the achromatic cycle
// the left-edge accent rotates through instead (ink-muted, ink-faint); a
// third or later concurrent group repeats the cycle and leans on its "Group
// X" badge, same as it always could.
export const SUPERSET_ACCENT_CYCLE_LENGTH = 2;

/**
 * Which step of that accent cycle each in-use superset group is on, keyed by
 * group letter, ordered by first appearance in the list — so a workout with
 * two concurrent supersets (e.g. a lat raise/face pull pair *and* a curl/
 * pushdown pair) renders them with visibly different left-edge accents, not
 * the same bar disambiguated only by reading text (ticket 009: "must be
 * legible at a glance").
 */
export function supersetAccentIndexes<T extends SupersetGrouped>(
  items: readonly T[],
): Map<string, number> {
  const indexes = new Map<string, number>();
  for (const item of items) {
    if (item.supersetGroup === null || indexes.has(item.supersetGroup)) continue;
    indexes.set(item.supersetGroup, indexes.size % SUPERSET_ACCENT_CYCLE_LENGTH);
  }
  return indexes;
}
