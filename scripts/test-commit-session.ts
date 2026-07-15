/**
 * test-commit-session.ts — behavioral proof of `commit_session` (ticket 014,
 * supabase/migrations/0004_commit_session.sql). Run against a local
 * Supabase stack (`supabase db reset` first):
 *
 *   npm run test:commit-session
 *
 * Proves the ticket's acceptance criteria directly against Postgres, not a
 * mock:
 *   - a finished session produces exactly one `sessions` row (completed)
 *     and N `session_sets` rows;
 *   - calling `commit_session` TWICE with the identical payload still
 *     produces exactly one session and N sets (idempotency, via upsert on
 *     the client-generated id + delete-then-reinsert of the sets);
 *   - a payload with a bad set row (weight < 0, violating the CHECK
 *     constraint) writes NOTHING — no orphan session row, no sets
 *     (atomicity: the whole call is one transaction);
 *   - sets carry the snapshotted rep range and denormalized exercise_id
 *     (ADR-0002), and editing/deleting the program afterwards does not
 *     change them;
 *   - a payload whose user_id isn't the caller's own is rejected.
 *
 * Exits non-zero on the first failed assertion, so `npm run
 * test:commit-session` fails loudly.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// --- resolve local stack credentials -------------------------------------
// Mirrors scripts/test-rls.ts and scripts/test-last-performance.ts exactly —
// update all three if this ever changes.

type StackConfig = { url: string; anonKey: string; serviceRoleKey: string };

function fromStatus(): Partial<StackConfig> {
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

// --- fixture builders ------------------------------------------------------

type SetInput = {
  exerciseId: string;
  workoutExerciseId?: string | null;
  position: number;
  setNumber: number;
  weight: number;
  reps: number;
  isWarmup?: boolean;
  rpe?: number | null;
  targetRepMin?: number | null;
  targetRepMax?: number | null;
  completedAt?: string;
};

function buildPayload(input: {
  sessionId: string;
  userId: string;
  programId: string;
  workoutId: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  sets: SetInput[];
}) {
  return {
    id: input.sessionId,
    user_id: input.userId,
    program_id: input.programId,
    workout_id: input.workoutId,
    started_at: input.startedAt,
    completed_at: input.completedAt,
    duration_seconds: input.durationSeconds,
    notes: null,
    sets: input.sets.map((s) => ({
      exercise_id: s.exerciseId,
      workout_exercise_id: s.workoutExerciseId ?? null,
      position: s.position,
      set_number: s.setNumber,
      weight: s.weight,
      reps: s.reps,
      is_warmup: s.isWarmup ?? false,
      rpe: s.rpe ?? null,
      target_rep_min: s.targetRepMin ?? null,
      target_rep_max: s.targetRepMax ?? null,
      completed_at: s.completedAt ?? input.completedAt,
    })),
  };
}

async function insertCustomExercise(
  client: SupabaseClient,
  userId: string,
  name: string,
): Promise<string> {
  const ex = await client
    .from("exercises")
    .insert({ user_id: userId, name, muscle_group: "chest", equipment: "barbell" })
    .select("id")
    .single();
  if (ex.error) throw new Error(`exercise insert (${name}): ${ex.error.message}`);
  return ex.data.id as string;
}

async function main(): Promise<void> {
  const { url, anonKey, serviceRoleKey } = resolveConfig();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = "commit-session-test-password-123";
  const emailA = `commit-session-a-${randomUUID()}@example.com`;
  const emailB = `commit-session-b-${randomUUID()}@example.com`;

  const createdUserIds: string[] = [];

  try {
    const a = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (a.error) throw new Error(`create user A: ${a.error.message}`);
    createdUserIds.push(a.data.user.id);
    const userId: string = a.data.user.id;

    const b = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
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

    const program = await clientA
      .from("programs")
      .insert({ user_id: userId, name: "PPL" })
      .select("id")
      .single();
    if (program.error) throw new Error(`program insert: ${program.error.message}`);
    const programId: string = program.data.id;

    const workout = await clientA
      .from("workouts")
      .insert({ program_id: programId, name: "Push A", position: 0 })
      .select("id")
      .single();
    if (workout.error) throw new Error(`workout insert: ${workout.error.message}`);
    const workoutId: string = workout.data.id;

    const benchId = await insertCustomExercise(clientA, userId, `Bench ${randomUUID().slice(0, 8)}`);

    const workoutExercise = await clientA
      .from("workout_exercises")
      .insert({
        workout_id: workoutId,
        exercise_id: benchId,
        position: 0,
        target_sets: 3,
        rep_min: 8,
        rep_max: 10,
      })
      .select("id")
      .single();
    if (workoutExercise.error)
      throw new Error(`workout_exercise insert: ${workoutExercise.error.message}`);
    const workoutExerciseId: string = workoutExercise.data.id;

    // ------------------------------------------------------------------
    // 1. Finish a session -> exactly one sessions row, N session_sets rows.
    // ------------------------------------------------------------------
    console.log("Committing a finished session (3 sets)…");
    const sessionId = randomUUID(); // client-generated, per ADR-0001
    const startedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const completedAt = new Date().toISOString();

    const payload = buildPayload({
      sessionId,
      userId,
      programId,
      workoutId,
      startedAt,
      completedAt,
      durationSeconds: 1800,
      sets: [
        {
          exerciseId: benchId,
          workoutExerciseId,
          position: 0,
          setNumber: 1,
          weight: 20,
          reps: 10,
          isWarmup: true,
          targetRepMin: 8,
          targetRepMax: 10,
        },
        {
          exerciseId: benchId,
          workoutExerciseId,
          position: 0,
          setNumber: 2,
          weight: 80,
          reps: 8,
          targetRepMin: 8,
          targetRepMax: 10,
        },
        {
          exerciseId: benchId,
          workoutExerciseId,
          position: 0,
          setNumber: 3,
          weight: 80,
          reps: 8,
          targetRepMin: 8,
          targetRepMax: 10,
        },
      ],
    });

    const firstCommit = await clientA.rpc("commit_session", { p_payload: payload });
    if (firstCommit.error) throw new Error(`commit_session: ${firstCommit.error.message}`);
    check(firstCommit.data === sessionId, "commit_session returns the session id");

    const sessionAfterFirst = await admin
      .from("sessions")
      .select("id, status, completed_at, duration_seconds")
      .eq("id", sessionId);
    check(
      sessionAfterFirst.data?.length === 1 && sessionAfterFirst.data[0].status === "completed",
      "exactly one sessions row, status completed",
    );

    const setsAfterFirst = await admin.from("session_sets").select("id").eq("session_id", sessionId);
    check((setsAfterFirst.data?.length ?? 0) === 3, "exactly 3 session_sets rows after first commit");

    // ------------------------------------------------------------------
    // 2. Idempotency — call it again with the identical payload.
    // ------------------------------------------------------------------
    console.log("\nCommitting the SAME payload a second time (retry after a lost response)…");
    const secondCommit = await clientA.rpc("commit_session", { p_payload: payload });
    if (secondCommit.error) throw new Error(`commit_session (retry): ${secondCommit.error.message}`);

    const sessionsAfterRetry = await admin.from("sessions").select("id").eq("id", sessionId);
    check((sessionsAfterRetry.data?.length ?? 0) === 1, "still exactly one sessions row after retry");

    const setsAfterRetry = await admin.from("session_sets").select("id").eq("session_id", sessionId);
    check((setsAfterRetry.data?.length ?? 0) === 3, "still exactly 3 session_sets rows after retry");

    // ------------------------------------------------------------------
    // 3. Atomicity — a bad set row must roll back the WHOLE commit.
    // ------------------------------------------------------------------
    console.log("\nForcing a mid-transaction failure (a set with weight < 0)…");
    const badSessionId = randomUUID();
    const badPayload = buildPayload({
      sessionId: badSessionId,
      userId,
      programId,
      workoutId,
      startedAt,
      completedAt,
      durationSeconds: 1800,
      sets: [
        { exerciseId: benchId, position: 0, setNumber: 1, weight: 80, reps: 8 },
        { exerciseId: benchId, position: 0, setNumber: 2, weight: -1, reps: 8 }, // violates CHECK (weight >= 0)
      ],
    });
    const badCommit = await clientA.rpc("commit_session", { p_payload: badPayload });
    check(badCommit.error !== null, "a bad set row makes commit_session return an error");

    const orphanSession = await admin.from("sessions").select("id").eq("id", badSessionId);
    check((orphanSession.data?.length ?? 0) === 0, "no orphan sessions row from the failed commit");
    const orphanSets = await admin
      .from("session_sets")
      .select("id")
      .eq("session_id", badSessionId);
    check((orphanSets.data?.length ?? 0) === 0, "no session_sets rows from the failed commit either");

    // ------------------------------------------------------------------
    // 4. ADR-0002 — sets carry the snapshot, and program edits don't touch it.
    // ------------------------------------------------------------------
    console.log("\nEditing the program (bench 3x8 -> 4x6) and deleting the workout_exercise…");
    const beforeEdit = await admin
      .from("session_sets")
      .select("exercise_id, target_rep_min, target_rep_max")
      .eq("session_id", sessionId)
      .order("set_number");
    check(
      (beforeEdit.data ?? []).every((s) => s.exercise_id === benchId && s.target_rep_min === 8 && s.target_rep_max === 10),
      "sets carry the snapshotted rep range and denormalized exercise_id",
    );

    const editRep = await clientA
      .from("workout_exercises")
      .update({ target_sets: 4, rep_min: 6, rep_max: 6 })
      .eq("id", workoutExerciseId);
    if (editRep.error) throw new Error(`workout_exercise update: ${editRep.error.message}`);

    const deleteWE = await clientA.from("workout_exercises").delete().eq("id", workoutExerciseId);
    if (deleteWE.error) throw new Error(`workout_exercise delete: ${deleteWE.error.message}`);

    const afterEdit = await admin
      .from("session_sets")
      .select("exercise_id, target_rep_min, target_rep_max, workout_exercise_id")
      .eq("session_id", sessionId)
      .order("set_number");
    check(
      (afterEdit.data ?? []).every((s) => s.exercise_id === benchId && s.target_rep_min === 8 && s.target_rep_max === 10),
      "reopening the session after the program changed: rep range is UNCHANGED (still 8-10, not 6-6)",
    );
    check(
      (afterEdit.data ?? []).every((s) => s.workout_exercise_id === null),
      "workout_exercise_id goes null on delete (convenience link only) without touching the snapshot",
    );

    // ------------------------------------------------------------------
    // 5. Reject a payload whose user_id isn't the caller's own.
    // ------------------------------------------------------------------
    console.log("\nB attempts to commit a session claiming to be A:");
    const forgedSessionId = randomUUID();
    const forgedPayload = buildPayload({
      sessionId: forgedSessionId,
      userId, // A's id, but called by B
      programId,
      workoutId,
      startedAt,
      completedAt,
      durationSeconds: 600,
      sets: [{ exerciseId: benchId, position: 0, setNumber: 1, weight: 40, reps: 10 }],
    });
    const forgedCommit = await clientB.rpc("commit_session", { p_payload: forgedPayload });
    check(forgedCommit.error !== null, "commit_session rejects a payload whose user_id isn't auth.uid()");

    const forgedSession = await admin.from("sessions").select("id").eq("id", forgedSessionId);
    check((forgedSession.data?.length ?? 0) === 0, "nothing was written for the forged payload");
  } finally {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`commit_session test FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("commit_session test passed: atomic, idempotent, and snapshot-safe.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
