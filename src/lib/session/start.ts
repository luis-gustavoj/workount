import { set as idbSet } from "idb-keyval";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/types/database";
import { listWorkoutExercises } from "@/lib/workouts/queries";

import { buildSessionDraft } from "./draft";
import { ACTIVE_DRAFT_KEY, type SessionDraft } from "./types";

/**
 * Start a session (ticket 011, ADR-0001): fetch everything the player will
 * ever need in one go, write it to IndexedDB, and best-effort tell the server
 * a session is open. After this resolves, the rest of the session runs with
 * zero network calls — see docs/adr/0001-offline-first-session-player.md.
 *
 * The session `id` is generated here, client-side, before any network call.
 * That's what makes the eventual `commit_session` idempotent: a retried
 * finish-commit upserts on this same id instead of minting a duplicate.
 */
export async function startSession(
  supabase: SupabaseClient<Database>,
  workoutId: string,
): Promise<SessionDraft> {
  // Zod at the boundary (CLAUDE.md), even though this runs client-side rather
  // than as a Server Action — ADR-0001 requires the bundle fetch and the
  // best-effort `sessions` insert to happen from the browser (that's what
  // lets them share a call with the IndexedDB write and tolerate being
  // offline). workoutId still must not reach the database unchecked.
  z.uuid().parse(workoutId);

  const sessionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  // getUser() only feeds the sessions insert below (profiles is already
  // RLS-scoped to the caller, no user.id needed to query it) — batching it
  // alongside the bundle fetch keeps this the "one round trip" ADR-0001
  // promises instead of a blocking auth call ahead of it.
  const [userResult, workoutResult, prescriptions, profileResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("workouts").select("program_id").eq("id", workoutId).single(),
    listWorkoutExercises(supabase, workoutId),
    supabase.from("profiles").select("default_rest_seconds").single(),
  ]);

  const user = userResult.data.user;
  if (!user) throw new Error("Not authenticated");
  if (workoutResult.error) throw workoutResult.error;
  if (profileResult.error) throw profileResult.error;

  const programId = workoutResult.data.program_id;
  const defaultRestSeconds = profileResult.data.default_rest_seconds;

  // No point round-tripping for an empty exercise list — an empty workout is
  // a real (if unusual) state, not an error.
  const exerciseIds = prescriptions.map((p) => p.exerciseId);
  const lastPerformanceRows =
    exerciseIds.length === 0
      ? []
      : await (async () => {
          const { data, error } = await supabase.rpc("get_last_performance", {
            p_program_id: programId,
            p_exercise_ids: exerciseIds,
          });
          if (error) throw error;
          return data ?? [];
        })();

  const draft = buildSessionDraft({
    sessionId,
    programId,
    workoutId,
    startedAt,
    prescriptions,
    defaultRestSeconds,
    lastPerformanceRows,
  });

  await idbSet(ACTIVE_DRAFT_KEY, draft);

  // Best-effort only (ticket 011 / ADR-0001): this insert exists purely so
  // the server knows a session is open, which powers the forgot-to-finish
  // reminder (ticket 020). If it fails — already offline, flaky connection —
  // swallow the error and carry on. The finish commit upserts on this same
  // client-generated id, so the session is never lost; the draft above is
  // already durable regardless of what happens here.
  try {
    await supabase.from("sessions").insert({
      id: sessionId,
      user_id: user.id,
      program_id: programId,
      workout_id: workoutId,
      status: "active",
      started_at: startedAt,
    });
  } catch {
    // Offline or flaky — see comment above. Deliberately not rethrown.
  }

  return draft;
}
