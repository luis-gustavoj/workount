"use server";

import { revalidatePath } from "next/cache";

import { isUniqueViolation } from "@/lib/exercises/errors";
import { toExerciseOption, type ExerciseOption } from "@/lib/exercises/search";
import { createClient } from "@/lib/supabase/server";
import { createCustomExerciseSchema } from "@/lib/validation/exercise";

export type CreateCustomExerciseResult =
  | { ok: true; exercise: ExerciseOption }
  | { ok: false; error: "duplicate" };

/**
 * Create a custom exercise, visible only to its creator (RLS
 * `exercises_insert` / `exercises_select`, migration 0001). Called directly
 * from the exercise picker as a plain async function — not bound to a
 * `<form action>` — so the caller gets the created row back and can select it
 * immediately without a page navigation (ticket 008).
 *
 * A same-name custom for this user trips the `(user_id, lower(name))` unique
 * index; that's caught and returned as a typed result rather than thrown, so
 * the picker can show a clean inline error instead of a 500 (ticket
 * acceptance). Any other insert failure is a real bug and still throws.
 */
export async function createCustomExercise(
  input: unknown,
): Promise<CreateCustomExerciseResult> {
  const { name, muscleGroup, equipment } = createCustomExerciseSchema.parse(input);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("exercises")
    .insert({ user_id: user.id, name, muscle_group: muscleGroup, equipment })
    .select("id, name, muscle_group, equipment, user_id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }

  // A new custom is scoped to the whole layout, not one program: it belongs
  // to the user, and every workout builder across every program shares the
  // same catalog, unlike a program/workout mutation which only ever affects
  // its own subtree.
  revalidatePath("/programs", "layout");

  return { ok: true, exercise: toExerciseOption(data) };
}
