import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

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
 * The shape `get_home_data` (0007) promises. The RPC's declared return type is
 * `Json`, so this is the boundary where that becomes a real type — parsed, not
 * cast. CLAUDE.md puts Zod at every boundary where unvalidated data would
 * otherwise reach the app; a jsonb document from a function is exactly that,
 * and a silently-renamed key would otherwise surface as `undefined` deep
 * inside the resolver rather than as an error here.
 */
const homeDataSchema = z.object({
  activeProgramId: z.uuid().nullable(),
  workouts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      dayOfWeek: z.number().int().min(0).max(6).nullable(),
      exerciseCount: z.number().int().nonnegative(),
    }),
  ),
  recentSessions: z.array(
    z.object({
      id: z.uuid(),
      workoutId: z.uuid().nullable(),
      workoutName: z.string().nullable(),
      completedAt: z.string(),
      durationSeconds: z.number().nullable(),
    }),
  ),
});

/**
 * Everything the home screen needs from the server (tickets 015, 024) besides
 * the draft, which lives client-side in IndexedDB (ADR-0001) and is read
 * separately.
 *
 * **One round trip.** This used to be a `profiles` query followed by workouts
 * and sessions — a waterfall, because both of those need
 * `active_program_id` before they can start. Two sequential round trips on the
 * landing screen. `get_home_data` (0007) does the whole thing in Postgres,
 * where the join is free, and returns the exercise counts Home now needs to
 * tell a startable workout from an empty one.
 *
 * Returns the "no active program" shape rather than throwing — that is a real
 * state (SPEC.md §4), not an error.
 */
export async function getHomeData(
  supabase: SupabaseClient<Database>,
): Promise<HomeData> {
  const { data, error } = await supabase.rpc("get_home_data", {
    p_recent_session_limit: RECENT_SESSIONS_LIMIT,
  });
  if (error) throw error;

  return homeDataSchema.parse(data);
}
