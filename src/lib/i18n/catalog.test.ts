import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import ptBR from "../../../messages/pt-BR.json";

// The enum DB values, copied verbatim from supabase/migrations/0001_init.sql.
// ADR-0005: these stay English *keys* in Postgres and are translated as display
// labels here — every value must have a label in every locale, or the exercise
// picker renders a raw key like "hamstrings" to a Portuguese user. This test is
// the drift guard between the schema's CHECK constraints and the catalog.
const MUSCLE_GROUPS = [
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
] as const;

const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "other",
] as const;

const catalogs = { en, "pt-BR": ptBR } as const;

// Collect every leaf key path in an object, e.g. "SignIn.tagline".
function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object"
      ? keyPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

describe("message catalogs", () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    describe(locale, () => {
      it("labels every muscle_group DB value", () => {
        for (const value of MUSCLE_GROUPS) {
          expect(catalog.muscle_group[value]).toBeTruthy();
        }
        // No extra keys the schema doesn't have (a stale label after an enum change).
        expect(Object.keys(catalog.muscle_group).sort()).toEqual(
          [...MUSCLE_GROUPS].sort(),
        );
      });

      it("labels every equipment DB value", () => {
        for (const value of EQUIPMENT) {
          expect(catalog.equipment[value]).toBeTruthy();
        }
        expect(Object.keys(catalog.equipment).sort()).toEqual(
          [...EQUIPMENT].sort(),
        );
      });
    });
  }

  it("en and pt-BR have identical key structure (no untranslated gaps)", () => {
    expect(keyPaths(ptBR).sort()).toEqual(keyPaths(en).sort());
  });
});
