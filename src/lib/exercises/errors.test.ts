import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
  it("recognizes Postgres' unique_violation code", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("rejects other Postgres error codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
