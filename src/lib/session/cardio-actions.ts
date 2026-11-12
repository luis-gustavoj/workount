"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { logCardioSchema, toDistanceMeters, toDurationSeconds } from "@/lib/validation/cardio";

/**
 * Log a cardio session (ADR-0008): one completed session, no sets, written
 * through the same `commit_session` RPC as the player so there is still one
 * write path for sessions.
 *
 * Not offline-first like the strength player (ADR-0001): a cardio session is
 * logged after the fact, in one form, so there is no in-progress state to lose.
 * If the network is down the submit fails and the form is still there.
 */
export async function logCardio(formData: FormData) {
  const input = logCardioSchema.parse({
    id: formData.get("id"),
    workoutId: formData.get("workoutId"),
    durationMinutes: formData.get("durationMinutes"),
    distanceKm: formData.get("distanceKm"),
    rpe: formData.get("rpe"),
    notes: formData.get("notes"),
  });

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // RLS-scoped: a workout that isn't the caller's reads as not found.
  const { data: workout, error: lookupError } = await supabase
    .from("workouts")
    .select("id, program_id, kind")
    .eq("id", input.workoutId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!workout) throw new Error("Workout not found");
  if (workout.kind !== "cardio") throw new Error("Not a cardio workout");

  const durationSeconds = toDurationSeconds(input.durationMinutes);
  const completedAt = new Date();
  const startedAt = new Date(completedAt.getTime() - durationSeconds * 1000);

  const { error } = await supabase.rpc("commit_session", {
    p_payload: {
      id: input.id,
      user_id: user.id,
      program_id: workout.program_id,
      workout_id: workout.id,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_seconds: durationSeconds,
      notes: input.notes,
      kind: "cardio",
      distance_m: toDistanceMeters(input.distanceKm),
      rpe: input.rpe,
      sets: [],
    },
  });
  if (error) throw error;

  revalidatePath("/home");
  revalidatePath("/history");
  redirect(`/history/${input.id}`);
}
