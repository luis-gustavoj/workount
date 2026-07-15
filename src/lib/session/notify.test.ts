import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notifyRestComplete, requestRestNotificationPermission } from "./notify";

// Vibrate + push notification on rest complete (ticket 013). Both are
// best-effort — see the ticket's "notification caveat" — so these tests only
// cover what's under our control: firing (or not firing) the right browser
// API given its current permission/availability state. jsdom has neither
// `navigator.vibrate` nor `Notification` by default, so each is stubbed here
// rather than in the shared test/setup.ts (only this module cares).

describe("requestRestNotificationPermission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests permission when it hasn't been decided yet", () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });

    requestRestNotificationPermission();

    expect(requestPermission).toHaveBeenCalled();
  });

  it("does not re-prompt once permission has already been granted", () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });

    requestRestNotificationPermission();

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("does not re-prompt once permission has already been denied", () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });

    requestRestNotificationPermission();

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("is a no-op when the Notification API doesn't exist", () => {
    vi.stubGlobal("Notification", undefined);
    expect(() => requestRestNotificationPermission()).not.toThrow();
  });
});

describe("notifyRestComplete", () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vibrate.mockClear();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("vibrates and fires a notification when permission is granted", () => {
    const NotificationSpy = vi.fn();
    vi.stubGlobal("Notification", Object.assign(NotificationSpy, { permission: "granted" }));

    notifyRestComplete("Rest complete", "Time for your next set.");

    expect(vibrate).toHaveBeenCalled();
    expect(NotificationSpy).toHaveBeenCalledWith(
      "Rest complete",
      expect.objectContaining({ body: "Time for your next set." }),
    );
  });

  it("still vibrates when notification permission was never granted", () => {
    const NotificationSpy = vi.fn();
    vi.stubGlobal("Notification", Object.assign(NotificationSpy, { permission: "denied" }));

    notifyRestComplete("Rest complete", "Time for your next set.");

    expect(vibrate).toHaveBeenCalled();
    expect(NotificationSpy).not.toHaveBeenCalled();
  });

  it("does not throw when neither API exists", () => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
    vi.stubGlobal("Notification", undefined);

    expect(() => notifyRestComplete("Rest complete", "Time for your next set.")).not.toThrow();
  });
});
