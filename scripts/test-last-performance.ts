/**
 * test-last-performance.ts — behavioral proof of get_last_performance (ticket
 * 010, supabase/migrations/0003_get_last_performance.sql). Run against a
 * local Supabase stack (`supabase db reset` first):
 *
 *   npm run test:last-performance
 *
 * This is the ticket's whole point, executed for real: "the last time you
 * did THIS EXERCISE, not the last session." Seeds four completed sessions in
 * one program — week 1 (bench + squat + press, plus a bench warmup), week 2
 * (squat only, set_number inserted out of order), week 2.5 (press warmed up
 * but never worked), week 3 (completed, but empty) — and proves bench's
 * reference comes from week 1 while squat's comes from week 2, even though
 * week 3 is the most recent session and contains neither. A naive "single
 * latest session" implementation returns nothing for both, because week 3
 * has no sets at all.
 *
 * Also proves: warmup sets never surface, a warmup-only session (week 2.5)
 * doesn't count as a performance and so can't shadow a real one further back
 * (press's reference still comes from week 1, not week 2.5's empty-of-working-
 * sets result), sets come back in set_number order even when inserted out of
 * order, an exercise never performed returns no rows, and another user's
 * program_id returns zero rows (via SECURITY INVOKER + RLS, not an explicit
 * ownership check).
 *
 * Exits non-zero on the first failed assertion, so `npm run test:last-performance`
 * fails loudly.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// --- resolve local stack credentials -------------------------------------
// Mirrors scripts/test-rls.ts exactly — update both if this ever changes.

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
// get_last_performance only ever touches sessions, session_sets, and (via
// p_exercise_ids) exercises — no profile or workout is needed to exercise it.

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

type SetInput = {
  exerciseId: string;
  setNumber: number;
  weight: number;
  reps: number;
  isWarmup?: boolean;
};

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

/** Inserts a completed session with the given sets, in the array's own order —
 * callers deliberately scramble set_number to prove the RPC re-sorts rather
 * than trusting insertion order. */
async function insertCompletedSession(
  client: SupabaseClient,
  userId: string,
  programId: string,
  completedAt: string,
  sets: SetInput[],
): Promise<string> {
  const sessionId = randomUUID();
  const session = await client
    .from("sessions")
    .insert({
      id: sessionId,
      user_id: userId,
      program_id: programId,
      status: "completed",
      started_at: completedAt,
      completed_at: completedAt,
      duration_seconds: 1800,
    })
    .select("id")
    .single();
  if (session.error) throw new Error(`session insert: ${session.error.message}`);

  for (const [i, s] of sets.entries()) {
    const row = await client.from("session_sets").insert({
      session_id: sessionId,
      exercise_id: s.exerciseId,
      position: i,
      set_number: s.setNumber,
      weight: s.weight,
      reps: s.reps,
      is_warmup: s.isWarmup ?? false,
      completed_at: completedAt,
    });
    if (row.error) throw new Error(`session_set insert: ${row.error.message}`);
  }

  return sessionId;
}

type LastPerformanceRow = {
  exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  performed_at: string;
};

async function main(): Promise<void> {
  const { url, anonKey, serviceRoleKey } = resolveConfig();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = "last-performance-test-password-123";
  const emailA = `last-perf-a-${randomUUID()}@example.com`;
  const emailB = `last-perf-b-${randomUUID()}@example.com`;

  const createdUserIds: string[] = [];

  try {
    const a = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    if (a.error) throw new Error(`create user A: ${a.error.message}`);
    createdUserIds.push(a.data.user.id);

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
      .insert({ user_id: a.data.user.id, name: "PPL" })
      .select("id")
      .single();
    if (program.error) throw new Error(`program insert: ${program.error.message}`);
    const programId: string = program.data.id;

    const benchId = await insertCustomExercise(clientA, a.data.user.id, `Bench ${randomUUID().slice(0, 8)}`);
    const squatId = await insertCustomExercise(clientA, a.data.user.id, `Squat ${randomUUID().slice(0, 8)}`);
    const pressId = await insertCustomExercise(
      clientA,
      a.data.user.id,
      `Overhead Press ${randomUUID().slice(0, 8)}`,
    );
    const neverDoneId = await insertCustomExercise(
      clientA,
      a.data.user.id,
      `Never Done ${randomUUID().slice(0, 8)}`,
    );

    console.log("Seeding week 1 (bench + squat + press, plus a bench warmup)…");
    await insertCompletedSession(clientA, a.data.user.id, programId, daysAgo(21), [
      { exerciseId: benchId, setNumber: 1, weight: 20, reps: 10, isWarmup: true },
      { exerciseId: benchId, setNumber: 1, weight: 80, reps: 8 },
      { exerciseId: benchId, setNumber: 2, weight: 80, reps: 8 },
      { exerciseId: squatId, setNumber: 1, weight: 100, reps: 5 },
      { exerciseId: pressId, setNumber: 1, weight: 40, reps: 10 },
      { exerciseId: pressId, setNumber: 2, weight: 40, reps: 10 },
    ]);

    console.log("Seeding week 2 (squat only, set_number inserted out of order)…");
    await insertCompletedSession(clientA, a.data.user.id, programId, daysAgo(14), [
      { exerciseId: squatId, setNumber: 2, weight: 105, reps: 5 },
      { exerciseId: squatId, setNumber: 1, weight: 105, reps: 6 },
    ]);

    console.log("Seeding week 2.5 (press warmed up but never worked — must not shadow week 1)…");
    await insertCompletedSession(clientA, a.data.user.id, programId, daysAgo(10), [
      { exerciseId: pressId, setNumber: 1, weight: 20, reps: 10, isWarmup: true },
    ]);

    console.log("Seeding week 3 (completed, but empty)…");
    await insertCompletedSession(clientA, a.data.user.id, programId, daysAgo(7), []);

    console.log("\nCalling get_last_performance(program, [bench, squat, press, neverDone]):");
    const result = await clientA.rpc("get_last_performance", {
      p_program_id: programId,
      p_exercise_ids: [benchId, squatId, pressId, neverDoneId],
    });
    if (result.error) throw new Error(`get_last_performance: ${result.error.message}`);
    const rows = (result.data ?? []) as LastPerformanceRow[];

    const benchRows = rows.filter((r) => r.exercise_id === benchId);
    const squatRows = rows.filter((r) => r.exercise_id === squatId);
    const pressRows = rows.filter((r) => r.exercise_id === pressId);
    const neverDoneRows = rows.filter((r) => r.exercise_id === neverDoneId);

    check(
      benchRows.length === 2 && benchRows.every((r) => r.weight === 80 && r.reps === 8),
      "bench comes from week 1 (80×8, 80×8) — not week 3, which is empty",
    );
    check(!benchRows.some((r) => r.weight === 20), "bench's week-1 warmup set (20×10) never appears");
    check(
      squatRows.length === 2 && squatRows.every((r) => r.weight === 105),
      "squat comes from week 2 (105kg) — its own most recent, independent of bench's week 1",
    );
    check(
      squatRows.map((r) => r.set_number).join(",") === "1,2",
      "squat's sets come back in set_number order despite being inserted 2 then 1",
    );
    check(
      squatRows.find((r) => r.set_number === 1)?.reps === 6,
      "squat set 1 keeps its own reps (6), not swapped with set 2's (5)",
    );
    check(
      pressRows.length === 2 && pressRows.every((r) => r.weight === 40 && r.reps === 10),
      "press comes from week 1 (40×10, 40×10) — week 2.5's warmup-only session doesn't count as a performance",
    );
    check(
      !pressRows.some((r) => r.weight === 20),
      "press's week-2.5 warmup set (20×10) never appears, and doesn't shadow week 1 either",
    );
    check(neverDoneRows.length === 0, "an exercise never performed returns no rows");

    console.log("\nCross-user isolation — B must read zero rows for A's program:");
    const crossUser = await clientB.rpc("get_last_performance", {
      p_program_id: programId,
      p_exercise_ids: [benchId, squatId],
    });
    check(
      !crossUser.error && (crossUser.data?.length ?? 0) === 0,
      "calling with another user's program_id returns zero rows (RLS, not an explicit ownership check)",
    );
  } finally {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`get_last_performance test FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("get_last_performance test passed: per-exercise history resolves independently.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
