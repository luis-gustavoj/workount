import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StandaloneRedirect,
  redirectInstalledLaunch,
} from "./standalone-redirect";

const replace = vi.fn();

/** Everything the guard reads: the path, and both installed-launch signals. */
function setEnvironment({
  pathname = "/",
  displayMode = false,
  iosStandalone = false,
}: {
  pathname?: string;
  displayMode?: boolean;
  iosStandalone?: boolean;
}) {
  vi.stubGlobal("location", { pathname, replace });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: displayMode && query === "(display-mode: standalone)",
    media: query,
  }));
  vi.stubGlobal("navigator", { ...navigator, standalone: iosStandalone });
}

beforeEach(() => {
  replace.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redirectInstalledLaunch", () => {
  it("leaves a browser tab on the landing page", () => {
    setEnvironment({});
    redirectInstalledLaunch();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects an Android/desktop installed launch to /home", () => {
    setEnvironment({ displayMode: true });
    redirectInstalledLaunch();
    expect(replace).toHaveBeenCalledWith("/home");
  });

  // The case that caused the bug: iOS bookmarks the URL open at "Add to Home
  // Screen" time and ignores start_url, so the shortcut points at "/" — and
  // matchMedia does not report standalone there.
  it("redirects an iOS installed launch, which only sets navigator.standalone", () => {
    setEnvironment({ iosStandalone: true });
    redirectInstalledLaunch();
    expect(replace).toHaveBeenCalledWith("/home");
  });

  it("leaves other public pages alone — /privacy is fine to read while installed", () => {
    setEnvironment({ pathname: "/privacy", displayMode: true });
    redirectInstalledLaunch();
    expect(replace).not.toHaveBeenCalled();
  });

  it("falls back to showing the page when the browser throws", () => {
    vi.stubGlobal("location", { pathname: "/", replace });
    vi.stubGlobal("matchMedia", () => {
      throw new Error("unsupported");
    });
    expect(() => redirectInstalledLaunch()).not.toThrow();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("StandaloneRedirect", () => {
  // The flash this whole component exists to remove comes back the moment the
  // guard is deferred, so assert it ships as a blocking inline script rather
  // than anything that waits for hydration.
  it("renders the guard inline, self-invoking, with no src or defer", () => {
    const { container } = render(<StandaloneRedirect />);
    const script = container.querySelector("script");

    expect(script).not.toBeNull();
    expect(script?.hasAttribute("src")).toBe(false);
    expect(script?.hasAttribute("defer")).toBe(false);
    expect(script?.hasAttribute("async")).toBe(false);
    expect(script?.innerHTML).toContain("(display-mode: standalone)");
    expect(script?.innerHTML).toMatch(/^\(function[\s\S]*\)\(\)$/);
  });
});
