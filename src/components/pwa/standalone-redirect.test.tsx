import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StandaloneRedirect } from "./standalone-redirect";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

/** Both signals the browser can give us that this is an installed launch. */
function setInstalled({
  displayMode,
  iosStandalone,
}: {
  displayMode: boolean;
  iosStandalone: boolean;
}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: displayMode && query === "(display-mode: standalone)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("navigator", { ...navigator, standalone: iosStandalone });
}

beforeEach(() => {
  replace.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StandaloneRedirect", () => {
  it("leaves a browser tab on the landing page", () => {
    setInstalled({ displayMode: false, iosStandalone: false });
    render(<StandaloneRedirect />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects an Android/desktop installed launch to /home", () => {
    setInstalled({ displayMode: true, iosStandalone: false });
    render(<StandaloneRedirect />);
    expect(replace).toHaveBeenCalledWith("/home");
  });

  // The case that caused the bug: iOS bookmarks the URL that was open when the
  // user tapped "Add to Home Screen" and ignores start_url, so the shortcut
  // points at "/" — and matchMedia does not report standalone there.
  it("redirects an iOS installed launch, which only sets navigator.standalone", () => {
    setInstalled({ displayMode: false, iosStandalone: true });
    render(<StandaloneRedirect />);
    expect(replace).toHaveBeenCalledWith("/home");
  });
});
