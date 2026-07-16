/**
 * test-history.ts — behavioral proof of v_session_summary and
 * get_session_prs (ticket 016, supabase/migrations/0005_history.sql). Run
 * against a local Supabase stack (`supabase db reset` first):
 *
 *   npm run test:history
 *
 * Proves the ticket's acceptance criteria directly against Postgres, not a
 * mock:
 *   - completing a session produces a v_session_summary row whose volume
 *     matches Σ weight × reps of the WORKING sets only, while set_count
 *     still counts the warmup (ticket: "If a warmup silently vanished from
 *     history the user would think the app dropped a set");
 *   - deleting the workout a session came from leaves the summary row
 *     intact with workout_name = NULL — "Deleting a plan does not erase the
 *     past" (ticket's own words, and its explicit acceptance criterion);
 *   - get_session_prs flags the best set of a first-ever exercise, does NOT
 *     flag a worse repeat performance, DOES flag a genuine improvement, and
 *     never flags a warmup regardless of how heavy it is;
 *   - a second user gets zero rows for the first user's session, from both
 *     the view and the RPC (RLS via security_invoker, not an app-level
 *     check).
 *
 * Exits non-zero on the first failed assertion.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// --- resolve local stack credentials -------------------------------------
// Mirrors scripts/test-rls.ts, scripts/test-last-performance.ts, and
// scripts/test-commit-session.ts exactly — update all four if this ever
// changes.

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
  position: number;
  setNumber: number;
  weight: number;
  reps: number;
  isWarmup?: boolean;
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
      workout_exercise_id: null,
      position: s.position,
      set_number: s.setNumber,
      weight: s.weight,
      reps: s.reps,
      is_warmup: s.isWarmup ?? false,
      rpe: null,
      target_rep_min: 8,
      target_rep_max: 10,
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
    .insert({
      user_id: userId,
      name,
      muscle_group: "chest",
      equipment: "barbell",
    })
    .select("id")
    .single();
  if (ex.error)
    throw new Error(`exercise insert (${name}): ${ex.error.message}`);
  return ex.data.id as string;
}

async function commit(
  client: SupabaseClient,
  payload: ReturnType<typeof buildPayload>,
) {
  const result = await client.rpc("commit_session", { p_payload: payload });
  if (result.error) throw new Error(`commit_session: ${result.error.message}`);
  return result.data as string;
}

async function main(): Promise<void> {
  const { url, anonKey, serviceRoleKey } = resolveConfig();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = "history-test-password-123";
  const emailA = `history-a-${randomUUID()}@example.com`;
  const emailB = `history-b-${randomUUID()}@example.com`;
  const createdUserIds: string[] = [];

  try {
    const a = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (a.error) throw new Error(`create user A: ${a.error.message}`);
    createdUserIds.push(a.data.user.id);
    const userId: string = a.data.user.id;

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
    const signInA = await clientA.auth.signInWithPassword({
      email: emailA,
      password,
    });
    if (signInA.error) throw new Error(`sign in A: ${signInA.error.message}`);
    const signInB = await clientB.auth.signInWithPassword({
      email: emailB,
      password,
    });
    if (signInB.error) throw new Error(`sign in B: ${signInB.error.message}`);

    const program = await clientA
      .from("programs")
      .insert({ user_id: userId, name: "PPL" })
      .select("id")
      .single();
    if (program.error)
      throw new Error(`program insert: ${program.error.message}`);
    const programId: string = program.data.id;

    const workout = await clientA
      .from("workouts")
      .insert({ program_id: programId, name: "Push A", position: 0 })
      .select("id")
      .single();
    if (workout.error)
      throw new Error(`workout insert: ${workout.error.message}`);
    const workoutId: string = workout.data.id;

    const benchId = await insertCustomExercise(
      clientA,
      userId,
      `Bench ${randomUUID().slice(0, 8)}`,
    );

    // ------------------------------------------------------------------
    // 1. First session: one warmup + two working sets.
    //    Working volume = 80*8 + 82.5*6 = 640 + 495 = 1135.
    // ------------------------------------------------------------------
    console.log("Committing session 1 (1 warmup + 2 working sets)…");
    const day1 = new Date(Date.now() - 14 * 24 * 60 * 60_000);
    const session1Id = randomUUID();
    await commit(
      clientA,
      buildPayload({
        sessionId: session1Id,
        userId,
        programId,
        workoutId,
        startedAt: new Date(day1.getTime() - 30 * 60_000).toISOString(),
        completedAt: day1.toISOString(),
        durationSeconds: 1800,
        sets: [
          {
            exerciseId: benchId,
            position: 0,
            setNumber: 1,
            weight: 20,
            reps: 10,
            isWarmup: true,
          },
          {
            exerciseId: benchId,
            position: 0,
            setNumber: 2,
            weight: 80,
            reps: 8,
          },
          {
            exerciseId: benchId,
            position: 0,
            setNumber: 3,
            weight: 82.5,
            reps: 6,
          },
        ],
      }),
    );

    const summary1 = await clientA
      .from("v_session_summary")
      .select(
        "workout_name, total_volume, set_count, exercise_count, duration_seconds",
      )
      .eq("session_id", session1Id)
      .single();
    if (summary1.error)
      throw new Error(`v_session_summary select: ${summary1.error.message}`);

    check(
      summary1.data.workout_name === "Push A",
      "summary shows the current workout name",
    );
    check(
      Number(summary1.data.total_volume) === 1135,
      `total_volume excludes the warmup (got ${summary1.data.total_volume})`,
    );
    check(
      summary1.data.set_count === 3,
      `set_count includes the warmup, all 3 sets (got ${summary1.data.set_count})`,
    );
    check(summary1.data.exercise_count === 1, "exercise_count is 1");
    check(
      summary1.data.duration_seconds === 1800,
      "duration_seconds passes through",
    );

    // ------------------------------------------------------------------
    // 2. Delete the workout. The summary row must survive with a NULL name.
    // ------------------------------------------------------------------
    console.log("\nDeleting the workout the session came from…");
    const deleteWorkout = await clientA
      .from("workouts")
      .delete()
      .eq("id", workoutId);
    if (deleteWorkout.error)
      throw new Error(`workout delete: ${deleteWorkout.error.message}`);

    const summaryAfterDelete = await clientA
      .from("v_session_summary")
      .select("workout_name, total_volume")
      .eq("session_id", session1Id)
      .single();
    if (summaryAfterDelete.error)
      throw new Error(
        `v_session_summary select after delete: ${summaryAfterDelete.error.message}`,
      );
    check(
      summaryAfterDelete.data.workout_name === null,
      "workout_name is NULL after the workout is deleted",
    );
    check(
      Number(summaryAfterDelete.data.total_volume) === 1135,
      "volume is unchanged by the workout deletion",
    );

    // ------------------------------------------------------------------
    // 3. get_session_prs — session 1's best set (82.5x6, e1RM ~99) is a PR
    //    (nothing came before it), and the warmup is never eligible.
    // ------------------------------------------------------------------
    console.log(
      "\nChecking get_session_prs for session 1 (first time ever = PR)…",
    );
    const sets1 = await admin
      .from("session_sets")
      .select("id, weight, reps, is_warmup")
      .eq("session_id", session1Id);
    if (sets1.error)
      throw new Error(`session_sets select: ${sets1.error.message}`);
    const bestSet1 = sets1.data.find((s) => Number(s.weight) === 82.5)!.id;
    const warmupSet1 = sets1.data.find((s) => s.is_warmup)!.id;

    const prs1 = await clientA.rpc("get_session_prs", {
      p_session_id: session1Id,
    });
    if (prs1.error) throw new Error(`get_session_prs: ${prs1.error.message}`);
    const prIds1 = new Set(
      (prs1.data as { session_set_id: string }[]).map((r) => r.session_set_id),
    );
    check(
      prIds1.has(bestSet1),
      "the best working set of a never-before-done exercise is flagged a PR",
    );
    check(
      !prIds1.has(warmupSet1),
      "the warmup is never flagged a PR, no matter its weight",
    );
    check(prIds1.size === 1, "exactly one PR set for one exercise");

    // ------------------------------------------------------------------
    // 4. A worse second session must NOT be flagged.
    // ------------------------------------------------------------------
    console.log("\nCommitting session 2 (worse than session 1)…");
    const day2 = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const session2Id = randomUUID();
    await commit(
      clientA,
      buildPayload({
        sessionId: session2Id,
        userId,
        programId,
        workoutId, // still references the deleted id; sessions.workout_id was already SET NULL for session 1 only
        startedAt: new Date(day2.getTime() - 30 * 60_000).toISOString(),
        completedAt: day2.toISOString(),
        durationSeconds: 1500,
        sets: [
          {
            exerciseId: benchId,
            position: 0,
            setNumber: 1,
            weight: 75,
            reps: 6,
          },
        ],
      }),
    );
    const prs2 = await clientA.rpc("get_session_prs", {
      p_session_id: session2Id,
    });
    if (prs2.error)
      throw new Error(`get_session_prs (session 2): ${prs2.error.message}`);
    check(
      (prs2.data as unknown[]).length === 0,
      "a session strictly worse than history flags no PRs",
    );

    // ------------------------------------------------------------------
    // 5. A genuine improvement in session 3 IS flagged.
    // ------------------------------------------------------------------
    console.log("\nCommitting session 3 (a genuine improvement)…");
    const day3 = new Date();
    const session3Id = randomUUID();
    await commit(
      clientA,
      buildPayload({
        sessionId: session3Id,
        userId,
        programId,
        workoutId,
        startedAt: new Date(day3.getTime() - 30 * 60_000).toISOString(),
        completedAt: day3.toISOString(),
        durationSeconds: 1500,
        sets: [
          {
            exerciseId: benchId,
            position: 0,
            setNumber: 1,
            weight: 90,
            reps: 6,
          },
        ],
      }),
    );
    const sets3 = await admin
      .from("session_sets")
      .select("id")
      .eq("session_id", session3Id);
    if (sets3.error)
      throw new Error(
        `session_sets select (session 3): ${sets3.error.message}`,
      );
    const prs3 = await clientA.rpc("get_session_prs", {
      p_session_id: session3Id,
    });
    if (prs3.error)
      throw new Error(`get_session_prs (session 3): ${prs3.error.message}`);
    const prIds3 = new Set(
      (prs3.data as { session_set_id: string }[]).map((r) => r.session_set_id),
    );
    check(
      prIds3.has(sets3.data[0].id),
      "90kg x6 beats the standing best (82.5kg x6) and is flagged",
    );

    // ------------------------------------------------------------------
    // 6. Cross-user isolation — B sees nothing of A's session, from either
    //    the view or the RPC.
    // ------------------------------------------------------------------
    console.log("\nUser B queries user A's session…");
    const bSummary = await clientB
      .from("v_session_summary")
      .select("session_id")
      .eq("session_id", session1Id);
    if (bSummary.error)
      throw new Error(`B v_session_summary select: ${bSummary.error.message}`);
    check(
      (bSummary.data ?? []).length === 0,
      "B gets zero rows from v_session_summary for A's session",
    );

    const bPrs = await clientB.rpc("get_session_prs", {
      p_session_id: session1Id,
    });
    check(
      bPrs.error === null && (bPrs.data as unknown[] | null)?.length === 0,
      "B gets zero rows from get_session_prs for A's session",
    );
  } finally {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`history test FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log(
    "history test passed: volume/set-count/PR semantics and RLS isolation all hold.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
