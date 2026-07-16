import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

// The I/O shell around v_session_summary / session_sets / get_session_prs
// (ticket 016, supabase/migrations/0005_history.sql). Warmups are never
// filtered out of the set list here — CONTEXT.md: a warmup that silently
// vanished from history would read as a dropped set — only excluded from
// total_volume, which the view already computed working-sets-only
// (ADR-0004: aggregation lives in Postgres, not JS).

export type HistorySessionSummary = {
  id: string;
  workoutName: string | null; // null once the workout is deleted (ON DELETE SET NULL)
  completedAt: string;
  durationSeconds: number | null;
  totalVolumeKg: number;
  setCount: number;
};

// 150-ish sessions in a year (ticket 016's own estimate) — 20 keeps a page
// short enough for a one-handed scroll on a 390px screen.
export const HISTORY_PAGE_SIZE = 20;

/**
 * A page of completed sessions, newest first. Fetches one row beyond the
 * page size to detect whether another page exists, rather than a separate
 * `count` query — that extra row is trimmed off before returning.
 */
export async function getHistoryList(
  supabase: SupabaseClient<Database>,
  { offset }: { offset: number },
): Promise<{ sessions: HistorySessionSummary[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from("v_session_summary")
    .select(
      "session_id, workout_name, completed_at, duration_seconds, total_volume, set_count",
    )
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .range(offset, offset + HISTORY_PAGE_SIZE);

  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > HISTORY_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, HISTORY_PAGE_SIZE) : rows;

  return {
    hasMore,
    sessions: page.map((row) => ({
      id: row.session_id,
      workoutName: row.workout_name,
      completedAt: row.completed_at as string,
      durationSeconds: row.duration_seconds,
      totalVolumeKg: row.total_volume,
      setCount: row.set_count,
    })),
  };
}

export type HistorySetDetail = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  position: number;
  setNumber: number;
  weight: number;
  reps: number;
  isWarmup: boolean;
  targetRepMin: number | null;
  targetRepMax: number | null;
  isPr: boolean;
};

export type HistorySessionDetail = {
  id: string;
  workoutName: string | null;
  completedAt: string;
  durationSeconds: number | null;
  totalVolumeKg: number;
  sets: HistorySetDetail[];
};

/**
 * Everything /history/[id] needs: the session summary, every set (working
 * and warmup) with its exercise name and snapshotted rep range (ADR-0002),
 * and which sets are personal bests (get_session_prs). Returns null rather
 * than throwing when the session isn't found — RLS makes "doesn't exist" and
 * "belongs to someone else" indistinguishable, and both are a 404 to the
 * caller, not an error.
 */
export async function getSessionDetail(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<HistorySessionDetail | null> {
  const [summaryResult, setsResult, prResult] = await Promise.all([
    supabase
      .from("v_session_summary")
      .select(
        "session_id, workout_name, completed_at, duration_seconds, total_volume",
      )
      .eq("session_id", sessionId)
      .maybeSingle(),
    supabase
      .from("session_sets")
      .select(
        "id, exercise_id, position, set_number, weight, reps, is_warmup, target_rep_min, target_rep_max, exercise:exercises(name)",
      )
      .eq("session_id", sessionId)
      .order("position")
      .order("set_number"),
    supabase.rpc("get_session_prs", { p_session_id: sessionId }),
  ]);

  if (summaryResult.error) throw summaryResult.error;
  if (setsResult.error) throw setsResult.error;
  if (prResult.error) throw prResult.error;

  const summary = summaryResult.data;
  if (!summary) return null;

  const prSetIds = new Set(
    (prResult.data ?? []).map((row) => row.session_set_id),
  );

  return {
    id: summary.session_id,
    workoutName: summary.workout_name,
    completedAt: summary.completed_at as string,
    durationSeconds: summary.duration_seconds,
    totalVolumeKg: summary.total_volume,
    sets: (setsResult.data ?? []).map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise?.name ?? "",
      position: row.position,
      setNumber: row.set_number,
      weight: row.weight,
      reps: row.reps,
      isWarmup: row.is_warmup,
      targetRepMin: row.target_rep_min,
      targetRepMax: row.target_rep_max,
      isPr: prSetIds.has(row.id),
    })),
  };
}
