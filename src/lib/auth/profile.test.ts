import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { profileFromUser } from "./profile";

// `profileFromUser` is the app-side twin of the handle_new_user trigger
// (migration 0002): given a freshly-authenticated user, derive the profiles row
// to seed. The two must agree, because this function is the self-heal path — if
// the trigger ever fails to fire, the (app) layout inserts the same row rather
// than crashing (ticket 005). These tests pin the derivation the trigger's SQL
// expresses: full_name over name, avatar_url over picture, everything optional.

// A minimal User stand-in — profileFromUser only reads `id` and `user_metadata`.
function user(metadata: Record<string, unknown>): Pick<
  User,
  "id" | "user_metadata"
> {
  return { id: "user-123", user_metadata: metadata };
}

describe("profileFromUser", () => {
  it("keys the row on the auth user id", () => {
    expect(profileFromUser(user({})).id).toBe("user-123");
  });

  it("prefers full_name for display_name", () => {
    const p = profileFromUser(
      user({ full_name: "Ada Lovelace", name: "ada" }),
    );
    expect(p.display_name).toBe("Ada Lovelace");
  });

  it("falls back to name when full_name is absent", () => {
    expect(profileFromUser(user({ name: "ada" })).display_name).toBe("ada");
  });

  it("prefers avatar_url for the avatar", () => {
    const p = profileFromUser(
      user({ avatar_url: "https://a/x.png", picture: "https://b/y.png" }),
    );
    expect(p.avatar_url).toBe("https://a/x.png");
  });

  it("falls back to picture when avatar_url is absent", () => {
    expect(profileFromUser(user({ picture: "https://b/y.png" })).avatar_url).toBe(
      "https://b/y.png",
    );
  });

  it("leaves display_name and avatar_url null when nothing is provided", () => {
    const p = profileFromUser(user({}));
    expect(p.display_name).toBeNull();
    expect(p.avatar_url).toBeNull();
  });

  it("treats empty strings as absent (never seeds a blank name)", () => {
    const p = profileFromUser(
      user({ full_name: "", name: "ada", avatar_url: "", picture: "pic" }),
    );
    expect(p.display_name).toBe("ada");
    expect(p.avatar_url).toBe("pic");
  });

  it("ignores non-string metadata values", () => {
    const p = profileFromUser(
      user({ full_name: 42, avatar_url: { href: "x" } }),
    );
    expect(p.display_name).toBeNull();
    expect(p.avatar_url).toBeNull();
  });

  it("does not set default_rest_seconds (the DB column default of 90 owns it)", () => {
    // Mirrors the trigger: the acceptance value 90 comes from the column
    // default, never from the insert payload.
    expect(profileFromUser(user({})).default_rest_seconds).toBeUndefined();
  });

  it("seeds locale from Accept-Language (pt* → pt-BR)", () => {
    // ADR-0005: the self-heal path creates the profile, so it must apply the
    // header-derived locale the SQL trigger cannot see.
    expect(profileFromUser(user({}), "pt-BR,en;q=0.8").locale).toBe("pt-BR");
    expect(profileFromUser(user({}), "en-US").locale).toBe("en");
  });

  it("defaults locale to en when no Accept-Language is supplied", () => {
    expect(profileFromUser(user({})).locale).toBe("en");
  });

  it("tolerates missing user_metadata", () => {
    // Supabase types user_metadata as always-present, but a defensive caller may
    // hand us undefined; deriving an id-only row must not throw.
    const p = profileFromUser({
      id: "user-123",
      user_metadata: undefined as unknown as User["user_metadata"],
    });
    expect(p.id).toBe("user-123");
    expect(p.display_name).toBeNull();
  });
});
