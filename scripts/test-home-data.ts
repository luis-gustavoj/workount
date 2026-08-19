/**
 * test-home-data.ts — behavioral proof of `get_home_data`
 * (supabase/migrations/0007_get_home_data.sql, ticket 024). Run against a
 * local Supabase stack (`supabase db reset` first):
 *
 *   npm run test:home-data
 *
 * What it proves, against Postgres rather than a mock:
 *   - one call returns the active program, its workouts and the recent
 *     completed sessions — the whole home screen in a single round trip;
 *   - `exerciseCount` is exact, and a workout with ZERO exercises still
 *     appears (the left join, not an inner one). That workout is the entire
 *     reason the count exists: Home must offer "Add exercises" rather than a
 *     Start that drops the user into an empty player;
 *   - workouts come back in `position` order and sessions newest-first, so the
 *     client never re-sorts;
 *   - only `completed` sessions appear — an active or abandoned session is
 *     invisible, exactly as the old query's `.eq("status","completed")` was;
 *   - a deleted workout leaves its sessions with a null `workoutId`/
 *     `workoutName` rather than dropping them (ON DELETE SET NULL, SPEC §2) —
 *     those sessions still count toward the streak;
 *   - `p_recent_session_limit` caps the session list;
 *   - a user with no active program gets nulls and empty arrays, never an
 *     error — "no program yet" is a real state (SPEC §4);
 *   - a second user sees *their own* data from the same call and nothing of
 *     the first user's — RLS via security_invoker, not an app-level check.
 *
 * Exits non-zero on the first failed assertion.
 */
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resolveConfig } from "./local-stack";

// --- tiny assertion helpers ----------------------------------------------

let failures = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${message}`);
  }
}

type HomeData = {
  activeProgramId: string | null;
  workouts: Array<{
    id: string;
    name: string;
    dayOfWeek: number | null;
    exerciseCount: number;
  }>;
  recentSessions: Array<{
    id: string;
    workoutId: string | null;
    workoutName: string | null;
    completedAt: string;
    durationSeconds: number | null;
  }>;
};

async function getHome(
  client: SupabaseClient,
  limit?: number,
): Promise<HomeData> {
  const { data, error } = await client.rpc(
    "get_home_data",
    limit === undefined ? {} : { p_recent_session_limit: limit },
  );
  if (error) throw new Error(`get_home_data: ${error.message}`);
  return data as HomeData;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const { url, anonKey, serviceRoleKey } = resolveConfig();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = "home-data-test-password-123";
  const emailA = `home-a-${randomUUID()}@example.com`;
  const emailB = `home-b-${randomUUID()}@example.com`;
  const createdUserIds: string[] = [];

  try {
    const a = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (a.error) throw new Error(`create user A: ${a.error.message}`);
    createdUserIds.push(a.data.user.id);
    const userIdA = a.data.user.id;

    const b = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (b.error) throw new Error(`create user B: ${b.error.message}`);
    createdUserIds.push(b.data.user.id);

    const clientA = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const clientB = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signInA = await clientA.auth.signInWithPassword({ email: emailA, password });
    if (signInA.error) throw new Error(`sign in A: ${signInA.error.message}`);
    const signInB = await clientB.auth.signInWithPassword({ email: emailB, password });
    if (signInB.error) throw new Error(`sign in B: ${signInB.error.message}`);

    // ------------------------------------------------------------------
    // 0. A user with no active program — checked BEFORE seeding, because
    //    this is the state a brand-new account is actually in.
    // ------------------------------------------------------------------
    console.log("\nno active program");
    const empty = await getHome(clientA);
    check(empty.activeProgramId === null, "activeProgramId is null");
    check(
      Array.isArray(empty.workouts) && empty.workouts.length === 0,
      "workouts is an empty array, not null",
    );
    check(
      Array.isArray(empty.recentSessions) && empty.recentSessions.length === 0,
      "recentSessions is an empty array, not null",
    );

    // ------------------------------------------------------------------
    // Seed: one program, three workouts (one deliberately empty), a handful
    // of sessions in known states.
    // ------------------------------------------------------------------
    console.log("\nSeeding…");
    const program = await clientA
      .from("programs")
      .insert({ user_id: userIdA, name: "Home Fixture" })
      .select("id")
      .single();
    if (program.error) throw new Error(`insert program: ${program.error.message}`);
    const programId = program.data.id as string;

    const workouts = await clientA
      .from("workouts")
      .insert([
        { program_id: programId, name: "Push A", day_of_week: 1, position: 0 },
        { program_id: programId, name: "Pull A", day_of_week: 3, position: 1 },
        // No exercises will be added to this one. It must still come back.
        { program_id: programId, name: "Empty Day", day_of_week: 5, position: 2 },
      ])
      .select("id, name, position");
    if (workouts.error) throw new Error(`insert workouts: ${workouts.error.message}`);
    const idOf = (name: string) =>
      (workouts.data.find((w) => w.name === name)?.id as string) ?? "";
    const pushId = idOf("Push A");
    const pullId = idOf("Pull A");

    const exercises = await clientA
      .from("exercises")
      .select("id")
      .is("user_id", null)
      .limit(3);
    if (exercises.error) throw new Error(`select exercises: ${exercises.error.message}`);
    const exerciseIds = exercises.data.map((e) => e.id as string);
    if (exerciseIds.length < 3) {
      throw new Error("expected at least 3 catalog exercises from the seed");
    }

    // Push A gets 3 exercises, Pull A gets 1, Empty Day gets none.
    const prescriptions = [
      ...exerciseIds.map((exerciseId, i) => ({
        workout_id: pushId,
        exercise_id: exerciseId,
        position: i,
        target_sets: 3,
        rep_min: 8,
        rep_max: 12,
      })),
      {
        workout_id: pullId,
        exercise_id: exerciseIds[0],
        position: 0,
        target_sets: 3,
        rep_min: 8,
        rep_max: 12,
      },
    ];
    const inserted = await clientA.from("workout_exercises").insert(prescriptions);
    if (inserted.error) {
      throw new Error(`insert workout_exercises: ${inserted.error.message}`);
    }

    const now = Date.now();
    const iso = (offsetDays: number) => new Date(now - offsetDays * DAY_MS).toISOString();

    // sessions.id has no DB default — it is client-generated, which is what
    // makes commit_session idempotent (SPEC §2). Supply one per row.
    const sessions = await clientA
      .from("sessions")
      .insert([
        {
          id: randomUUID(),
          user_id: userIdA,
          program_id: programId,
          workout_id: pushId,
          status: "completed",
          started_at: iso(3),
          completed_at: iso(3),
          duration_seconds: 3600,
        },
        {
          id: randomUUID(),
          user_id: userIdA,
          program_id: programId,
          workout_id: pullId,
          status: "completed",
          started_at: iso(1),
          completed_at: iso(1),
          duration_seconds: 2700,
        },
        // Neither of these may appear.
        {
          id: randomUUID(),
          user_id: userIdA,
          program_id: programId,
          workout_id: pushId,
          status: "active",
          started_at: iso(0),
        },
        {
          id: randomUUID(),
          user_id: userIdA,
          program_id: programId,
          workout_id: pushId,
          status: "abandoned",
          started_at: iso(5),
        },
      ])
      .select("id, status, completed_at");
    if (sessions.error) throw new Error(`insert sessions: ${sessions.error.message}`);

    const follow = await clientA
      .from("profiles")
      .update({ active_program_id: programId })
      .eq("id", userIdA);
    if (follow.error) throw new Error(`follow program: ${follow.error.message}`);

    // ------------------------------------------------------------------
    // 1. The whole screen, in one call.
    // ------------------------------------------------------------------
    console.log("\nget_home_data");
    const home = await getHome(clientA);

    check(home.activeProgramId === programId, "activeProgramId is the followed program");
    check(home.workouts.length === 3, `3 workouts (got ${home.workouts.length})`);
    check(
      home.workouts.map((w) => w.name).join(",") === "Push A,Pull A,Empty Day",
      "workouts come back in position order",
    );
    check(
      home.workouts.map((w) => w.dayOfWeek).join(",") === "1,3,5",
      "day_of_week survives as dayOfWeek",
    );

    // ------------------------------------------------------------------
    // 2. exerciseCount — the fact that decides Start vs "Add exercises".
    // ------------------------------------------------------------------
    console.log("\nexerciseCount");
    const countOf = (name: string) =>
      home.workouts.find((w) => w.name === name)?.exerciseCount;
    check(countOf("Push A") === 3, `Push A has 3 exercises (got ${countOf("Push A")})`);
    check(countOf("Pull A") === 1, `Pull A has 1 exercise (got ${countOf("Pull A")})`);
    // The whole point of the LEFT join. An inner join would silently drop this
    // workout, and Home would never learn it needs exercises.
    check(
      countOf("Empty Day") === 0,
      `Empty Day is present with exerciseCount 0 (got ${countOf("Empty Day")})`,
    );

    // ------------------------------------------------------------------
    // 3. Sessions: completed only, newest first.
    // ------------------------------------------------------------------
    console.log("\nrecentSessions");
    check(
      home.recentSessions.length === 2,
      `2 completed sessions, the active and abandoned ones excluded (got ${home.recentSessions.length})`,
    );
    check(
      home.recentSessions[0]?.workoutName === "Pull A",
      "newest completed session first",
    );
    check(
      home.recentSessions[1]?.workoutName === "Push A",
      "older completed session second",
    );
    check(
      home.recentSessions[0]?.durationSeconds === 2700,
      "duration_seconds survives as durationSeconds",
    );

    console.log("\np_recent_session_limit");
    const capped = await getHome(clientA, 1);
    check(capped.recentSessions.length === 1, "the limit caps the session list");
    check(
      capped.recentSessions[0]?.workoutName === "Pull A",
      "the limit keeps the newest, not an arbitrary one",
    );
    check(capped.workouts.length === 3, "the limit does not touch the workout list");

    // ------------------------------------------------------------------
    // 4. A deleted workout: SET NULL, not a vanished session.
    // ------------------------------------------------------------------
    console.log("\ndeleted workout");
    const del = await clientA.from("workouts").delete().eq("id", pullId);
    if (del.error) throw new Error(`delete workout: ${del.error.message}`);

    const afterDelete = await getHome(clientA);
    check(
      afterDelete.recentSessions.length === 2,
      "the session outlives its workout — it still counts toward the streak",
    );
    const orphan = afterDelete.recentSessions[0];
    check(orphan?.workoutId === null, "workoutId is null (ON DELETE SET NULL)");
    check(orphan?.workoutName === null, "workoutName is null, not a crash");
    check(afterDelete.workouts.length === 2, "the workout itself is gone from the list");

    // ------------------------------------------------------------------
    // 5. RLS: the same call, a different user, none of A's data.
    // ------------------------------------------------------------------
    console.log("\nRLS");
    const bHome = await getHome(clientB);
    check(bHome.activeProgramId === null, "B has no active program of their own");
    check(bHome.workouts.length === 0, "B sees none of A's workouts");
    check(bHome.recentSessions.length === 0, "B sees none of A's sessions");
  } finally {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`home-data test FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log(
    "home-data test passed: one round trip returns the whole screen, empty " +
      "workouts survive the join with exerciseCount 0, only completed sessions " +
      "appear, a deleted workout leaves its sessions intact, and RLS isolates " +
      "the call.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
