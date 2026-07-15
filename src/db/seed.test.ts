import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Structural guard for supabase/seed.sql (ticket 004). There is no local
// Postgres in this test environment, so these tests do not execute the SQL —
// they parse it and assert the properties the acceptance criteria depend on:
// a global catalog of ~60 rows, valid enum values, stable unique UUIDs,
// case-insensitively unique names (the exercise is the identity key for all
// progress tracking — two "Bench Press" rows silently split a user's chart),
// and an idempotent ON CONFLICT clause so re-running the seed changes nothing.

// Must mirror the CHECK constraints in supabase/migrations/0001_init.sql.
const MUSCLE_GROUPS = new Set([
  "chest",
  "back",
  "shoulders",
  "quads",
  "hamstrings",
  "glutes",
  "biceps",
  "triceps",
  "core",
  "calves",
  "other",
]);
const EQUIPMENT = new Set([
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "other",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SeedRow = {
  id: string;
  userId: string;
  name: string;
  muscleGroup: string;
  equipment: string;
};

const seedFile = readFileSync(
  path.join(process.cwd(), "supabase", "seed.sql"),
  "utf8",
);

// Strip `--` line comments before inspecting the SQL, so prose in the header
// (which legitimately mentions gen_random_uuid, ON CONFLICT, etc.) can't be
// mistaken for the executable statements. The seed uses no `--` inside string
// literals, so a line-oriented strip is safe here.
const seedSql = seedFile.replace(/--[^\n]*/g, "");

// Rows are written in a strict, regular shape:
//   ('<uuid>', null, 'Name', 'muscle_group', 'equipment')
// Names never contain a single quote (see the seed), so a non-greedy [^']
// capture is unambiguous.
function parseRows(sql: string): SeedRow[] {
  const rowRe =
    /\(\s*'([0-9a-f-]+)'\s*,\s*(null)\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/gi;
  const rows: SeedRow[] = [];
  for (const m of sql.matchAll(rowRe)) {
    rows.push({
      id: m[1],
      userId: m[2],
      name: m[3],
      muscleGroup: m[4],
      equipment: m[5],
    });
  }
  return rows;
}

const rows = parseRows(seedSql);

describe("supabase/seed.sql — exercise catalog", () => {
  it("seeds roughly 60 exercises", () => {
    expect(rows.length).toBeGreaterThanOrEqual(55);
  });

  it("is idempotent: inserts with ON CONFLICT DO NOTHING", () => {
    expect(seedSql.toLowerCase()).toMatch(/on\s+conflict[\s\S]*?do\s+nothing/);
  });

  it("only seeds global rows (user_id IS NULL)", () => {
    for (const r of rows) {
      expect(r.userId.toLowerCase()).toBe("null");
    }
  });

  it("uses only enumerated muscle_group values", () => {
    for (const r of rows) {
      expect(MUSCLE_GROUPS, `${r.name}: ${r.muscleGroup}`).toContain(
        r.muscleGroup,
      );
    }
  });

  it("uses only enumerated equipment values", () => {
    for (const r of rows) {
      expect(EQUIPMENT, `${r.name}: ${r.equipment}`).toContain(r.equipment);
    }
  });

  it("uses stable, well-formed UUIDs (not gen_random_uuid())", () => {
    expect(seedSql.toLowerCase()).not.toContain("gen_random_uuid");
    for (const r of rows) {
      expect(r.id, r.name).toMatch(UUID_RE);
    }
  });

  it("gives every row a distinct UUID", () => {
    const ids = rows.map((r) => r.id.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no two names that collide case-insensitively", () => {
    // Mirrors the DB's UNIQUE (user_id, lower(name)) NULLS NOT DISTINCT — and
    // guards the split-progression trap from the ticket.
    const names = rows.map((r) => r.name.toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("disambiguates same-movement lifts by equipment prefix", () => {
    const names = new Set(rows.map((r) => r.name));
    // The canonical example from the ticket: "bench" must resolve to two clearly
    // distinct rows, never a single bare "Bench Press".
    expect(names).toContain("Barbell Bench Press");
    expect(names).toContain("Dumbbell Bench Press");
    expect(names.has("Bench Press")).toBe(false);
  });

  it("covers the minimum catalog named in the ticket", () => {
    const names = new Set(rows.map((r) => r.name));
    const required = [
      // barbell
      "Barbell Back Squat",
      "Barbell Front Squat",
      "Barbell Bench Press",
      "Barbell Incline Bench Press",
      "Barbell Deadlift",
      "Barbell Romanian Deadlift",
      "Barbell Overhead Press",
      "Barbell Bent-Over Row",
      "Barbell Hip Thrust",
      "Barbell Curl",
      // dumbbell
      "Dumbbell Bench Press",
      "Dumbbell Incline Bench Press",
      "Dumbbell Shoulder Press",
      "Dumbbell Lateral Raise",
      "Dumbbell Rear Delt Fly",
      "Dumbbell Row",
      "Dumbbell Curl",
      "Dumbbell Hammer Curl",
      "Dumbbell Bulgarian Split Squat",
      "Dumbbell Romanian Deadlift",
      // machine / cable
      "Lat Pulldown",
      "Seated Cable Row",
      "Leg Press",
      "Leg Extension",
      "Leg Curl",
      "Machine Chest Press",
      "Pec Deck",
      "Cable Fly",
      "Tricep Pushdown",
      "Cable Lateral Raise",
      "Face Pull",
      // bodyweight
      "Pull-Up",
      "Chin-Up",
      "Dip",
      "Push-Up",
      "Plank",
      "Hanging Leg Raise",
      // other
      "Standing Calf Raise",
      "Seated Calf Raise",
      "Kettlebell Swing",
      "Farmers Carry",
    ];
    const missing = required.filter((n) => !names.has(n));
    expect(missing).toEqual([]);
  });
});
