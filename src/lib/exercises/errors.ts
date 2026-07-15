type PostgresErrorLike = { code?: string | null } | null | undefined;

/**
 * Postgres' unique_violation code. Distinguishing this from any other insert
 * failure is what lets createCustomExercise reject a duplicate custom name
 * with a clean, expected error instead of surfacing a raw 500 (ticket 008
 * acceptance) — the unique index is
 * `exercises_user_lower_name_key` (migration 0001).
 */
export function isUniqueViolation(error: PostgresErrorLike): boolean {
  return error?.code === "23505";
}
