import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Structural guard for supabase/migrations/0005_history.sql (ticket 016).
// There is no local Postgres in this test environment — see
// src/db/get-last-performance.test.ts for why this project's migration
// tests are grep-based, and scripts/test-history.ts for the behavioral half
// (run against a real stack via `npm run test:history`).

const migration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "0005_history.sql"),
  "utf8",
);

// Strip `--` line comments so prose in the header can't be mistaken for
// executable statements. No `--` appears inside a string literal here.
const sql = migration.replace(/--[^\n]*/g, "");
const lower = sql.toLowerCase();

describe("0005_history.sql — v_session_summary", () => {
  it("defines the view in the public schema", () => {
    expect(lower).toMatch(
      /create\s+(or\s+replace\s+)?view\s+public\.v_session_summary/,
    );
  });

  it("runs with security_invoker (RLS must still gate every row)", () => {
    // Without this a view runs as its owner — on Supabase, a role that
    // bypasses RLS — and every user's sessions would be readable through it.
    expect(lower).toMatch(/with\s*\(\s*security_invoker\s*=\s*true\s*\)/);
  });

  it("left-joins workouts, so a deleted workout (workout_id NULL) still summarizes", () => {
    expect(lower).toMatch(
      /left\s+join\s+public\.workouts\s+w\s+on\s+w\.id\s*=\s*s\.workout_id/,
    );
    // Every join to workouts in this migration must be that LEFT join — an
    // inner join would drop the row entirely once workout_id goes NULL,
    // which is exactly the invariant this ticket exists to protect.
    const allJoinsToWorkouts =
      lower.match(/\bjoin\s+public\.workouts\b/g) ?? [];
    const leftJoinsToWorkouts =
      lower.match(/\bleft\s+join\s+public\.workouts\b/g) ?? [];
    expect(allJoinsToWorkouts.length).toBe(leftJoinsToWorkouts.length);
    expect(allJoinsToWorkouts.length).toBeGreaterThan(0);
  });

  it("excludes warmups from total_volume only (ADR-0004), not from set_count/exercise_count", () => {
    const viewIdx = lower.indexOf(
      "create or replace view public.v_session_summary",
    );
    const grantIdx = lower.indexOf("grant select on public.v_session_summary");
    const viewBody = lower.substring(viewIdx, grantIdx);

    expect(viewBody).toMatch(
      /sum\(\s*ss\.weight\s*\*\s*ss\.reps\s*\)\s*filter\s*\(\s*where\s+ss\.is_warmup\s*=\s*false\s*\)/,
    );
    // set_count / exercise_count must not also be filtered to working sets —
    // the ticket's own warning: a warmup that vanishes from the set count
    // reads to the user as a dropped set.
    expect(viewBody).toMatch(/count\(\s*ss\.id\s*\)\s+as\s+set_count/);
    expect(viewBody).toMatch(
      /count\(\s*distinct\s+ss\.exercise_id\s*\)\s+as\s+exercise_count/,
    );
  });

  it("grants select to authenticated and service_role, never anon", () => {
    const grantIdx = lower.indexOf("grant select on public.v_session_summary");
    expect(grantIdx).toBeGreaterThanOrEqual(0);
    const grantLine = lower.substring(grantIdx, lower.indexOf(";", grantIdx));
    expect(grantLine).toMatch(/\bauthenticated\b/);
    expect(grantLine).toMatch(/\bservice_role\b/);
    expect(grantLine).not.toMatch(/\banon\b/);
  });
});

describe("0005_history.sql — get_session_prs", () => {
  it("defines the function in the public schema with the spec'd param", () => {
    expect(lower).toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.get_session_prs\s*\(\s*p_session_id\s+uuid\s*\)/,
    );
  });

  it("returns session_set_id, uuid", () => {
    const returnsIdx = lower.indexOf("returns table");
    const languageIdx = lower.indexOf("language sql", returnsIdx);
    expect(returnsIdx).toBeGreaterThanOrEqual(0);
    expect(languageIdx).toBeGreaterThan(returnsIdx);
    expect(lower.substring(returnsIdx, languageIdx)).toMatch(
      /session_set_id\s+uuid/,
    );
  });

  it("runs as SECURITY INVOKER, not DEFINER", () => {
    const fnIdx = lower.indexOf(
      "create or replace function public.get_session_prs",
    );
    const grantIdx = lower.indexOf(
      "grant execute on function public.get_session_prs",
    );
    const body = lower.substring(fnIdx, grantIdx);
    expect(body).toMatch(/security\s+invoker/);
    expect(body).not.toMatch(/security\s+definer/);
  });

  it("excludes warmups on both the session's own best and the prior-history comparison", () => {
    const occurrences = lower.match(/is_warmup\s*=\s*false/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("only counts prior sessions completed strictly before this one (as-of-the-time PR)", () => {
    expect(lower).toMatch(/ps\.completed_at\s*<\s*s\.completed_at/);
  });

  it("is NOT scoped to a program — a PR is per exercise, across the user's whole history (ADR-0002 corollary)", () => {
    const fnIdx = lower.indexOf(
      "create or replace function public.get_session_prs",
    );
    const grantIdx = lower.indexOf(
      "grant execute on function public.get_session_prs",
    );
    const body = lower.substring(fnIdx, grantIdx);
    expect(body).not.toMatch(/program_id/);
  });

  it("only counts completed sessions as prior history", () => {
    expect(lower).toMatch(/ps\.status\s*=\s*'completed'/);
  });

  it("pins search_path (defense in depth against search_path confusion)", () => {
    const fnIdx = lower.indexOf(
      "create or replace function public.get_session_prs",
    );
    expect(lower.substring(fnIdx)).toMatch(/set\s+search_path\s*=\s*''/);
  });

  it("grants execute to authenticated only, never anon", () => {
    const grantIdx = lower.indexOf(
      "grant execute on function public.get_session_prs",
    );
    expect(grantIdx).toBeGreaterThanOrEqual(0);
    const grantLine = lower.substring(grantIdx, lower.indexOf(";", grantIdx));
    expect(grantLine).toMatch(/\bauthenticated\b/);
    expect(grantLine).not.toMatch(/\banon\b/);
  });
});
