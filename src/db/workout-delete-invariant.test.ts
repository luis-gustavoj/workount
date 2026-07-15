import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "0001_init.sql"),
  "utf8",
);

describe("workout delete invariant (ADR-0002)", () => {
  it("sessions.workout_id uses ON DELETE SET NULL so history survives", () => {
    const sessionsBlock = migrationSql
      .substring(migrationSql.indexOf("create table sessions"))
      .substring(0, migrationSql.substring(migrationSql.indexOf("create table sessions")).indexOf(");") + 2);

    expect(sessionsBlock).toMatch(
      /workout_id\s+uuid\s+references\s+workouts\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/i,
    );
  });

  it("sessions.workout_id does NOT cascade (would destroy history)", () => {
    const sessionsBlock = migrationSql
      .substring(migrationSql.indexOf("create table sessions"))
      .substring(0, migrationSql.substring(migrationSql.indexOf("create table sessions")).indexOf(");") + 2);

    expect(sessionsBlock).not.toMatch(
      /workout_id[\s\S]*?on\s+delete\s+cascade/i,
    );
  });

  it("workouts.program_id cascades (deleting a program removes its workouts)", () => {
    const workoutsBlock = migrationSql
      .substring(migrationSql.indexOf("create table workouts"))
      .substring(0, migrationSql.substring(migrationSql.indexOf("create table workouts")).indexOf(");") + 2);

    expect(workoutsBlock).toMatch(
      /program_id\s+uuid\s+not\s+null\s+references\s+programs\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });
});
