import type { Tables } from "@/lib/types/database";
import type { Equipment, MuscleGroup } from "@/lib/validation/exercise";

// Client-side matching for the exercise picker (ticket 008). The catalog is
// small (~60 global rows plus a handful of customs per user) and is fetched
// once when the picker opens, so filtering happens here in JS rather than as
// a round trip per keystroke.

export type ExerciseRow = Pick<
  Tables<"exercises">,
  "id" | "name" | "muscle_group" | "equipment" | "user_id"
>;

export type ExerciseOption = {
  id: string;
  name: string;
  // Narrowed from the DB's plain `string` columns (CHECK-constrained,
  // migration 0001) to the enum types, so translation lookups
  // (t(exercise.muscleGroup)) type-check against the message catalog.
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  isCustom: boolean;
};

// user_id IS NULL means global (migration 0001); anything else is a custom
// owned by the caller — RLS already guarantees it's their own.
export function toExerciseOption(row: ExerciseRow): ExerciseOption {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group as MuscleGroup,
    equipment: row.equipment as Equipment,
    isCustom: row.user_id !== null,
  };
}

// Common gym shorthand for the equipment-prefixed naming convention (ticket
// 004: "Barbell Bench Press", never a bare "Bench Press"). Expanding these
// before matching lets "bb bench" find "Barbell Bench Press" the way a lifter
// would actually type it.
const EQUIPMENT_ABBREVIATIONS: Record<string, string> = {
  bb: "barbell",
  db: "dumbbell",
  kb: "kettlebell",
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function expandToken(token: string): string {
  return EQUIPMENT_ABBREVIATIONS[token] ?? token;
}

/**
 * Forgiving search (ticket 008, the "search must be forgiving" requirement):
 * case-insensitive substring first ("bench" -> "Barbell Bench Press"), falling
 * back to word-prefix matching so every query token has to prefix-match some
 * word in the name ("bb bench" -> "Barbell Bench Press" via the bb -> barbell
 * abbreviation).
 */
export function matchesQuery(name: string, query: string): boolean {
  const q = normalize(query);
  if (q.length === 0) return true;
  if (normalize(name).includes(q)) return true;

  const queryTokens = tokenize(query).map(expandToken);
  const nameWords = tokenize(name);
  return queryTokens.every((token) => nameWords.some((word) => word.startsWith(token)));
}

/**
 * Exercises a typed custom-exercise name is a likely near-duplicate of: every
 * token of `name` (post-abbreviation-expansion) prefix-matches a word in the
 * candidate. Ranked so the fewest-extra-words candidate comes first — typing
 * "Bench Press" ranks "Barbell Bench Press" (one extra word) ahead of
 * "Barbell Incline Bench Press" (two extra words).
 *
 * This is the "did you mean Barbell Bench Press?" nudge from the ticket: the
 * exercise is the identity key for all progress tracking, and a custom that
 * shadows an existing global silently splits the user's own progression
 * chart. An exact (case-insensitive) match is deliberately INCLUDED, not
 * filtered out: the database's unique index is scoped to `user_id`
 * (migration 0001), so a custom named identically to an existing *global*
 * exercise does not trip it and would otherwise sail through with no
 * warning at all — the one collision the ticket calls out as worst. It
 * naturally ranks first (zero extra words).
 */
export function findNearDuplicates<T extends { name: string }>(
  name: string,
  candidates: T[],
  limit = 3,
): T[] {
  const typedTokens = tokenize(name).map(expandToken);
  if (typedTokens.length === 0) return [];

  return candidates
    .map((candidate) => ({ candidate, words: tokenize(candidate.name) }))
    .filter(({ words }) =>
      typedTokens.every((token) => words.some((word) => word.startsWith(token))),
    )
    .sort((a, b) => a.words.length - b.words.length)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
