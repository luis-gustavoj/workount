/**
 * test-rls.ts — proves the row-level security policies in 0001_init.sql actually
 * isolate users. Run against a local Supabase stack (`supabase db reset` first):
 *
 *   npm run test:rls
 *
 * "An RLS policy you haven't tried to break is a policy you haven't tested"
 * (ticket 003). This script creates two users, has each build a full ownership
 * chain — profile, custom exercise, program → workout → workout_exercise, and a
 * session → session_set — then, acting as user A, asserts that A can read *zero*
 * of user B's rows in every table. It also checks the two things the policies get
 * subtly right: the global exercise catalog IS visible to everyone, while a set's
 * history is NOT (it gates through sessions, not through the exercise it points at).
 *
 * Exits non-zero on the first failed assertion, so `npm run test:rls` fails loudly.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// --- resolve local stack credentials -------------------------------------

type StackConfig = { url: string; anonKey: string; serviceRoleKey: string };

function fromStatus(): Partial<StackConfig> {
  // `supabase status -o json` prints the live keys for the local stack. Try the
  // bare CLI first, then fall back to npx for environments without a global install.
  const candidates: Array<[string, string[]]> = [
    ["supabase", ["status", "-o", "json"]],
    ["npx", ["--yes", "supabase", "status", "-o", "json"]],
  ];
  for (const [cmd, args] of candidates) {
    try {
      const out = execFileSync(cmd, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        shell: process.platform === "win32",
      });
      const json = JSON.parse(out) as Record<string, string>;
      return {
        url: json.API_URL,
        anonKey: json.ANON_KEY,
        serviceRoleKey: json.SERVICE_ROLE_KEY,
      };
    } catch {
      // try the next candidate
    }
  }
  return {};
}

function resolveConfig(): StackConfig {
  // Prefer the environment; only fall back to `supabase status` (a subprocess)
  // when something is actually missing, so the common CI path stays fast and quiet.
  let url = process.env.SUPABASE_URL;
  let anonKey = process.env.SUPABASE_ANON_KEY;
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    const status = fromStatus();
    url ??= status.url;
    anonKey ??= status.anonKey;
    serviceRoleKey ??= status.serviceRoleKey;
  }

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Could not resolve Supabase credentials. Start the local stack with " +
        "`supabase db reset` (or `supabase start`), or set SUPABASE_URL, " +
        "SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url, anonKey, serviceRoleKey };
}

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

/** Assert `column = value` returns zero rows for this (RLS-scoped) client. */
async function expectNoRows(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string,
  label: string,
): Promise<void> {
  const { data, error } = await client.from(table).select("id").eq(column, value);
  // A leak shows up as returned rows. An unexpected error is also a failure —
  // RLS denies by returning no rows, it does not raise on SELECT.
  check(!error && (data?.length ?? 0) === 0, `${label}: A reads 0 of B's ${table}`);
}

// --- the ownership chain each user builds --------------------------------

type Chain = {
  exerciseId: string;
  programId: string;
  workoutId: string;
  workoutExerciseId: string;
  sessionId: string;
  sessionSetId: string;
};

async function buildChain(
  client: SupabaseClient,
  userId: string,
  globalExerciseId: string,
): Promise<Chain> {
  // profile (id = auth.uid())
  const profile = await client
    .from("profiles")
    .insert({ id: userId, display_name: "RLS test" })
    .select("id")
    .single();
  if (profile.error) throw new Error(`profile insert: ${profile.error.message}`);

  // custom exercise (user_id = auth.uid())
  const exercise = await client
    .from("exercises")
    .insert({
      user_id: userId,
      name: `Custom ${randomUUID().slice(0, 8)}`,
      muscle_group: "chest",
      equipment: "barbell",
    })
    .select("id")
    .single();
  if (exercise.error) throw new Error(`exercise insert: ${exercise.error.message}`);

  const program = await client
    .from("programs")
    .insert({ user_id: userId, name: "PPL" })
    .select("id")
    .single();
  if (program.error) throw new Error(`program insert: ${program.error.message}`);

  const workout = await client
    .from("workouts")
    .insert({ program_id: program.data.id, name: "Push A", position: 0 })
    .select("id")
    .single();
  if (workout.error) throw new Error(`workout insert: ${workout.error.message}`);

  const workoutExercise = await client
    .from("workout_exercises")
    .insert({
      workout_id: workout.data.id,
      exercise_id: exercise.data.id,
      position: 0,
      target_sets: 3,
      rep_min: 8,
      rep_max: 10,
    })
    .select("id")
    .single();
  if (workoutExercise.error)
    throw new Error(`workout_exercise insert: ${workoutExercise.error.message}`);

  const sessionId = randomUUID(); // client-generated, per ADR-0001
  const session = await client
    .from("sessions")
    .insert({
      id: sessionId,
      user_id: userId,
      program_id: program.data.id,
      workout_id: workout.data.id,
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: 3000,
    })
    .select("id")
    .single();
  if (session.error) throw new Error(`session insert: ${session.error.message}`);

  // The set references the GLOBAL exercise on purpose. This is what makes the
  // session_sets isolation check actually exercise trap #1: a global exercise is
  // readable by everyone, so a policy that (wrongly) gated the set through its
  // exercise would leak it. Gating through sessions is what keeps it private.
  const sessionSet = await client
    .from("session_sets")
    .insert({
      session_id: sessionId,
      exercise_id: globalExerciseId,
      workout_exercise_id: workoutExercise.data.id,
      position: 0,
      set_number: 1,
      weight: 100,
      reps: 5,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (sessionSet.error) throw new Error(`session_set insert: ${sessionSet.error.message}`);

  return {
    exerciseId: exercise.data.id,
    programId: program.data.id,
    workoutId: workout.data.id,
    workoutExerciseId: workoutExercise.data.id,
    sessionId,
    sessionSetId: sessionSet.data.id,
  };
}

async function main(): Promise<void> {
  const { url, anonKey, serviceRoleKey } = resolveConfig();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = "rls-test-password-123";
  const emailA = `rls-a-${randomUUID()}@example.com`;
  const emailB = `rls-b-${randomUUID()}@example.com`;

  const createdUserIds: string[] = [];
  let globalExerciseId: string | undefined;

  try {
    // Two confirmed users, so signInWithPassword works without email confirmation.
    const a = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (a.error) throw new Error(`create user A: ${a.error.message}`);
    createdUserIds.push(a.data.user.id);

    const b = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (b.error) throw new Error(`create user B: ${b.error.message}`);
    createdUserIds.push(b.data.user.id);

    // A global exercise (user_id NULL) can only be inserted with the service role,
    // since the exercises_insert policy requires user_id = auth.uid().
    const global = await admin
      .from("exercises")
      .insert({
        user_id: null,
        name: `Global Bench ${randomUUID().slice(0, 8)}`,
        muscle_group: "chest",
        equipment: "barbell",
      })
      .select("id")
      .single();
    if (global.error) throw new Error(`global exercise insert: ${global.error.message}`);
    globalExerciseId = global.data.id;
    const globalExId: string = global.data.id; // definitely-set alias for the calls below

    // Per-user RLS-scoped clients.
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

    console.log("Building ownership chains…");
    const chainB = await buildChain(clientB, b.data.user.id, globalExId);
    const chainA = await buildChain(clientA, a.data.user.id, globalExId); // A's own — positive control below

    console.log("\nIsolation — A must read zero of B's rows:");
    await expectNoRows(clientA, "profiles", "id", b.data.user.id, "profiles");
    await expectNoRows(clientA, "exercises", "id", chainB.exerciseId, "exercises");
    await expectNoRows(clientA, "programs", "id", chainB.programId, "programs");
    await expectNoRows(clientA, "workouts", "id", chainB.workoutId, "workouts");
    await expectNoRows(
      clientA,
      "workout_exercises",
      "id",
      chainB.workoutExerciseId,
      "workout_exercises",
    );
    await expectNoRows(clientA, "sessions", "id", chainB.sessionId, "sessions");
    // The one that matters most (trap #1): the set gates through sessions, so even
    // though it points at an exercise, A cannot read B's training history.
    await expectNoRows(clientA, "session_sets", "id", chainB.sessionSetId, "session_sets");

    console.log("\nPositive controls — the policies are not just denying everything:");
    const ownProgram = await clientA
      .from("programs")
      .select("id")
      .eq("user_id", a.data.user.id);
    check(
      !ownProgram.error && (ownProgram.data?.length ?? 0) === 1,
      "A can read A's own program",
    );

    const globalForA = await clientA
      .from("exercises")
      .select("id")
      .eq("id", globalExerciseId);
    check(
      !globalForA.error && (globalForA.data?.length ?? 0) === 1,
      "A can read the global exercise catalog",
    );
    const globalForB = await clientB
      .from("exercises")
      .select("id")
      .eq("id", globalExerciseId);
    check(
      !globalForB.error && (globalForB.data?.length ?? 0) === 1,
      "B can read the global exercise catalog",
    );

    // Ticket 007 / ADR-0002: deleting a workout must not touch the sessions
    // performed from it. `sessions.workout_id` is ON DELETE SET NULL, not
    // CASCADE — this proves it at the database, as the caller (A, via her own
    // RLS-scoped client) would actually delete it, not just parse the DDL.
    console.log("\nWorkout delete invariant (ticket 007 / ADR-0002):");
    const beforeDelete = await clientA
      .from("sessions")
      .select("id, workout_id")
      .eq("id", chainA.sessionId)
      .single();
    check(
      !beforeDelete.error && beforeDelete.data?.workout_id === chainA.workoutId,
      "session references its workout before delete",
    );

    const deleteWorkout = await clientA
      .from("workouts")
      .delete()
      .eq("id", chainA.workoutId);
    check(!deleteWorkout.error, "A can delete her own workout");

    const afterDelete = await clientA
      .from("sessions")
      .select("id, workout_id")
      .eq("id", chainA.sessionId)
      .maybeSingle();
    check(
      !afterDelete.error && afterDelete.data !== null,
      "session survives the workout's deletion",
    );
    check(
      afterDelete.data?.workout_id === null,
      "session.workout_id is set to null, not cascaded away",
    );

    const sessionSetAfterDelete = await clientA
      .from("session_sets")
      .select("id")
      .eq("id", chainA.sessionSetId)
      .maybeSingle();
    check(
      !sessionSetAfterDelete.error && sessionSetAfterDelete.data !== null,
      "session_set survives the workout's deletion",
    );
  } finally {
    // Delete the test users; ON DELETE CASCADE removes every row they created,
    // so the script is repeatable. The global exercise has no owner, so remove it
    // explicitly with the service role.
    if (globalExerciseId) {
      await admin.from("exercises").delete().eq("id", globalExerciseId);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`RLS test FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("RLS test passed: user A sees zero of user B's rows, on every table.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
