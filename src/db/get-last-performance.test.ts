import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Structural guard for supabase/migrations/0003_get_last_performance.sql
// (ticket 010). There is no local Postgres in this test environment — the
// behavioral proof (seed sessions across several weeks, assert each exercise's
// reference comes from its own most recent performance, warmups excluded,
// cross-user isolation) lives in scripts/test-last-performance.ts, run
// against a real stack via `npm run test:last-performance`. This test parses
// the migration and pins the properties the ticket's acceptance depends on
// structurally, so a careless edit can't quietly reintroduce the naive
// "single latest session" implementation the ticket warns about.

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "0003_get_last_performance.sql",
  ),
  "utf8",
);

// Strip `--` line comments so prose in the header (which legitimately
// discusses DISTINCT ON, completed_at, etc. while explaining them) can't be
// mistaken for the executable statements. No `--` appears inside a string
// literal in this migration.
const sql = migration.replace(/--[^\n]*/g, "");
const lower = sql.toLowerCase();

describe("0003_get_last_performance.sql — get_last_performance RPC", () => {
  it("defines the function in the public schema with the spec'd params", () => {
    expect(lower).toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.get_last_performance\s*\(/,
    );
    expect(lower).toMatch(/p_program_id\s+uuid/);
    expect(lower).toMatch(/p_exercise_ids\s+uuid\s*\[\s*\]/);
  });

  it("returns the columns docs/SPEC.md §3 promises, correctly typed", () => {
    const returnsIdx = lower.indexOf("returns table");
    const languageIdx = lower.indexOf("language sql", returnsIdx);
    expect(returnsIdx).toBeGreaterThanOrEqual(0);
    expect(languageIdx).toBeGreaterThan(returnsIdx);

    const returnsBlock = lower.substring(returnsIdx, languageIdx);
    expect(returnsBlock).toMatch(/exercise_id\s+uuid/);
    expect(returnsBlock).toMatch(/set_number\s+int/);
    expect(returnsBlock).toMatch(/weight\s+numeric/);
    expect(returnsBlock).toMatch(/reps\s+int/);
    expect(returnsBlock).toMatch(/performed_at\s+timestamptz/);
  });

  it("runs as SECURITY INVOKER, not DEFINER (RLS must still gate every row)", () => {
    // The ticket is explicit: "A user must not be able to read another
    // user's history by passing their program id." SECURITY DEFINER would
    // run as the function owner and bypass the sessions/session_sets RLS
    // policies that are the only thing enforcing that boundary here.
    expect(lower).toMatch(/security\s+invoker/);
    expect(lower).not.toMatch(/security\s+definer/);
  });

  it("finds the most recent session PER EXERCISE, not the single latest session", () => {
    // This is the whole ticket. A naive `ORDER BY completed_at DESC LIMIT 1`
    // over one session finds nothing for any exercise that session didn't
    // include. DISTINCT ON (exercise_id), ordered per-exercise by
    // completed_at DESC, is what makes bench and squat resolve independently.
    expect(lower).toMatch(/distinct\s+on\s*\(\s*\w+\.exercise_id\s*\)/);
  });

  it("orders the per-exercise session pick by completed_at DESC", () => {
    const distinctIdx = lower.indexOf("distinct on");
    const orderIdx = lower.indexOf("order by", distinctIdx);
    expect(distinctIdx).toBeGreaterThanOrEqual(0);
    expect(orderIdx).toBeGreaterThan(distinctIdx);

    const orderClause = lower.substring(orderIdx, orderIdx + 120);
    expect(orderClause).toMatch(/exercise_id/);
    expect(orderClause).toMatch(/completed_at\s+desc/);
  });

  it("scopes to the given program and only completed sessions", () => {
    // ADR-0004: analytics (and this reference) are scoped to a program.
    expect(lower).toMatch(/program_id\s*=\s*p_program_id/);
    expect(lower).toMatch(/status\s*=\s*'completed'/);
  });

  it("excludes warmup sets both when picking the session and when returning sets", () => {
    // Filtering warmups only at the outer layer is not enough: a session
    // where the lift was only warmed up (never worked) must not "count" as
    // the last performance either, or a real working performance further
    // back gets shadowed by an empty result for that exercise.
    const occurrences = lower.match(/is_warmup\s*=\s*false/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("returns sets in set_number order", () => {
    // Ticket: "Unit-test the ordering by seeding sets deliberately out of
    // insertion order and asserting they come back by set_number." This is
    // the static half of that; scripts/test-last-performance.ts is the
    // behavioral half, which actually scrambles insertion order.
    const lastOrderBy = lower.lastIndexOf("order by");
    expect(lastOrderBy).toBeGreaterThanOrEqual(0);
    expect(lower.substring(lastOrderBy)).toMatch(/set_number/);
  });

  it("grants execute to authenticated only, never anon (ADR-0003: no anon access)", () => {
    expect(lower).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.get_last_performance/,
    );
    const grantIdx = lower.indexOf("grant execute");
    const grantLine = lower.substring(grantIdx, lower.indexOf(";", grantIdx));
    expect(grantLine).not.toMatch(/\banon\b/);
    expect(grantLine).toMatch(/\bauthenticated\b/);
  });

  it("pins search_path (defense in depth against search_path confusion)", () => {
    expect(lower).toMatch(/set\s+search_path\s*=\s*''/);
  });
});
