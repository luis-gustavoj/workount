import { describe, expect, it } from "vitest";

import { isPublicPath } from "./proxy";

// `isPublicPath` is the pure decision at the heart of the auth guard: given a
// pathname, may an unauthenticated visitor reach it? Everything protectable in
// the app funnels through this, so it is worth pinning down precisely —
// especially the prefix boundaries, where a sloppy `startsWith` would
// accidentally expose (or lock out) whole route trees.
describe("isPublicPath", () => {
  it("allows the sign-in page", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
  });

  it("allows the OAuth callback under /auth", () => {
    expect(isPublicPath("/auth/callback")).toBe(true);
  });

  it("protects the home screen", () => {
    expect(isPublicPath("/")).toBe(false);
  });

  it.each(["/programs", "/programs/123", "/session", "/history"])(
    "protects %s",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it("does not treat a prefix-collision as public", () => {
    // "/sign-in-later" must not match "/sign-in"; "/authored" must not match
    // "/auth". Boundary is exact match or a following slash.
    expect(isPublicPath("/sign-in-later")).toBe(false);
    expect(isPublicPath("/authored")).toBe(false);
  });
});
