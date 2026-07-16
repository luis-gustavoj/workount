import { describe, expect, it } from "vitest";

import { sessionIdSchema } from "./history";

describe("sessionIdSchema", () => {
  it("accepts a valid uuid", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(sessionIdSchema.parse({ id })).toEqual({ id });
  });

  it("rejects a non-uuid, missing, or null id", () => {
    expect(() => sessionIdSchema.parse({ id: "123" })).toThrow();
    expect(() => sessionIdSchema.parse({ id: null })).toThrow();
    expect(() => sessionIdSchema.parse({})).toThrow();
  });
});
