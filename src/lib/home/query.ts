import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

import type { HomeWorkout } from "./resolve";

export type HomeSessionSummary = {
  id: string;
  workoutId: string | null;
  workoutName: string | null; // null once the workout is deleted (ON DELETE SET NULL)
  completedAt: string;
  durationSeconds: number | null;
};

export type HomeData = {
  activeProgramId: string | null;
  workouts: HomeWorkout[];
  // Completed sessions in the active program, most recent first — feeds
  // "today's" completion check, the streak, and the last-3-sessions list
  // (SPEC.md §4). 30 is generous headroom for a daily streak and a 3-item
  // list without an unbounded query.
  recentSessions: HomeSessionSummary[];
};

const RECENT_SESSIONS_LIMIT = 30;

/**
 * Everything the home screen needs from the server (ticket 015) besides the
 * draft, which lives client-side in IndexedDB (ADR-0001) and is read
 * separately. Returns the "no active program" shape rather than throwing —
 * that's a real state (SPEC.md §4), not an error.
 */
export async function getHomeData(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<HomeData> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_program_id")
    .eq("id", userId)
    .maybeSingle();

  const activeProgramId = profile?.active_program_id ?? null;
  if (!activeProgramId) {
    return { activeProgramId: null, workouts: [], recentSessions: [] };
  }

  const [{ data: workouts }, { data: sessions }] = await Promise.all([
    supabase
      .from("workouts")
      .select("id, name, day_of_week")
      .eq("program_id", activeProgramId)
      .order("position"),
    supabase
      .from("sessions")
      .select("id, workout_id, completed_at, duration_seconds, workout:workouts(name)")
      .eq("program_id", activeProgramId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(RECENT_SESSIONS_LIMIT),
  ]);

  return {
    activeProgramId,
    workouts: (workouts ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      dayOfWeek: w.day_of_week,
    })),
    recentSessions: (sessions ?? [])
      .filter((s) => s.completed_at !== null)
      .map((s) => ({
        id: s.id,
        workoutId: s.workout_id,
        workoutName: s.workout?.name ?? null,
        completedAt: s.completed_at as string,
        durationSeconds: s.duration_seconds,
      })),
  };
}
