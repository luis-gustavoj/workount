import { describe, expect, it } from "vitest";

import { detectPlatform, shouldShowInstallBanner } from "./install-prompt";

describe("detectPlatform", () => {
  it("recognises iPhone, iPad, and iPod user agents as iOS", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      ),
    ).toBe("ios");
    expect(
      detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"),
    ).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0)")).toBe(
      "ios",
    );
  });

  it("treats everything else as 'other', including desktop and Android", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120",
      ),
    ).toBe("other");
    expect(
      detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
    ).toBe("other");
  });
});

describe("shouldShowInstallBanner", () => {
  it("never shows once already running standalone", () => {
    expect(
      shouldShowInstallBanner({
        platform: "other",
        isStandalone: true,
        dismissed: false,
        hasInstallEvent: true,
      }),
    ).toBe(false);
  });

  it("never shows once dismissed, regardless of platform", () => {
    expect(
      shouldShowInstallBanner({
        platform: "ios",
        isStandalone: false,
        dismissed: true,
        hasInstallEvent: false,
      }),
    ).toBe(false);
  });

  it("shows iOS instructions even without a captured beforeinstallprompt event, since iOS never fires one", () => {
    expect(
      shouldShowInstallBanner({
        platform: "ios",
        isStandalone: false,
        dismissed: false,
        hasInstallEvent: false,
      }),
    ).toBe(true);
  });

  it("on other platforms, only shows once beforeinstallprompt has actually fired", () => {
    expect(
      shouldShowInstallBanner({
        platform: "other",
        isStandalone: false,
        dismissed: false,
        hasInstallEvent: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallBanner({
        platform: "other",
        isStandalone: false,
        dismissed: false,
        hasInstallEvent: true,
      }),
    ).toBe(true);
  });
});
