import { describe, expect, it } from "vitest";

import { hasTabBar, isPublicPath, isTabActive, TABS } from "./routes";

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

  it("allows the landing page at the bare domain", () => {
    expect(isPublicPath("/")).toBe(true);
  });

  it("allows the privacy policy", () => {
    expect(isPublicPath("/privacy")).toBe(true);
  });

  it("protects the home screen at its new path", () => {
    expect(isPublicPath("/home")).toBe(false);
  });

  // The whole reason `/` is special-cased to an exact match: every pathname in
  // the app starts with a slash, so running `/` through the same prefix test as
  // the other public bases would return true for all of them and open the
  // guard entirely. This is the assertion that catches that.
  it("does not let the landing page's `/` open every other route", () => {
    for (const path of ["/home", "/session", "/programs/123", "/settings"]) {
      expect(isPublicPath(path)).toBe(false);
    }
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

describe("TABS", () => {
  it("has one entry per top-level section, in display order", () => {
    expect(TABS.map((t) => t.href)).toEqual([
      "/home",
      "/programs",
      "/history",
      "/settings",
    ]);
  });
});

describe("isTabActive", () => {
  // Home used to live at "/", where a prefix test lit the Home tab on every
  // screen in the app. At "/home" that hazard is gone from this function —
  // `isPublicPath` is where it still has to be guarded against.
  it("matches Home on Home itself and nowhere else", () => {
    expect(isTabActive("/home", "/home")).toBe(true);
    expect(isTabActive("/home", "/programs")).toBe(false);
    expect(isTabActive("/home", "/history/abc")).toBe(false);
  });

  it("matches a section on its own path", () => {
    expect(isTabActive("/programs", "/programs")).toBe(true);
    expect(isTabActive("/history", "/history")).toBe(true);
    expect(isTabActive("/settings", "/settings")).toBe(true);
  });

  it("keeps a section lit for routes nested under it", () => {
    expect(isTabActive("/programs", "/programs/new")).toBe(true);
    expect(isTabActive("/programs", "/programs/abc/workouts/def")).toBe(true);
    expect(isTabActive("/programs", "/programs/abc/analytics")).toBe(true);
    expect(isTabActive("/history", "/history/abc")).toBe(true);
  });

  it("respects the path boundary", () => {
    expect(isTabActive("/settings", "/settings-export")).toBe(false);
    expect(isTabActive("/programs", "/programsomething")).toBe(false);
  });

  it("lights nothing during a session", () => {
    expect(TABS.some((t) => isTabActive(t.href, "/session"))).toBe(false);
  });
});

// Anything anchored to the bottom of the viewport — today the PWA install
// prompt — has to lift itself clear of the bar or it covers navigation
// entirely. That makes this predicate load-bearing for layout, not just for
// the bar's own rendering.
describe("hasTabBar", () => {
  it("is true on every ordinary signed-in screen", () => {
    for (const path of [
      "/home",
      "/programs",
      "/programs/new",
      "/programs/abc/workouts/def",
      "/history",
      "/history/abc",
      "/settings",
    ]) {
      expect(hasTabBar(path)).toBe(true);
    }
  });

  // The player owns the bottom of the screen (fixed entry deck), and a stray
  // tap on a tab would walk out of an in-progress session.
  it("is false in the session player", () => {
    expect(hasTabBar("/session")).toBe(false);
  });

  // The bar lives in the (app) layout, so the public routes never have one.
  it("is false on the public routes", () => {
    expect(hasTabBar("/")).toBe(false);
    expect(hasTabBar("/privacy")).toBe(false);
    expect(hasTabBar("/sign-in")).toBe(false);
    expect(hasTabBar("/auth/callback")).toBe(false);
  });
});
