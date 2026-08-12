/**
 * test-analytics.ts — behavioral proof of the ticket-017 analytics SQL
 * (supabase/migrations/0006_analytics.sql). Run against a local Supabase
 * stack (`supabase db reset` first):
 *
 *   npm run test:analytics
 *
 * The fixture and every expected number live in scripts/seed-synthetic.ts:
 * eight weeks of plausible sessions, with the expectations written out by
 * hand rather than recomputed from the fixture. This file is only the
 * comparison.
 *
 * What it proves, against Postgres rather than a mock:
 *   - get_program_volume, get_exercise_progression, v_exercise_prs and
 *     get_program_adherence each return exactly the hand-calculated numbers;
 *   - WARMUPS CONTRIBUTE NOTHING, asserted explicitly and separately for
 *     every one of the four (the ticket's own acceptance criterion, because
 *     a volume figure 15% too high because warmups slipped in still looks
 *     entirely plausible on a chart);
 *   - a session containing only warmup sets scores 0 volume, produces no PR
 *     and contributes no progression point — while still counting as a
 *     session for adherence, which is what the definitions actually say;
 *   - an abandoned session is invisible to all four, however heavy;
 *   - Epley: 100kg × 5 → 116.67 and 110kg × 3 → 121.0, straight out of the
 *     SQL, on a fixture built to isolate exactly that comparison;
 *   - a second user passing a borrowed program_id gets zero rows from every
 *     function and view — RLS via security_invoker, not an app-level check.
 *
 * Exits non-zero on the first failed assertion.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { resolveConfig } from "./local-stack";
import {
  EXPECTED_ADHERENCE,
  EXPECTED_BENCH_PROGRESSION,
  EXPECTED_E1RM_REFERENCE,
  EXPECTED_PRS,
  EXPECTED_SQUAT_PROGRESSION,
  EXPECTED_TOTAL_VOLUME,
  EXPECTED_VOLUME,
  seedE1rmReference,
  seedSynthetic,
  type ExerciseKey,
  type ProgressionExpectation,
} from "./seed-synthetic";

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

/** e1RM is returned unrounded; compare at the precision the UI shows. */
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) < eps;

const DAY_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const { url, anonKey, serviceRoleKey } = resolveConfig();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = "analytics-test-password-123";
  const emailA = `analytics-a-${randomUUID()}@example.com`;
  const emailB = `analytics-b-${randomUUID()}@example.com`;
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
    const signInA = await clientA.auth.signInWithPassword({ email: emailA, password });
    if (signInA.error) throw new Error(`sign in A: ${signInA.error.message}`);
    const signInB = await clientB.auth.signInWithPassword({ email: emailB, password });
    if (signInB.error) throw new Error(`sign in B: ${signInB.error.message}`);

    console.log("Seeding the synthetic 8-week block…");
    const seed = await seedSynthetic(clientA, userId);
    const keyOf = (sessionId: string) =>
      Object.entries(seed.sessionIds).find(([, v]) => v === sessionId)?.[0] ??
      `?${sessionId}`;

    // ------------------------------------------------------------------
    // 1. get_program_volume — volume per completed session, chronological.
    // ------------------------------------------------------------------
    console.log("\nget_program_volume");
    const volume = await clientA.rpc("get_program_volume", {
      p_program_id: seed.programId,
    });
    if (volume.error) throw new Error(`get_program_volume: ${volume.error.message}`);
    const volumeRows = volume.data as Array<{
      session_id: string;
      completed_at: string;
      workout_name: string | null;
      total_volume: string | number;
    }>;

    check(
      volumeRows.length === EXPECTED_VOLUME.length,
      `${EXPECTED_VOLUME.length} rows, the abandoned session excluded (got ${volumeRows.length})`,
    );
    for (const [i, expected] of EXPECTED_VOLUME.entries()) {
      const row = volumeRows[i];
      check(
        !!row &&
          keyOf(row.session_id) === expected.key &&
          Number(row.total_volume) === expected.volume,
        `${expected.key} → ${expected.volume} (got ${
          row ? `${keyOf(row.session_id)} → ${row.total_volume}` : "no row"
        })`,
      );
    }
    const total = volumeRows.reduce((sum, r) => sum + Number(r.total_volume), 0);
    check(
      near(total, EXPECTED_TOTAL_VOLUME, 0.001),
      `block totals ${EXPECTED_TOTAL_VOLUME} (got ${total})`,
    );

    // Warmups, explicitly. Every squat session carries a 40 × 10 warmup worth
    // 400 of phantom volume, and the trap session is nothing but warmups.
    const trapRow = volumeRows.find((r) => keyOf(r.session_id) === "w4-warmup-only");
    check(
      !!trapRow && Number(trapRow.total_volume) === 0,
      `a session of nothing but warmups scores 0, not 800 (got ${trapRow?.total_volume})`,
    );
    check(
      !volumeRows.some((r) => keyOf(r.session_id) === "w3-abandoned"),
      "the abandoned session contributes no volume point at all",
    );

    // v_session_summary is in this ticket's scope too, reused from ticket 016
    // rather than redefined. get_program_volume only projects its
    // total_volume, so the other three columns are checked here directly —
    // against the trap session, which is where the warmup asymmetry shows:
    // volume counts working sets, set_count counts what the user performed.
    const trapSummary = await clientA
      .from("v_session_summary")
      .select("total_volume, set_count, exercise_count, duration_seconds")
      .eq("session_id", seed.sessionIds["w4-warmup-only"])
      .single();
    if (trapSummary.error)
      throw new Error(`v_session_summary: ${trapSummary.error.message}`);
    check(
      Number(trapSummary.data.total_volume) === 0,
      `warmup-only session: total_volume 0 (got ${trapSummary.data.total_volume})`,
    );
    check(
      trapSummary.data.set_count === 2,
      `warmup-only session: set_count still counts both warmups (got ${trapSummary.data.set_count})`,
    );
    check(
      trapSummary.data.exercise_count === 1,
      `warmup-only session: exercise_count 1 (got ${trapSummary.data.exercise_count})`,
    );
    check(
      trapSummary.data.duration_seconds === 3600,
      `warmup-only session: duration passes through (got ${trapSummary.data.duration_seconds})`,
    );

    // ------------------------------------------------------------------
    // 2. get_exercise_progression — top set and best e1RM, per session.
    // ------------------------------------------------------------------
    console.log("\nget_exercise_progression");
    const progressions: Array<[ExerciseKey, ProgressionExpectation[]]> = [
      ["squat", EXPECTED_SQUAT_PROGRESSION],
      ["bench", EXPECTED_BENCH_PROGRESSION],
    ];
    for (const [key, expectedRows] of progressions) {
      const result = await clientA.rpc("get_exercise_progression", {
        p_program_id: seed.programId,
        p_exercise_id: seed.exerciseIds[key],
      });
      if (result.error)
        throw new Error(`get_exercise_progression (${key}): ${result.error.message}`);
      const rows = result.data as Array<{
        session_id: string;
        top_set_weight: string | number;
        top_set_reps: number;
        best_e1rm: string | number;
      }>;

      check(
        rows.length === expectedRows.length,
        `${key}: ${expectedRows.length} points (got ${rows.length})`,
      );
      for (const [i, expected] of expectedRows.entries()) {
        const row = rows[i];
        check(
          !!row &&
            keyOf(row.session_id) === expected.key &&
            Number(row.top_set_weight) === expected.topSetWeight &&
            row.top_set_reps === expected.topSetReps &&
            near(Number(row.best_e1rm), expected.bestE1rm),
          `${key} ${expected.key}: top ${expected.topSetWeight}×${expected.topSetReps}, e1RM ${expected.bestE1rm} (got ${
            row
              ? `${keyOf(row.session_id)} top ${row.top_set_weight}×${row.top_set_reps}, e1RM ${row.best_e1rm}`
              : "no row"
          })`,
        );
      }

      // Warmups, explicitly. The squat warmup is 40kg; if it counted, the
      // warmup-only session would appear as an eighth point at 40 × 10.
      check(
        !rows.some((r) => keyOf(r.session_id) === "w4-warmup-only"),
        `${key}: the warmup-only session contributes no progression point`,
      );
      check(
        !rows.some((r) => keyOf(r.session_id) === "w3-abandoned"),
        `${key}: the abandoned session contributes no progression point`,
      );
      check(
        rows.every((r) => Number(r.top_set_weight) >= 50),
        `${key}: no point is a warmup weight (40kg squat / 20kg bench)`,
      );
    }

    // The ticket's e1RM acceptance case, isolated: one set per session so
    // there is nothing else the number could have come from.
    console.log("\nEpley, isolated");
    const ref = await seedE1rmReference(clientA, userId);
    const refResult = await clientA.rpc("get_exercise_progression", {
      p_program_id: ref.programId,
      p_exercise_id: ref.exerciseId,
    });
    if (refResult.error)
      throw new Error(`get_exercise_progression (reference): ${refResult.error.message}`);
    const refRows = refResult.data as Array<{
      session_id: string;
      top_set_weight: string | number;
      best_e1rm: string | number;
    }>;
    check(
      refRows.length === EXPECTED_E1RM_REFERENCE.length,
      `${EXPECTED_E1RM_REFERENCE.length} reference points (got ${refRows.length})`,
    );
    for (const [i, expected] of EXPECTED_E1RM_REFERENCE.entries()) {
      const row = refRows[i];
      check(
        !!row && near(Number(row.best_e1rm), expected.e1rm),
        `${expected.weight}kg × ${expected.reps} → ${expected.e1rm} (got ${row?.best_e1rm})`,
      );
    }
    check(
      refRows.length === 2 &&
        Number(refRows[1].best_e1rm) > Number(refRows[0].best_e1rm) &&
        Number(refRows[1].top_set_weight) > Number(refRows[0].top_set_weight),
      "110 × 3 outscores 100 × 5 — the reason the chart plots e1RM, not raw weight",
    );

    // ------------------------------------------------------------------
    // 3. v_exercise_prs — the three kinds, tracked separately.
    // ------------------------------------------------------------------
    console.log("\nv_exercise_prs");
    const prs = await clientA
      .from("v_exercise_prs")
      .select("*")
      .in("exercise_id", [seed.exerciseIds.squat, seed.exerciseIds.bench]);
    if (prs.error) throw new Error(`v_exercise_prs: ${prs.error.message}`);
    const prRows = prs.data as Array<Record<string, string | number | null>>;
    check(prRows.length === 2, `one PR row per exercise (got ${prRows.length})`);

    for (const key of ["squat", "bench"] as const) {
      const expected = EXPECTED_PRS[key];
      const row = prRows.find((r) => r.exercise_id === seed.exerciseIds[key]);
      if (!row) {
        check(false, `${key}: has a PR row`);
        continue;
      }
      check(
        Number(row.heaviest_weight) === expected.heaviestWeight &&
          Number(row.heaviest_reps) === expected.heaviestReps &&
          keyOf(row.heaviest_session_id as string) === expected.heaviestSessionKey,
        `${key} heaviest set: ${expected.heaviestWeight} × ${expected.heaviestReps} in ${expected.heaviestSessionKey} (got ${row.heaviest_weight} × ${row.heaviest_reps} in ${keyOf(row.heaviest_session_id as string)})`,
      );
      check(
        near(Number(row.best_e1rm), expected.bestE1rm) &&
          keyOf(row.best_e1rm_session_id as string) === expected.bestE1rmSessionKey,
        `${key} best e1RM: ${expected.bestE1rm} in ${expected.bestE1rmSessionKey} (got ${row.best_e1rm} in ${keyOf(row.best_e1rm_session_id as string)})`,
      );
      check(
        Number(row.most_reps) === expected.mostReps &&
          Number(row.most_reps_weight) === expected.mostRepsWeight &&
          keyOf(row.most_reps_session_id as string) === expected.mostRepsSessionKey,
        `${key} most reps: ${expected.mostReps} @ ${expected.mostRepsWeight} in ${expected.mostRepsSessionKey} (got ${row.most_reps} @ ${row.most_reps_weight} in ${keyOf(row.most_reps_session_id as string)})`,
      );
    }

    // Warmups, explicitly. This is where they do the most damage: the squat
    // warmup is 10 reps against working fives, and the bench warmup is 20
    // reps against everything. If either leaked in it would OWN the reps PR.
    const squatPr = prRows.find((r) => r.exercise_id === seed.exerciseIds.squat)!;
    const benchPr = prRows.find((r) => r.exercise_id === seed.exerciseIds.bench)!;
    check(
      Number(squatPr.most_reps) !== 10 && Number(squatPr.most_reps_weight) !== 40,
      "squat reps PR is a working five, not the 40kg × 10 warmup",
    );
    check(
      Number(benchPr.most_reps) !== 20 && Number(benchPr.most_reps_weight) !== 20,
      "bench reps PR is the 50 × 15 back-off, not the 20kg × 20 warmup",
    );
    check(
      Number(squatPr.heaviest_weight) !== 200,
      "the 200kg squat in the abandoned session is not a PR",
    );
    const trapSessionId = seed.sessionIds["w4-warmup-only"];
    check(
      !prRows.some((r) =>
        [r.heaviest_session_id, r.best_e1rm_session_id, r.most_reps_session_id].includes(
          trapSessionId,
        ),
      ),
      "no PR of any kind is credited to the warmup-only session",
    );

    // Cross-checked against the per-session badge RPC from ticket 016: a
    // session of only warmups must badge nothing there either, or history
    // and analytics would disagree about the same session.
    const trapPrs = await clientA.rpc("get_session_prs", {
      p_session_id: trapSessionId,
    });
    if (trapPrs.error) throw new Error(`get_session_prs (trap): ${trapPrs.error.message}`);
    check(
      (trapPrs.data as unknown[]).length === 0,
      "get_session_prs badges nothing in the warmup-only session",
    );

    // ------------------------------------------------------------------
    // 4. get_program_adherence — completed vs scheduled, per ISO week.
    // ------------------------------------------------------------------
    console.log("\nget_program_adherence");
    const adherence = await clientA.rpc("get_program_adherence", {
      p_program_id: seed.programId,
    });
    if (adherence.error)
      throw new Error(`get_program_adherence: ${adherence.error.message}`);
    const adherenceRows = adherence.data as Array<{
      week_start: string;
      completed_sessions: number;
      scheduled_workouts: number;
      adherence: string | number | null;
    }>;

    check(
      adherenceRows.length === EXPECTED_ADHERENCE.length,
      `${EXPECTED_ADHERENCE.length} contiguous weeks, gaps included (got ${adherenceRows.length})`,
    );
    for (const [i, expected] of EXPECTED_ADHERENCE.entries()) {
      const row = adherenceRows[i];
      const wantWeek = new Date(
        seed.week1Monday.getTime() + (expected.weekIndex - 1) * 7 * DAY_MS,
      )
        .toISOString()
        .slice(0, 10);
      check(
        !!row &&
          row.week_start === wantWeek &&
          row.completed_sessions === expected.completed &&
          row.scheduled_workouts === expected.scheduled &&
          near(Number(row.adherence), expected.adherence),
        `week ${expected.weekIndex} (${wantWeek}): ${expected.completed}/${expected.scheduled} = ${expected.adherence} (got ${
          row
            ? `${row.week_start} ${row.completed_sessions}/${row.scheduled_workouts} = ${row.adherence}`
            : "no row"
        })`,
      );
    }

    // The unscheduled workout must not be an obligation.
    check(
      adherenceRows.every((r) => r.scheduled_workouts === 2),
      'the day_of_week-less "Optional Arms" workout stays out of the denominator',
    );
    // Week 3 had three sessions, one of them abandoned.
    check(
      adherenceRows[2]?.completed_sessions === 2,
      "an abandoned session does not count as a completed one",
    );
    // Warmups, explicitly — the one place they are NOT excluded, because the
    // definition counts sessions, not sets. Week 4's third session is the
    // warmup-only one, and it is why that week reads 3/2 rather than 2/2.
    check(
      adherenceRows[3]?.completed_sessions === 3 &&
        near(Number(adherenceRows[3]?.adherence), 1.5),
      "adherence counts sessions, so the warmup-only session still counts (3/2 = 1.5, uncapped)",
    );
    // The skipped week and the untrained current week.
    check(
      adherenceRows[5]?.completed_sessions === 0,
      "the skipped week is a zero row, not a missing one",
    );
    check(
      adherenceRows[8]?.completed_sessions === 0,
      "the current week reports 0/2 rather than the series stopping early",
    );

    // ------------------------------------------------------------------
    // 5. Cross-user access with a borrowed program_id → zero rows.
    // ------------------------------------------------------------------
    console.log("\nUser B, holding user A's program id…");
    const bVolume = await clientB.rpc("get_program_volume", {
      p_program_id: seed.programId,
    });
    check(
      bVolume.error === null && (bVolume.data as unknown[]).length === 0,
      "get_program_volume returns zero rows",
    );
    const bProgression = await clientB.rpc("get_exercise_progression", {
      p_program_id: seed.programId,
      p_exercise_id: seed.exerciseIds.squat,
    });
    check(
      bProgression.error === null && (bProgression.data as unknown[]).length === 0,
      "get_exercise_progression returns zero rows",
    );
    const bAdherence = await clientB.rpc("get_program_adherence", {
      p_program_id: seed.programId,
    });
    check(
      bAdherence.error === null && (bAdherence.data as unknown[]).length === 0,
      "get_program_adherence returns zero rows",
    );
    const bPrs = await clientB
      .from("v_exercise_prs")
      .select("exercise_id")
      .in("exercise_id", [seed.exerciseIds.squat, seed.exerciseIds.bench]);
    check(
      bPrs.error === null && (bPrs.data ?? []).length === 0,
      "v_exercise_prs returns zero rows",
    );
  } finally {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`analytics test FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log(
    "analytics test passed: every number matches the hand-calculated fixture, " +
      "warmups contribute nothing anywhere, and RLS isolates every function.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
