import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { toExerciseOption, type ExerciseOption } from "@/lib/exercises/search";

/**
 * The exercise catalog visible to the caller: the global catalog plus their
 * own customs. No explicit user_id filter — RLS's `exercises_select` policy
 * (migration 0001) already scopes this to `user_id IS NULL OR user_id =
 * auth.uid()`.
 */
export async function listExercises(
  supabase: SupabaseClient<Database>,
): Promise<ExerciseOption[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name, muscle_group, equipment, user_id")
    .order("name");
  if (error) throw error;

  return (data ?? []).map(toExerciseOption);
}
