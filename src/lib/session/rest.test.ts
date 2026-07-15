import { describe, expect, it } from "vitest";

import { elapsedFraction, formatRestClock, remaining, restEndsAtFor } from "./rest";

// The pure math for the rest timer (ticket 013). Kept side-effect-free and
// separate from the store (store.ts persists restEndsAt) and the component
// (rest-timer.tsx ticks a render clock and fires vibrate/notify) — see
// player.test.ts for the sibling pattern this follows.

describe("remaining", () => {
  it("is positive before restEndsAt", () => {
    expect(remaining(90_000, 0)).toBe(90);
  });

  it("is zero exactly at restEndsAt", () => {
    expect(remaining(90_000, 90_000)).toBe(0);
  });

  it("goes negative past restEndsAt instead of clamping to 0 (ticket 013: overtime)", () => {
    expect(remaining(90_000, 113_000)).toBe(-23);
  });

  it("rounds to the nearest second", () => {
    expect(remaining(90_400, 0)).toBe(90);
    expect(remaining(90_600, 0)).toBe(91);
  });
});

describe("restEndsAtFor", () => {
  it("is now plus restSeconds, in epoch ms", () => {
    expect(restEndsAtFor(90, 1_000)).toBe(91_000);
  });
});

describe("formatRestClock", () => {
  it("formats whole minutes and seconds, zero-padded", () => {
    expect(formatRestClock(90)).toBe("1:30");
    expect(formatRestClock(5)).toBe("0:05");
    expect(formatRestClock(0)).toBe("0:00");
  });

  it("prefixes overtime (negative) seconds with a sign, using the elapsed magnitude", () => {
    expect(formatRestClock(-23)).toBe("+0:23");
    expect(formatRestClock(-90)).toBe("+1:30");
  });
});

describe("elapsedFraction", () => {
  it("is 0 at the start of the rest", () => {
    expect(elapsedFraction(0, 90_000, 0)).toBe(0);
  });

  it("is 0.5 halfway through", () => {
    expect(elapsedFraction(0, 90_000, 45_000)).toBe(0.5);
  });

  it("clamps to 1 exactly at and past restEndsAt (overtime reads as a full ring)", () => {
    expect(elapsedFraction(0, 90_000, 90_000)).toBe(1);
    expect(elapsedFraction(0, 90_000, 200_000)).toBe(1);
  });

  it("uses restStartedAt, not the whole-timeline origin, as the baseline", () => {
    expect(elapsedFraction(10_000, 100_000, 55_000)).toBe(0.5);
  });

  it("grows the effective total when restEndsAt moves via a +15s adjustment, without needing a separately-tracked duration", () => {
    // 45s into a rest that started as 90s (restStartedAt=0, restEndsAt=90_000)
    // and was then extended: total is now restEndsAt - restStartedAt, derived
    // fresh each call — no stale "original duration" to fall out of sync.
    expect(elapsedFraction(0, 105_000, 45_000)).toBeCloseTo(45 / 105);
  });

  it("does not divide by zero when restStartedAt and restEndsAt coincide", () => {
    expect(elapsedFraction(50_000, 50_000, 50_000)).toBe(1);
  });
});
