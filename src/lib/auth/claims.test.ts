import type { JwtPayload } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { userFromClaims } from "./claims";

// A realistically-shaped Supabase access-token payload. Built per-test so a
// mutation in one case can't leak into another.
function claims(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    iss: "https://project.supabase.co/auth/v1",
    sub: "6f1c2e3d-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
    aud: "authenticated",
    exp: 2000000000,
    iat: 1999996400,
    role: "authenticated",
    aal: "aal1",
    session_id: "b0a1c2d3-e4f5-6a7b-8c9d-0e1f2a3b4c5d",
    email: "lifter@example.com",
    ...overrides,
  } as JwtPayload;
}

// ADR-0006: these claims are verified locally rather than confirmed with the
// auth server, so this function is the whole gate between "a signature checked
// out" and "the app believes someone is signed in". Every rejection below is a
// case where a validly-signed token still must not read as a user.
describe("userFromClaims", () => {
  it("maps a verified authenticated token to a user", () => {
    expect(userFromClaims(claims())).toEqual({
      id: "6f1c2e3d-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      email: "lifter@example.com",
    });
  });

  it("returns null when there are no claims at all", () => {
    expect(userFromClaims(null)).toBeNull();
    expect(userFromClaims(undefined)).toBeNull();
  });

  // The anon key is a valid, correctly-signed JWT for the same project. It
  // verifies; it is not a user. This is the check that keeps local
  // verification from being weaker than getUser().
  it("rejects the anon role even though its signature is valid", () => {
    expect(userFromClaims(claims({ role: "anon" }))).toBeNull();
  });

  it("rejects the service_role token", () => {
    expect(userFromClaims(claims({ role: "service_role" }))).toBeNull();
  });

  it("fails closed when sub is missing or empty", () => {
    expect(userFromClaims(claims({ sub: "" }))).toBeNull();
    expect(
      userFromClaims(claims({ sub: undefined as unknown as string })),
    ).toBeNull();
  });

  it("treats a missing email as null rather than undefined", () => {
    expect(userFromClaims(claims({ email: undefined }))).toEqual({
      id: "6f1c2e3d-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      email: null,
    });
  });

  it("treats an empty email as null", () => {
    expect(userFromClaims(claims({ email: "" }))?.email).toBeNull();
  });
});
