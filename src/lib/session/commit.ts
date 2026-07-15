import { del as idbDel } from "idb-keyval";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/types/database";

import { ACTIVE_DRAFT_KEY, type SessionDraft } from "./types";

// The finish flow (ticket 014). Turns a finished draft into the payload
// `commit_session` (supabase/migrations/0004_commit_session.sql) expects,
// commits it, and only clears the draft once the server has confirmed the
// write — see "the rule that must not be broken" in the ticket and
// docs/adr/0001-offline-first-session-player.md.

export type CommitSessionSetPayload = {
  exercise_id: string;
  workout_exercise_id: string | null;
  position: number;
  set_number: number;
  weight: number;
  reps: number;
  is_warmup: boolean;
  rpe: number | null;
  target_rep_min: number;
  target_rep_max: number;
  completed_at: string;
};

export type CommitSessionPayload = {
  id: string;
  user_id: string;
  program_id: string;
  workout_id: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  notes: string | null;
  sets: CommitSessionSetPayload[];
};

const commitSessionSetSchema = z.object({
  exercise_id: z.uuid(),
  workout_exercise_id: z.uuid().nullable(),
  position: z.number().int(),
  set_number: z.number().int().min(1),
  weight: z.number().min(0),
  reps: z.number().int().min(0),
  is_warmup: z.boolean(),
  rpe: z.number().min(1).max(10).nullable(),
  target_rep_min: z.number().int().min(1),
  target_rep_max: z.number().int(),
  completed_at: z.string().min(1),
});

// Zod at the boundary (CLAUDE.md). This RPC is called from the browser, not
// a Server Action — same rationale as start.ts's own boundary check:
// ADR-0001 requires the commit to happen client-side, so the payload still
// must not reach the database unvalidated.
export const commitSessionPayloadSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  program_id: z.uuid(),
  workout_id: z.uuid(),
  started_at: z.string().min(1),
  completed_at: z.string().min(1),
  duration_seconds: z.number().int().min(0),
  notes: z.string().nullable(),
  sets: z.array(commitSessionSetSchema),
});

/**
 * Assembles the `commit_session` payload from the in-memory draft. Pure —
 * `completedAt` is a parameter, not `new Date()` read internally — so it's
 * testable without a fake clock.
 *
 * Every session_sets row gets its exercise_id, target_rep_min/max, and
 * workout_exercise_id from the exercise it belongs to. This IS ADR-0002's
 * snapshot: those values have been sitting on the draft, untouched, since
 * `startSession` baked them in at session start — never re-read from
 * whatever the program looks like now.
 */
export function buildCommitPayload(
  draft: SessionDraft,
  userId: string,
  completedAt: Date,
): CommitSessionPayload {
  const sets: CommitSessionSetPayload[] = draft.exercises.flatMap((exercise) =>
    exercise.sets.map((s) => ({
      exercise_id: exercise.exerciseId,
      workout_exercise_id: exercise.workoutExerciseId,
      position: exercise.position,
      set_number: s.setNumber,
      weight: s.weight,
      reps: s.reps,
      is_warmup: s.isWarmup,
      rpe: s.rpe,
      target_rep_min: exercise.repMin,
      target_rep_max: exercise.repMax,
      completed_at: s.completedAt,
    })),
  );

  return {
    id: draft.id,
    user_id: userId,
    program_id: draft.programId,
    workout_id: draft.workoutId,
    started_at: draft.startedAt,
    completed_at: completedAt.toISOString(),
    duration_seconds: durationSeconds(draft.startedAt, completedAt),
    notes: null,
    sets,
  };
}

function durationSeconds(startedAt: string, completedAt: Date): number {
  return Math.max(0, Math.round((completedAt.getTime() - new Date(startedAt).getTime()) / 1000));
}

// Epley e1RM (docs/CONTEXT.md, "The measures"): weight × (1 + reps / 30).
function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export type FinishSummary = {
  durationSeconds: number;
  totalVolumeKg: number;
  setsCompleted: number;
  prExerciseNames: string[];
};

/**
 * The pre-commit summary shown on Finish (ticket 014, step 1): duration,
 * total volume, sets completed, and which exercises this session beat their
 * best e1RM from last time. Warmups never count (CLAUDE.md, CONTEXT.md) —
 * excluded from volume, the set count, and the PR check, everywhere, no
 * exceptions.
 *
 * The PR check here is a lightweight, fully-offline comparison against the
 * bundle's `lastPerformance` snapshot (best e1RM only) — not the full
 * three-kind PR system (`v_exercise_prs`, SPEC.md §3), which compares across
 * the whole program history server-side and belongs to the history screen
 * downstream of this ticket. An exercise performed for the first time ever
 * (empty `lastPerformance`) has nothing to compare against and is not
 * flagged — there's no "last time" to have beaten.
 */
export function buildFinishSummary(draft: SessionDraft, completedAt: Date): FinishSummary {
  let totalVolumeKg = 0;
  let setsCompleted = 0;
  const prExerciseNames: string[] = [];

  for (const exercise of draft.exercises) {
    const workingSets = exercise.sets.filter((s) => !s.isWarmup);
    if (workingSets.length === 0) continue;

    setsCompleted += workingSets.length;
    totalVolumeKg += workingSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

    if (exercise.lastPerformance.length === 0) continue;
    const bestThisSession = Math.max(...workingSets.map((s) => epley(s.weight, s.reps)));
    const bestLastTime = Math.max(...exercise.lastPerformance.map((s) => epley(s.weight, s.reps)));
    if (bestThisSession > bestLastTime) {
      prExerciseNames.push(exercise.exerciseName);
    }
  }

  return {
    durationSeconds: durationSeconds(draft.startedAt, completedAt),
    totalVolumeKg,
    setsCompleted,
    prExerciseNames,
  };
}

export type FinishResult = { ok: true; sessionId: string } | { ok: false; error: string };

/**
 * The finish flow (ticket 014, steps 2-4): commit through the only write
 * path, then — and only then — clear the draft.
 *
 * "The rule that must not be broken": the draft is deleted after the server
 * confirms the write. Not before, not optimistically, not in a `finally`.
 * `supabase.rpc` can fail two ways — resolve with `{ error }`, or reject
 * outright when there's no network at all (the gym-basement case,
 * ADR-0001) — both are caught here and treated identically: the draft is
 * left completely untouched, so the caller can show a retry banner and try
 * again with the same client-generated session id.
 */
export async function finishSession(
  supabase: SupabaseClient<Database>,
  draft: SessionDraft,
  userId: string,
  completedAt: Date = new Date(),
): Promise<FinishResult> {
  const payload = commitSessionPayloadSchema.parse(buildCommitPayload(draft, userId, completedAt));

  let sessionId: string;
  try {
    const { data, error } = await supabase.rpc("commit_session", { p_payload: payload });
    if (error) throw error;
    sessionId = data as string;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  await idbDel(ACTIVE_DRAFT_KEY);
  return { ok: true, sessionId };
}
