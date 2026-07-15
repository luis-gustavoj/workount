import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Structural guard for supabase/migrations/0002_handle_new_user.sql (ticket 005).
// There is no local Postgres in this test environment, so this does not execute
// the SQL — it parses the migration and asserts the properties the acceptance
// criteria and the security notes depend on. These are exactly the details that
// are invisible in dev and "surprise you once" in production: without them,
// sign-up fails for every user, or opens a privilege-escalation hole.
//
// The runtime proof that the trigger actually creates the row lives in the RLS
// integration script (npm run test:rls) and the manual acceptance walk; this
// test pins the migration's shape so a careless edit can't quietly drop one of
// the load-bearing clauses.

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "0002_handle_new_user.sql",
  ),
  "utf8",
);

// Strip `--` line comments so the prose header (which legitimately mentions
// SECURITY DEFINER, search_path, etc. while explaining them) can't be mistaken
// for the executable statements. No `--` appears inside a string literal here.
const sql = migration.replace(/--[^\n]*/g, "");
const lower = sql.toLowerCase();

describe("0002_handle_new_user.sql — profile-creation trigger", () => {
  it("defines the trigger function in the public schema", () => {
    expect(lower).toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.handle_new_user\s*\(/,
    );
  });

  it("runs as SECURITY DEFINER (RLS would otherwise reject the insert)", () => {
    // Without DEFINER the insert into RLS-protected public.profiles is rejected
    // during sign-up — because there is no auth.uid() yet — and sign-up fails
    // for every user.
    expect(lower).toMatch(/security\s+definer/);
  });

  it("pins search_path to empty (closes the privilege-escalation hole)", () => {
    // DEFINER escalates privilege, so an unpinned search_path could resolve an
    // unqualified `profiles` to an attacker's table.
    expect(lower).toMatch(/set\s+search_path\s*=\s*''/);
  });

  it("fully qualifies the target table as public.profiles", () => {
    expect(lower).toMatch(/insert\s+into\s+public\.profiles/);
  });

  it("never inserts into an unqualified `profiles` (search_path is empty)", () => {
    // With search_path = '', an unqualified reference would not even resolve.
    // Guard against a future edit dropping the schema qualifier.
    expect(lower).not.toMatch(/insert\s+into\s+profiles\b/);
  });

  it("seeds display_name from full_name, then name", () => {
    // Order matters: Google prefers full_name; name is the fallback.
    const fullNameIdx = sql.indexOf("'full_name'");
    const nameIdx = sql.indexOf("'name'");
    expect(fullNameIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeGreaterThan(fullNameIdx);
  });

  it("seeds avatar_url from avatar_url, then picture", () => {
    const avatarIdx = sql.indexOf("'avatar_url'");
    const pictureIdx = sql.indexOf("'picture'");
    expect(avatarIdx).toBeGreaterThanOrEqual(0);
    expect(pictureIdx).toBeGreaterThan(avatarIdx);
  });

  it("reads identity from raw_user_meta_data", () => {
    expect(lower).toContain("raw_user_meta_data");
  });

  it("is idempotent: ON CONFLICT (id) DO NOTHING (no duplicate on 2nd sign-in)", () => {
    expect(lower).toMatch(/on\s+conflict\s*\(\s*id\s*\)\s*do\s+nothing/);
  });

  it("does not set default_rest_seconds (relies on the column default of 90)", () => {
    // The acceptance criterion default_rest_seconds = 90 is satisfied by the
    // table default; the trigger must not restate it.
    expect(lower).not.toContain("default_rest_seconds");
  });

  it("fires AFTER INSERT on auth.users, for each row", () => {
    expect(lower).toMatch(/after\s+insert\s+on\s+auth\.users/);
    expect(lower).toMatch(/for\s+each\s+row/);
    expect(lower).toMatch(/execute\s+function\s+public\.handle_new_user\s*\(/);
  });

  it("drops the trigger first, so the migration is safe to re-run", () => {
    expect(lower).toMatch(
      /drop\s+trigger\s+if\s+exists\s+on_auth_user_created\s+on\s+auth\.users/,
    );
  });
});
