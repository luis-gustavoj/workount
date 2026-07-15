"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createProgramSchema,
  programIdSchema,
  updateProgramSchema,
} from "@/lib/validation/program";
import {
  createWorkoutSchema,
  deleteWorkoutSchema,
  reorderWorkoutsSchema,
  updateWorkoutSchema,
} from "@/lib/validation/workout";
import { createClient } from "@/lib/supabase/server";

// Server Actions for program CRUD and the "follow this program" flow (ticket
// 006). CLAUDE.md: every mutation is a Server Action, Zod-validated at the
// boundary. RLS (migration 0001) is the real access control — these actions
// scope by the authenticated user so a caller can only ever touch their own
// rows, and the policies fail the query closed if they somehow don't.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/**
 * Create a program and land the user on its (empty) detail page, where ticket
 * 007 will let them add workouts. `user_id` is stamped server-side from the
 * session, never trusted from the form.
 */
export async function createProgram(formData: FormData) {
  const { name, description } = createProgramSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
  });

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("programs")
    .insert({ user_id: user.id, name, description })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/programs");
  redirect(`/programs/${data.id}`);
}

/**
 * Rename a program or edit its description. The RLS `programs_all` policy scopes
 * the UPDATE to the owner, so `.eq("id", …)` on someone else's program simply
 * matches no rows — nothing to leak, nothing to guard here beyond that.
 */
export async function updateProgram(formData: FormData) {
  const { id, name, description } = updateProgramSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
  });

  const { supabase } = await requireUser();

  // Confirm a row was actually updated. RLS scopes the UPDATE to the owner, so a
  // non-owned or nonexistent id matches zero rows and returns no error — without
  // this check the action would report a false success (mirrors archiveProgram).
  const { data: updated, error } = await supabase
    .from("programs")
    .update({ name, description })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error("Program not found");

  revalidatePath("/programs");
  revalidatePath(`/programs/${id}`);
}

/**
 * Follow a program — set `profiles.active_program_id` (SPEC invariant 1:
 * exactly one active program). Writing a single column makes ">1 active"
 * unrepresentable; following B while following A silently replaces A, which is
 * correct (the UI warns about it before the click — see the detail page).
 *
 * The FK only checks that the target program *exists*, not that it belongs to
 * the caller, so we verify ownership + not-archived through an RLS-scoped SELECT
 * first. Without it a crafted request could point active_program_id at another
 * user's program id (readable to no one, but still wrong) or at an archived one.
 */
export async function followProgram(formData: FormData) {
  const { id } = programIdSchema.parse({ id: formData.get("id") });

  const { supabase, user } = await requireUser();

  // RLS-scoped: returns a row only if this program is the caller's own and live.
  const { data: program, error: lookupError } = await supabase
    .from("programs")
    .select("id")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!program) throw new Error("Program not found");

  const { error } = await supabase
    .from("profiles")
    .update({ active_program_id: id })
    .eq("id", user.id);
  if (error) throw error;

  revalidatePath("/", "layout");
}

/**
 * Archive a program: hide it from the list but keep its history (ticket 006).
 *
 * Archiving is not deleting, so the `active_program_id` FK's ON DELETE SET NULL
 * does not fire — we null it explicitly. Otherwise home keeps recommending
 * workouts from a program the user has put away (the ticket's second edge case).
 * The null-out is conditional on active_program_id = id, so archiving a
 * non-active program leaves the real active one untouched.
 */
export async function archiveProgram(formData: FormData) {
  const { id } = programIdSchema.parse({ id: formData.get("id") });

  const { supabase, user } = await requireUser();

  const { data: archived, error } = await supabase
    .from("programs")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!archived) throw new Error("Program not found");

  // Only clears active_program_id when the archived program *was* the active
  // one; the WHERE makes this a no-op otherwise.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ active_program_id: null })
    .eq("id", user.id)
    .eq("active_program_id", id);
  if (profileError) throw profileError;

  revalidatePath("/", "layout");
  redirect("/programs");
}

// Workout CRUD within a program (ticket 007). A workout is the PLAN — see
// CLAUDE.md and docs/CONTEXT.md — never to be confused with a session.

/**
 * Add a workout (a day) to a program, appended to the end of its order.
 *
 * INSERT can't fail closed the way an RLS-scoped UPDATE/DELETE does (a bad id
 * there just matches zero rows); a caller-supplied programId the user doesn't
 * own would instead surface as a raw Postgres RLS error. So, like
 * `followProgram`, this confirms ownership with an RLS-scoped SELECT first and
 * throws the same friendly "Program not found" the other actions use.
 */
export async function createWorkout(formData: FormData) {
  const { programId, name, dayOfWeek } = createWorkoutSchema.parse({
    programId: formData.get("programId"),
    name: formData.get("name"),
    dayOfWeek: formData.get("dayOfWeek"),
  });

  const { supabase } = await requireUser();

  const { data: program, error: lookupError } = await supabase
    .from("programs")
    .select("id")
    .eq("id", programId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!program) throw new Error("Program not found");

  const { data: maxRow } = await supabase
    .from("workouts")
    .select("position")
    .eq("program_id", programId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxRow?.position ?? -1) + 1;

  const { error } = await supabase.from("workouts").insert({
    program_id: programId,
    name,
    day_of_week: dayOfWeek,
    position,
  });
  if (error) throw error;

  revalidatePath(`/programs/${programId}`);
}

/** Rename a workout, or change its day of week (including to/from unscheduled). */
export async function updateWorkout(formData: FormData) {
  const { id, programId, name, dayOfWeek } = updateWorkoutSchema.parse({
    id: formData.get("id"),
    programId: formData.get("programId"),
    name: formData.get("name"),
    dayOfWeek: formData.get("dayOfWeek"),
  });

  const { supabase } = await requireUser();

  const { data: updated, error } = await supabase
    .from("workouts")
    .update({ name, day_of_week: dayOfWeek })
    .eq("id", id)
    .eq("program_id", programId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new Error("Workout not found");

  revalidatePath(`/programs/${programId}`);
  revalidatePath(`/programs/${programId}/workouts/${id}`);
}

/**
 * Delete a workout. `sessions.workout_id` is `ON DELETE SET NULL` (migration
 * 0001, ADR-0002) — a plain `.delete()` here is enough; there is no cascade to
 * guard against and no session data to touch. See workout-delete-invariant.test.ts.
 */
export async function deleteWorkout(formData: FormData) {
  const { id, programId } = deleteWorkoutSchema.parse({
    id: formData.get("id"),
    programId: formData.get("programId"),
  });

  const { supabase } = await requireUser();

  const { data: deleted, error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", id)
    .eq("program_id", programId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!deleted) throw new Error("Workout not found");

  revalidatePath(`/programs/${programId}`);
}

/**
 * Persist a drag-reorder as sequential `position` values. Called directly from
 * the client (not a `<form action>`) since a drag gesture has no submit event
 * to hang one on; the args are still Zod-validated at this boundary like every
 * other mutation.
 */
export async function reorderWorkouts(programId: string, ids: string[]) {
  const { programId: validProgramId, ids: validIds } =
    reorderWorkoutsSchema.parse({ programId, ids });

  const { supabase } = await requireUser();

  const updates = validIds.map((id, index) =>
    supabase
      .from("workouts")
      .update({ position: index })
      .eq("id", id)
      .eq("program_id", validProgramId),
  );

  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) throw error;
  }

  revalidatePath(`/programs/${validProgramId}`);
}
