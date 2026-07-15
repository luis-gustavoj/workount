import { describe, expect, it } from "vitest";

import {
  createProgramSchema,
  programIdSchema,
  updateProgramSchema,
  PROGRAM_NAME_MAX,
} from "./program";

// The Zod boundary for every program mutation (ticket 006). The Server Actions
// trust nothing that hasn't passed through here, so these tests pin the two
// things the actions depend on: a name is a required, trimmed, bounded string,
// and a blank description collapses to NULL (we never store "" — an empty
// description and "no description" are the same thing and must look the same in
// the database).

describe("createProgramSchema", () => {
  it("accepts a name with an optional description", () => {
    const parsed = createProgramSchema.parse({
      name: "PPL — Summer",
      description: "Six weeks of push/pull/legs.",
    });
    expect(parsed).toEqual({
      name: "PPL — Summer",
      description: "Six weeks of push/pull/legs.",
    });
  });

  it("trims surrounding whitespace from the name", () => {
    expect(createProgramSchema.parse({ name: "  PPL  " }).name).toBe("PPL");
  });

  it("rejects an empty name", () => {
    expect(() => createProgramSchema.parse({ name: "" })).toThrow();
  });

  it("rejects a whitespace-only name (trims before the length check)", () => {
    expect(() => createProgramSchema.parse({ name: "   " })).toThrow();
  });

  it("rejects a missing name", () => {
    expect(() => createProgramSchema.parse({})).toThrow();
  });

  it("rejects a name longer than the maximum", () => {
    expect(() =>
      createProgramSchema.parse({ name: "x".repeat(PROGRAM_NAME_MAX + 1) }),
    ).toThrow();
  });

  it("accepts a name exactly at the maximum", () => {
    const name = "x".repeat(PROGRAM_NAME_MAX);
    expect(createProgramSchema.parse({ name }).name).toBe(name);
  });

  it("collapses a missing description to null", () => {
    expect(createProgramSchema.parse({ name: "PPL" }).description).toBeNull();
  });

  it("collapses an empty-string description to null", () => {
    expect(
      createProgramSchema.parse({ name: "PPL", description: "" }).description,
    ).toBeNull();
  });

  it("collapses a whitespace-only description to null", () => {
    expect(
      createProgramSchema.parse({ name: "PPL", description: "   " }).description,
    ).toBeNull();
  });

  it("trims a real description", () => {
    expect(
      createProgramSchema.parse({ name: "PPL", description: "  hi  " })
        .description,
    ).toBe("hi");
  });

  it("collapses a null description (a missing FormData field) to null", () => {
    expect(
      createProgramSchema.parse({ name: "PPL", description: null }).description,
    ).toBeNull();
  });
});

describe("updateProgramSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("requires a valid uuid id alongside the fields", () => {
    const parsed = updateProgramSchema.parse({ id, name: "Renamed" });
    expect(parsed).toEqual({ id, name: "Renamed", description: null });
  });

  it("rejects a non-uuid id", () => {
    expect(() =>
      updateProgramSchema.parse({ id: "not-a-uuid", name: "Renamed" }),
    ).toThrow();
  });

  it("still enforces the name rules", () => {
    expect(() => updateProgramSchema.parse({ id, name: "" })).toThrow();
  });
});

describe("programIdSchema", () => {
  it("accepts a uuid", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(programIdSchema.parse({ id })).toEqual({ id });
  });

  it("rejects anything that is not a uuid", () => {
    expect(() => programIdSchema.parse({ id: "123" })).toThrow();
    expect(() => programIdSchema.parse({ id: null })).toThrow();
    expect(() => programIdSchema.parse({})).toThrow();
  });
});
